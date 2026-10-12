'use strict';

const multer = require('multer');

const env = require('../config/env');

/**
 * Parses one optional file under the `file` field of a multipart request.
 *
 * Memory storage, not disk storage — `fileStorage.service.js` decides where
 * a file actually lands (and validates its type) once the rest of the
 * request has passed validation; this middleware's only job is getting the
 * bytes into `req.file.buffer`. The size ceiling is enforced here, before a
 * single byte is written anywhere, so an oversized upload never reaches
 * disk.
 */
const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.uploads.maxBytes, files: 1 },
}).single('file');

module.exports = uploadDocument;
