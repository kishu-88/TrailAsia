'use strict';

const travellerService = require('../services/traveller.service');

const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

/**
 * Who may see an unmasked passport number.
 *
 * Consultants and coordinators need it to complete visa and permit applications.
 * Finance has no reason to, so they see the masked value like everybody else —
 * that is what duty separation means in practice.
 */
function maySeePassport(user) {
  return ['consultant', 'coordinator', 'admin'].includes(user.role);
}

const list = handle(async (req, res) => {
  res.json(await travellerService.list(req.query));
});

const get = handle(async (req, res) => {
  const traveller = await travellerService.getById(req.params.id, { withDocuments: true });
  res.json({
    data: {
      traveller: traveller.toPublicJSON({ includePassport: maySeePassport(req.user) }),
    },
  });
});

const create = handle(async (req, res) => {
  const traveller = await travellerService.create(req.body, req.user);
  res.status(201).json({
    data: { traveller: traveller.toPublicJSON({ includePassport: maySeePassport(req.user) }) },
  });
});

const update = handle(async (req, res) => {
  const traveller = await travellerService.update(req.params.id, req.body);
  res.json({
    data: { traveller: traveller.toPublicJSON({ includePassport: maySeePassport(req.user) }) },
  });
});

const deactivate = handle(async (req, res) => {
  const traveller = await travellerService.deactivate(req.params.id);
  res.json({ data: { traveller: traveller.toPublicJSON() } });
});

const reactivate = handle(async (req, res) => {
  const traveller = await travellerService.reactivate(req.params.id);
  res.json({ data: { traveller: traveller.toPublicJSON() } });
});

// --- Documents -------------------------------------------------------------

const listDocuments = handle(async (req, res) => {
  const documents = await travellerService.listDocuments(req.params.id);
  res.json({ data: documents.map((doc) => doc.toPublicJSON()) });
});

const addDocument = handle(async (req, res) => {
  const document = await travellerService.addDocument(req.params.id, req.body);
  res.status(201).json({ data: { document: document.toPublicJSON() } });
});

const getDocument = handle(async (req, res) => {
  const document = await travellerService.getDocument(req.params.documentId);
  res.json({ data: { document: document.toPublicJSON() } });
});

const updateDocument = handle(async (req, res) => {
  const document = await travellerService.updateDocument(req.params.documentId, req.body);
  res.json({ data: { document: document.toPublicJSON() } });
});

const verifyDocument = handle(async (req, res) => {
  const document = await travellerService.verifyDocument(
    req.params.documentId,
    req.body,
    req.user
  );
  res.json({ data: { document: document.toPublicJSON() } });
});

const deleteDocument = handle(async (req, res) => {
  await travellerService.deleteDocument(req.params.documentId);
  res.status(204).send();
});

const checklist = handle(async (req, res) => {
  const query = req.validatedQuery;
  const result = await travellerService.buildChecklist({
    travellerId: req.params.id,
    destinationIds: query.destinationIds,
    departureDate: query.departureDate || null,
    returnDate: query.returnDate || null,
    maxAltitudeMetres: query.maxAltitudeMetres || null,
  });
  res.json({ data: result });
});

module.exports = {
  list,
  get,
  create,
  update,
  deactivate,
  reactivate,
  listDocuments,
  addDocument,
  getDocument,
  updateDocument,
  verifyDocument,
  deleteDocument,
  checklist,
};
