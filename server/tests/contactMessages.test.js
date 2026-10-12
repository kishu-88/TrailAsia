'use strict';

const { db, resetDatabase, anon, createUser } = require('./helpers');

beforeEach(resetDatabase);

describe('POST /public/contact-messages', () => {
  it('creates a contact message and notifies trip-editor staff', async () => {
    const { user: consultant } = await createUser({ role: 'consultant' });

    const response = await anon('post', '/public/contact-messages').send({
      name: 'Jordan Lee',
      email: 'JORDAN@example.com',
      phone: '+61 400 111 222',
      message: 'Do you run small-group departures for Bhutan in October?',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.received).toBe(true);
    expect(response.body.data.id).toBeTruthy();

    const message = await db.ContactMessage.findOne({ where: { email: 'jordan@example.com' } });
    expect(message).toBeTruthy();
    expect(message.name).toBe('Jordan Lee');
    expect(message.message).toBe('Do you run small-group departures for Bhutan in October?');

    const notification = await db.Notification.findOne({
      where: { userId: consultant.id, type: 'contact_message_received' },
    });
    expect(notification).toBeTruthy();
  });

  it('does not create a traveller or booking — a general message stays its own row', async () => {
    await createUser({ role: 'consultant' });

    await anon('post', '/public/contact-messages').send({
      name: 'Jordan Lee',
      email: 'jordan@example.com',
      message: 'Just a question, not a booking.',
    });

    expect(await db.Traveller.count()).toBe(0);
    expect(await db.Booking.count()).toBe(0);
  });

  it('falls back to an active admin when no consultant exists', async () => {
    const { user: admin } = await createUser({ role: 'admin' });

    const response = await anon('post', '/public/contact-messages').send({
      name: 'Jordan Lee',
      email: 'jordan@example.com',
      message: 'General question.',
    });

    expect(response.status).toBe(201);
    const notification = await db.Notification.findOne({
      where: { userId: admin.id, type: 'contact_message_received' },
    });
    expect(notification).toBeTruthy();
  });

  it('allows an omitted phone number', async () => {
    await createUser({ role: 'consultant' });

    const response = await anon('post', '/public/contact-messages').send({
      name: 'Jordan Lee',
      email: 'jordan@example.com',
      message: 'No phone number given.',
    });

    expect(response.status).toBe(201);
    const message = await db.ContactMessage.findOne({ where: { email: 'jordan@example.com' } });
    expect(message.phone).toBeNull();
  });

  it('validates required fields', async () => {
    await createUser({ role: 'consultant' });

    const response = await anon('post', '/public/contact-messages').send({
      email: 'not-an-email',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.details.name).toBeTruthy();
    expect(response.body.error.details.email).toBeTruthy();
    expect(response.body.error.details.message).toBeTruthy();
  });

  it('rejects a message over the length limit', async () => {
    await createUser({ role: 'consultant' });

    const response = await anon('post', '/public/contact-messages').send({
      name: 'Jordan Lee',
      email: 'jordan@example.com',
      message: 'x'.repeat(4001),
    });

    expect(response.status).toBe(400);
    expect(response.body.error.details.message).toBeTruthy();
  });
});
