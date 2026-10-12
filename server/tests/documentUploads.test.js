'use strict';

const {
  db,
  resetDatabase,
  anon,
  signIn,
  signInTraveller,
  createTraveller,
} = require('./helpers');

beforeEach(resetDatabase);

// A minimal but genuine PDF header — enough for the upload path to treat it
// as a real file without needing a fixture on disk.
const TINY_PDF = Buffer.from('%PDF-1.4\n%%EOF');
const TOO_BIG = Buffer.alloc(4096, 'a'); // UPLOAD_MAX_BYTES is 2048 in tests/setup.js

describe('POST /me/documents — with a file', () => {
  it('uploads a file alongside the metadata', async () => {
    const { as } = await signInTraveller();

    const response = await as('post', '/me/documents')
      .field('type', 'insurance')
      .field('reference', 'POL-1')
      .attach('file', TINY_PDF, { filename: 'policy.pdf', contentType: 'application/pdf' });

    expect(response.status).toBe(201);
    expect(response.body.data.document.hasFile).toBe(true);
    expect(response.body.data.document.fileName).toBe('policy.pdf');
    expect(response.body.data.document.fileMimeType).toBe('application/pdf');
  });

  it('still works with no file at all — a link-only document', async () => {
    const { as } = await signInTraveller();

    const response = await as('post', '/me/documents').send({
      type: 'insurance',
      filePath: 'https://example.com/policy.pdf',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.document.hasFile).toBe(false);
    expect(response.body.data.document.filePath).toBe('https://example.com/policy.pdf');
  });

  it('rejects an unsupported file type', async () => {
    const { as } = await signInTraveller();

    const response = await as('post', '/me/documents')
      .field('type', 'insurance')
      .attach('file', Buffer.from('hello'), { filename: 'notes.txt', contentType: 'text/plain' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('rejects a file over the size limit', async () => {
    const { as } = await signInTraveller();

    const response = await as('post', '/me/documents')
      .field('type', 'insurance')
      .attach('file', TOO_BIG, { filename: 'big.pdf', contentType: 'application/pdf' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('FILE_TOO_LARGE');
  });
});

describe('GET /me/documents/:documentId/file', () => {
  it("downloads the traveller's own uploaded file", async () => {
    const { as } = await signInTraveller();
    const upload = await as('post', '/me/documents')
      .field('type', 'insurance')
      .attach('file', TINY_PDF, { filename: 'policy.pdf', contentType: 'application/pdf' });
    const documentId = upload.body.data.document.id;

    const response = await as('get', `/me/documents/${documentId}/file`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(Buffer.compare(response.body, TINY_PDF)).toBe(0);
  });

  it("404s a document belonging to someone else", async () => {
    const owner = await signInTraveller({ email: 'owner@example.com' });
    const upload = await owner
      .as('post', '/me/documents')
      .field('type', 'insurance')
      .attach('file', TINY_PDF, { filename: 'policy.pdf', contentType: 'application/pdf' });
    const documentId = upload.body.data.document.id;

    const other = await signInTraveller({ email: 'other@example.com' });
    const response = await other.as('get', `/me/documents/${documentId}/file`);

    expect(response.status).toBe(404);
  });

  it('rejects an anonymous request', async () => {
    const response = await anon('get', '/me/documents/1/file');
    expect(response.status).toBe(401);
  });
});

describe('Staff document file upload/download', () => {
  it('lets staff attach a file to an existing document, invalidating a prior verification', async () => {
    const { as, user } = await signIn({ role: 'coordinator' });
    const traveller = await createTraveller();

    const created = await as('post', `/travellers/${traveller.id}/documents`).send({
      type: 'insurance',
      reference: 'POL-2',
    });
    const documentId = created.body.data.document.id;

    await db.TravellerDocument.update(
      { status: 'verified', verifiedAt: new Date(), verifiedByUserId: user.id },
      { where: { id: documentId } }
    );

    const uploadResponse = await as(
      'post',
      `/travellers/${traveller.id}/documents/${documentId}/file`
    ).attach('file', TINY_PDF, { filename: 'policy.pdf', contentType: 'application/pdf' });

    expect(uploadResponse.status).toBe(200);
    expect(uploadResponse.body.data.document.hasFile).toBe(true);
    expect(uploadResponse.body.data.document.status).toBe('submitted');
  });

  it('lets staff download a file attached to a traveller document', async () => {
    const { as } = await signIn({ role: 'coordinator' });
    const traveller = await createTraveller();

    const created = await as('post', `/travellers/${traveller.id}/documents`).send({
      type: 'insurance',
    });
    const documentId = created.body.data.document.id;

    await as(
      'post',
      `/travellers/${traveller.id}/documents/${documentId}/file`
    ).attach('file', TINY_PDF, { filename: 'policy.pdf', contentType: 'application/pdf' });

    const response = await as(
      'get',
      `/travellers/${traveller.id}/documents/${documentId}/file`
    );

    expect(response.status).toBe(200);
    expect(Buffer.compare(response.body, TINY_PDF)).toBe(0);
  });

  it('404s a document that has no uploaded file yet', async () => {
    const { as } = await signIn({ role: 'coordinator' });
    const traveller = await createTraveller();

    const created = await as('post', `/travellers/${traveller.id}/documents`).send({
      type: 'insurance',
    });
    const documentId = created.body.data.document.id;

    const response = await as(
      'get',
      `/travellers/${traveller.id}/documents/${documentId}/file`
    );
    expect(response.status).toBe(404);
  });
});
