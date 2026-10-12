'use strict';

const {
  db,
  resetDatabase,
  signIn,
  createDestination,
  createRequirement,
  createTraveller,
  createBooking,
  createOperator,
  daysFromNow,
} = require('./helpers');

beforeEach(resetDatabase);

describe('passport masking', () => {
  it('masks the passport number in list responses for everyone', async () => {
    const actor = await signIn({ role: 'admin' });
    await createTraveller({ passportNumber: 'PA1234567' });

    const response = await actor.as('get', '/travellers');

    expect(response.body.data[0].passportNumber).toMatch(/^•+567$/);
    expect(response.body.data[0].passportMasked).toBe(true);
  });

  it('shows the full number to a consultant on the detail endpoint', async () => {
    const actor = await signIn({ role: 'consultant' });
    const traveller = await createTraveller({ passportNumber: 'PA1234567' });

    const response = await actor.as('get', `/travellers/${traveller.id}`);

    expect(response.body.data.traveller.passportNumber).toBe('PA1234567');
    expect(response.body.data.traveller.passportMasked).toBe(false);
  });

  it('keeps it masked for finance, who have no need for it', async () => {
    const actor = await signIn({ role: 'finance' });
    const traveller = await createTraveller({ passportNumber: 'PA1234567' });

    const response = await actor.as('get', `/travellers/${traveller.id}`);

    expect(response.body.data.traveller.passportNumber).not.toBe('PA1234567');
    expect(response.body.data.traveller.passportMasked).toBe(true);
  });
});

describe('traveller CRUD', () => {
  it('creates a traveller and records who did it', async () => {
    const actor = await signIn({ role: 'consultant' });

    const response = await actor.as('post', '/travellers').send({
      firstName: 'Pratik',
      lastName: 'Thapa Magar',
      email: 'Pratik@Example.com',
      nationality: 'au',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.traveller.email).toBe('pratik@example.com');
    expect(response.body.data.traveller.nationality).toBe('AU');

    const stored = await db.Traveller.findByPk(response.body.data.traveller.id);
    expect(String(stored.createdByUserId)).toBe(String(actor.user.id));
  });

  it('refuses creation by finance', async () => {
    const actor = await signIn({ role: 'finance' });
    const response = await actor
      .as('post', '/travellers')
      .send({ firstName: 'A', lastName: 'B' });
    expect(response.status).toBe(403);
  });

  it('validates dates and email format', async () => {
    const actor = await signIn({ role: 'consultant' });

    const response = await actor.as('post', '/travellers').send({
      firstName: 'A',
      lastName: 'B',
      dateOfBirth: '14/03/1990',
      email: 'not-an-email',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.details.dateOfBirth).toBeTruthy();
    expect(response.body.error.details.email).toBeTruthy();
  });

  it('deactivates rather than deleting', async () => {
    const actor = await signIn({ role: 'consultant' });
    const traveller = await createTraveller();

    const response = await actor.as('delete', `/travellers/${traveller.id}`);

    expect(response.body.data.traveller.isActive).toBe(false);
    expect(await db.Traveller.count({ where: { id: traveller.id } })).toBe(1);
  });

  it('searches by name', async () => {
    const actor = await signIn({ role: 'consultant' });
    await createTraveller({ firstName: 'Tenzing', lastName: 'Norgay' });
    await createTraveller({ firstName: 'Edmund', lastName: 'Hillary' });

    const response = await actor.as('get', '/travellers?q=Norgay');
    expect(response.body.data).toHaveLength(1);
  });
});

describe('documents', () => {
  it('records a document and can verify it', async () => {
    const consultant = await signIn({ role: 'consultant' });
    const coordinator = await signIn({ role: 'coordinator' });
    const traveller = await createTraveller();
    const destination = await createDestination();

    const created = await consultant.as('post', `/travellers/${traveller.id}/documents`).send({
      type: 'insurance',
      destinationId: String(destination.id),
      reference: 'POL-99887',
      issuer: 'Example Insurance',
      expiresOn: daysFromNow(200),
      altitudeCoverMetres: 6000,
      insurerContactPhone: '+61 2 5550 1234',
    });

    expect(created.status).toBe(201);
    const documentId = created.body.data.document.id;

    const verified = await coordinator
      .as('post', `/travellers/${traveller.id}/documents/${documentId}/verify`)
      .send({ approved: true });

    expect(verified.status).toBe(200);
    expect(verified.body.data.document.status).toBe('verified');
    expect(verified.body.data.document.verifiedBy.id).toBe(String(coordinator.user.id));
  });

  it('does not let a consultant verify a document they could have entered', async () => {
    const consultant = await signIn({ role: 'consultant' });
    const traveller = await createTraveller();
    const document = await db.TravellerDocument.create({
      travellerId: traveller.id,
      type: 'insurance',
      status: 'submitted',
    });

    const response = await consultant
      .as('post', `/travellers/${traveller.id}/documents/${document.id}/verify`)
      .send({ approved: true });

    expect(response.status).toBe(403);
  });

  it('refuses to verify an expired document', async () => {
    const coordinator = await signIn({ role: 'coordinator' });
    const traveller = await createTraveller();
    const document = await db.TravellerDocument.create({
      travellerId: traveller.id,
      type: 'visa',
      status: 'submitted',
      expiresOn: daysFromNow(-1),
    });

    const response = await coordinator
      .as('post', `/travellers/${traveller.id}/documents/${document.id}/verify`)
      .send({ approved: true });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('DOCUMENT_EXPIRED');
  });

  it('drops verification when the substance of the document changes', async () => {
    const coordinator = await signIn({ role: 'coordinator' });
    const traveller = await createTraveller();
    const document = await db.TravellerDocument.create({
      travellerId: traveller.id,
      type: 'insurance',
      status: 'verified',
      verifiedAt: new Date(),
      verifiedByUserId: coordinator.user.id,
      altitudeCoverMetres: 6000,
    });

    const response = await coordinator
      .as('patch', `/travellers/${traveller.id}/documents/${document.id}`)
      .send({ altitudeCoverMetres: 3000 });

    expect(response.status).toBe(200);
    expect(response.body.data.document.status).toBe('submitted');
    expect(response.body.data.document.verifiedAt).toBeNull();
  });

  it('reports an expired document as expired regardless of stored status', async () => {
    const actor = await signIn({ role: 'consultant' });
    const traveller = await createTraveller();
    await db.TravellerDocument.create({
      travellerId: traveller.id,
      type: 'visa',
      status: 'verified',
      expiresOn: daysFromNow(-5),
    });

    const response = await actor.as('get', `/travellers/${traveller.id}/documents`);

    expect(response.body.data[0].effectiveStatus).toBe('expired');
    expect(response.body.data[0].isExpired).toBe(true);
  });
});

describe('documents linked to an operator confirmation', () => {
  it('links a permit to the arrangement that produced it', async () => {
    const consultant = await signIn({ role: 'consultant' });
    const traveller = await createTraveller();
    const destination = await createDestination();
    const operator = await createOperator(destination.id);
    const booking = await createBooking({ consultantId: consultant.user.id, travellers: [traveller] });
    const confirmation = await consultant.as('post', '/operators/confirmations').send({
      bookingId: String(booking.id),
      operatorId: String(operator.id),
      summary: 'Sagarmatha national park permit',
    });
    const confirmationId = confirmation.body.data.confirmation.id;

    const created = await consultant.as('post', `/travellers/${traveller.id}/documents`).send({
      type: 'permit',
      operatorConfirmationId: confirmationId,
    });

    expect(created.status).toBe(201);
    expect(created.body.data.document.operatorConfirmationId).toBe(confirmationId);
    expect(created.body.data.document.operatorConfirmation.summary).toBe(
      'Sagarmatha national park permit'
    );

    const confirmationView = await consultant.as(
      'get',
      `/operators/confirmations/${confirmationId}`
    );
    expect(confirmationView.body.data.confirmation.documents).toHaveLength(1);
    expect(confirmationView.body.data.confirmation.documents[0].type).toBe('permit');

    // The traveller's own document list carries the link too, not just the
    // single-document view — the staff Documents panel reads from this list.
    const documentList = await consultant.as('get', `/travellers/${traveller.id}/documents`);
    expect(documentList.body.data[0].operatorConfirmation.summary).toBe(
      'Sagarmatha national park permit'
    );

    // And the booking's own readiness view shows it from the operator side —
    // the one screen meant to tie booking, operator and document together.
    const readiness = await consultant.as('get', `/operators/bookings/${booking.id}/readiness`);
    const seen = readiness.body.data.confirmations.find((row) => row.id === confirmationId);
    expect(seen.documents).toHaveLength(1);
    expect(seen.documents[0].type).toBe('permit');
  });

  it('moves the link when a document is reassigned to a different confirmation', async () => {
    const consultant = await signIn({ role: 'consultant' });
    const traveller = await createTraveller();
    const destination = await createDestination();
    const operator = await createOperator(destination.id);
    const booking = await createBooking({ consultantId: consultant.user.id, travellers: [traveller] });

    const first = await consultant.as('post', '/operators/confirmations').send({
      bookingId: String(booking.id),
      operatorId: String(operator.id),
      summary: 'First arrangement',
    });
    const second = await consultant.as('post', '/operators/confirmations').send({
      bookingId: String(booking.id),
      operatorId: String(operator.id),
      summary: 'Second arrangement',
    });

    const created = await consultant.as('post', `/travellers/${traveller.id}/documents`).send({
      type: 'permit',
      operatorConfirmationId: first.body.data.confirmation.id,
    });
    const documentId = created.body.data.document.id;

    const moved = await consultant
      .as('patch', `/travellers/${traveller.id}/documents/${documentId}`)
      .send({ operatorConfirmationId: second.body.data.confirmation.id });

    expect(moved.body.data.document.operatorConfirmationId).toBe(
      second.body.data.confirmation.id
    );

    const firstView = await consultant.as(
      'get',
      `/operators/confirmations/${first.body.data.confirmation.id}`
    );
    const secondView = await consultant.as(
      'get',
      `/operators/confirmations/${second.body.data.confirmation.id}`
    );
    expect(firstView.body.data.confirmation.documents).toHaveLength(0);
    expect(secondView.body.data.confirmation.documents).toHaveLength(1);
  });

  it('refuses to link a document to a confirmation that does not exist', async () => {
    const consultant = await signIn({ role: 'consultant' });
    const traveller = await createTraveller();

    const response = await consultant.as('post', `/travellers/${traveller.id}/documents`).send({
      type: 'permit',
      operatorConfirmationId: '999999',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_OPERATOR_CONFIRMATION');
  });
});

describe('document review routing', () => {
  it('assigns a document to a reviewer, resolving the booking automatically', async () => {
    const consultant = await signIn({ role: 'consultant' });
    const coordinator = await signIn({ role: 'coordinator' });
    const traveller = await createTraveller();
    await createBooking({ travellers: [traveller] });
    const document = await db.TravellerDocument.create({
      travellerId: traveller.id,
      type: 'visa',
      status: 'submitted',
    });

    const response = await consultant
      .as('post', `/travellers/${traveller.id}/documents/${document.id}/assign-reviewer`)
      .send({ userId: String(coordinator.user.id) });

    expect(response.status).toBe(200);
    expect(response.body.data.task.documentId).toBe(String(document.id));
    expect(response.body.data.task.assignee.id).toBe(String(coordinator.user.id));
    expect(response.body.data.task.category).toBe('documents');

    const list = await consultant.as('get', `/tasks?documentId=${document.id}`);
    expect(list.body.data).toHaveLength(1);
  });

  it('asks for the booking when the traveller is on more than one active trip', async () => {
    const consultant = await signIn({ role: 'consultant' });
    const coordinator = await signIn({ role: 'coordinator' });
    const traveller = await createTraveller();
    await createBooking({ travellers: [traveller] });
    await createBooking({ travellers: [traveller] });
    const document = await db.TravellerDocument.create({
      travellerId: traveller.id,
      type: 'visa',
      status: 'submitted',
    });

    const response = await consultant
      .as('post', `/travellers/${traveller.id}/documents/${document.id}/assign-reviewer`)
      .send({ userId: String(coordinator.user.id) });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('BOOKING_REQUIRED');
  });

  it('reassigns the same task rather than raising a duplicate', async () => {
    const consultant = await signIn({ role: 'consultant' });
    const first = await signIn({ role: 'coordinator' });
    const second = await signIn({ role: 'coordinator' });
    const traveller = await createTraveller();
    await createBooking({ travellers: [traveller] });
    const document = await db.TravellerDocument.create({
      travellerId: traveller.id,
      type: 'visa',
      status: 'submitted',
    });

    await consultant
      .as('post', `/travellers/${traveller.id}/documents/${document.id}/assign-reviewer`)
      .send({ userId: String(first.user.id) });
    const second_response = await consultant
      .as('post', `/travellers/${traveller.id}/documents/${document.id}/assign-reviewer`)
      .send({ userId: String(second.user.id) });

    expect(second_response.status).toBe(200);
    const list = await consultant.as('get', `/tasks?documentId=${document.id}&status=all`);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].assignee.id).toBe(String(second.user.id));
  });

  it('closes the review task once the document is verified', async () => {
    const consultant = await signIn({ role: 'consultant' });
    const coordinator = await signIn({ role: 'coordinator' });
    const traveller = await createTraveller();
    await createBooking({ travellers: [traveller] });
    const document = await db.TravellerDocument.create({
      travellerId: traveller.id,
      type: 'visa',
      status: 'submitted',
    });

    await consultant
      .as('post', `/travellers/${traveller.id}/documents/${document.id}/assign-reviewer`)
      .send({ userId: String(coordinator.user.id) });

    await coordinator
      .as('post', `/travellers/${traveller.id}/documents/${document.id}/verify`)
      .send({ approved: true });

    const list = await consultant.as('get', `/tasks?documentId=${document.id}&status=all`);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].status).toBe('done');
  });
});

describe('document checklist', () => {
  async function nepalWithRules() {
    const destination = await createDestination({ code: 'NP', maxAltitudeMetres: 5644 });
    await createRequirement(destination.id, {
      type: 'passport',
      name: 'Valid passport',
      minValidityMonths: 6,
      leadTimeDays: 60,
    });
    await createRequirement(destination.id, {
      type: 'insurance',
      name: 'High-altitude trekking cover',
      requiresAltitudeCover: true,
      leadTimeDays: 21,
    });
    return destination;
  }

  describe('when a traveller holds more than one document of a kind', () => {
    async function visaItem(actor, traveller, destination) {
      const response = await actor.as(
        'get',
        `/travellers/${traveller.id}/document-checklist?destinationIds=${destination.id}&departureDate=${daysFromNow(90)}&returnDate=${daysFromNow(110)}`
      );
      return response.body.data.items.find((item) => item.requirement.type === 'visa');
    }

    async function nepalNeedingVisa() {
      const destination = await createDestination({ code: 'NP' });
      await createRequirement(destination.id, { type: 'visa', name: 'Nepal tourist visa' });
      return destination;
    }

    const visa = (traveller, destination, fields) =>
      db.TravellerDocument.create({
        travellerId: traveller.id,
        destinationId: destination.id,
        type: 'visa',
        ...fields,
      });

    it('reports the replacement, not the rejected one it replaces', async () => {
      const actor = await signIn({ role: 'consultant' });
      const destination = await nepalNeedingVisa();
      const traveller = await createTraveller();
      await visa(traveller, destination, { status: 'rejected', notes: 'Photo page is cut off.' });
      const replacement = await visa(traveller, destination, { status: 'submitted' });

      const item = await visaItem(actor, traveller, destination);

      // Before this, the checklist described whichever row came back first —
      // the rejected one — so a traveller who re-sent a document saw no change.
      expect(item.status).toBe('submitted');
      expect(item.documentId).toBe(String(replacement.id));
    });

    it('stays satisfied by a verified document when a newer one is still being checked', async () => {
      const actor = await signIn({ role: 'consultant' });
      const destination = await nepalNeedingVisa();
      const traveller = await createTraveller();
      const good = await visa(traveller, destination, {
        status: 'verified',
        expiresOn: daysFromNow(400),
      });
      await visa(traveller, destination, { status: 'submitted' });

      const item = await visaItem(actor, traveller, destination);

      // Sending a second copy must not make a trip that was ready look unready.
      expect(item.satisfied).toBe(true);
      expect(item.documentId).toBe(String(good.id));
    });

    it('reports the newer one when the verified document will not do', async () => {
      const actor = await signIn({ role: 'consultant' });
      const destination = await nepalNeedingVisa();
      const traveller = await createTraveller();
      await visa(traveller, destination, { status: 'verified', expiresOn: daysFromNow(30) });
      const renewed = await visa(traveller, destination, { status: 'submitted' });

      const item = await visaItem(actor, traveller, destination);

      expect(item.status).toBe('submitted');
      expect(item.documentId).toBe(String(renewed.id));
      expect(item.issues).toEqual([]);
    });
  });

  it('lists what is missing', async () => {
    const actor = await signIn({ role: 'consultant' });
    const destination = await nepalWithRules();
    const traveller = await createTraveller({ passportNumber: null, passportExpiry: null });

    const response = await actor.as(
      'get',
      `/travellers/${traveller.id}/document-checklist?destinationIds=${destination.id}&departureDate=${daysFromNow(90)}&returnDate=${daysFromNow(110)}`
    );

    expect(response.status).toBe(200);
    expect(response.body.data.summary.outstanding).toBe(2);
    expect(response.body.data.summary.ready).toBe(false);
    expect(response.body.data.items.map((i) => i.status).sort()).toEqual(['missing', 'missing']);
  });

  it('falls back to the passport on the traveller record', async () => {
    const actor = await signIn({ role: 'consultant' });
    const destination = await nepalWithRules();
    const traveller = await createTraveller({
      passportNumber: 'PA1234567',
      passportExpiry: daysFromNow(900),
    });

    const response = await actor.as(
      'get',
      `/travellers/${traveller.id}/document-checklist?destinationIds=${destination.id}&departureDate=${daysFromNow(90)}&returnDate=${daysFromNow(110)}`
    );

    const passportItem = response.body.data.items.find((i) => i.requirement.type === 'passport');
    expect(passportItem.status).toBe('on_file');
    expect(passportItem.satisfied).toBe(true);
  });

  it('flags a passport that expires inside the six-month validity window', async () => {
    const actor = await signIn({ role: 'consultant' });
    const destination = await nepalWithRules();
    const traveller = await createTraveller({
      passportNumber: 'PA1234567',
      // Valid at the time of travel, but not for six months beyond the return.
      passportExpiry: daysFromNow(150),
    });

    const response = await actor.as(
      'get',
      `/travellers/${traveller.id}/document-checklist?destinationIds=${destination.id}&departureDate=${daysFromNow(90)}&returnDate=${daysFromNow(110)}`
    );

    const passportItem = response.body.data.items.find((i) => i.requirement.type === 'passport');
    expect(passportItem.satisfied).toBe(false);
    expect(passportItem.issues[0]).toMatch(/6 months/);
  });

  it('flags insurance whose altitude cover is below the itinerary', async () => {
    const actor = await signIn({ role: 'consultant' });
    const destination = await nepalWithRules();
    const traveller = await createTraveller();
    await db.TravellerDocument.create({
      travellerId: traveller.id,
      destinationId: destination.id,
      type: 'insurance',
      status: 'verified',
      expiresOn: daysFromNow(300),
      altitudeCoverMetres: 4000,
      insurerContactPhone: '+61 2 5550 1234',
    });

    const response = await actor.as(
      'get',
      `/travellers/${traveller.id}/document-checklist?destinationIds=${destination.id}&departureDate=${daysFromNow(90)}&maxAltitudeMetres=5364`
    );

    const insurance = response.body.data.items.find((i) => i.requirement.requiresAltitudeCover);
    expect(insurance.satisfied).toBe(false);
    // Thousands separators and a space before the unit — these strings are read
    // by travellers on a phone, not only by staff.
    expect(insurance.issues.join(' ')).toMatch(
      /Altitude cover is 4,000 m but the itinerary reaches 5,364 m\./
    );
  });

  it('flags insurance with no insurer contact number', async () => {
    const actor = await signIn({ role: 'consultant' });
    const destination = await nepalWithRules();
    const traveller = await createTraveller();
    await db.TravellerDocument.create({
      travellerId: traveller.id,
      destinationId: destination.id,
      type: 'insurance',
      status: 'verified',
      expiresOn: daysFromNow(300),
      altitudeCoverMetres: 6000,
      insurerContactPhone: null,
    });

    const response = await actor.as(
      'get',
      `/travellers/${traveller.id}/document-checklist?destinationIds=${destination.id}`
    );

    const insurance = response.body.data.items.find((i) => i.requirement.requiresAltitudeCover);
    expect(insurance.issues).toContain('No insurer contact number recorded.');
  });

  it('marks an item overdue once its lead time has passed', async () => {
    const actor = await signIn({ role: 'consultant' });
    const destination = await nepalWithRules();
    const traveller = await createTraveller({ passportNumber: null });

    // Departure in 5 days; insurance needs to be done 21 days out.
    const response = await actor.as(
      'get',
      `/travellers/${traveller.id}/document-checklist?destinationIds=${destination.id}&departureDate=${daysFromNow(5)}`
    );

    const insurance = response.body.data.items.find((i) => i.requirement.type === 'insurance');
    expect(insurance.overdue).toBe(true);
    expect(response.body.data.summary.overdue).toBeGreaterThan(0);
  });

  it('reports ready when everything is satisfied', async () => {
    const actor = await signIn({ role: 'consultant' });
    const destination = await nepalWithRules();
    const traveller = await createTraveller({
      passportNumber: 'PA1234567',
      passportExpiry: daysFromNow(900),
    });
    await db.TravellerDocument.create({
      travellerId: traveller.id,
      destinationId: destination.id,
      type: 'insurance',
      status: 'verified',
      expiresOn: daysFromNow(300),
      altitudeCoverMetres: 6000,
      insurerContactPhone: '+61 2 5550 1234',
    });

    const response = await actor.as(
      'get',
      `/travellers/${traveller.id}/document-checklist?destinationIds=${destination.id}&departureDate=${daysFromNow(90)}&returnDate=${daysFromNow(110)}`
    );

    expect(response.body.data.summary.ready).toBe(true);
    expect(response.body.data.summary.outstanding).toBe(0);
  });

  it('requires at least one destination id', async () => {
    const actor = await signIn({ role: 'consultant' });
    const traveller = await createTraveller();

    const response = await actor.as('get', `/travellers/${traveller.id}/document-checklist`);
    expect(response.status).toBe(400);
    expect(response.body.error.details.destinationIds).toBeTruthy();
  });
});
