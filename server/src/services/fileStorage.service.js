'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const env = require('../config/env');
const ApiError = require('../utils/ApiError');

/**
 * Where an uploaded document actually lives.
 *
 * Local disk, not object storage — this agency has no S3-equivalent account
 * yet. Kept behind this one module so that changing that later is a rewrite
 * of `store`/`read`/`remove` here, not a hunt through every route that
 * touches a document. Files are named by a random id, never the traveller's
 * original filename, so nothing on disk leaks whose passport it is just by
 * being listed.
 */
// Documents specifically, under the shared uploads root — the same root this
// codebase has reserved since the scaffold phase for whatever gets uploaded.
// A second upload kind (say, a destination hero photo) would get its own
// subdirectory here, not its own root.
const ROOT = path.resolve(__dirname, '..', '..', env.uploads.dir, 'traveller-documents');

const EXTENSION_BY_MIME_TYPE = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/** True for anything `UPLOAD_ALLOWED_TYPES` accepts — checked before it ever touches disk. */
function isAllowedMimeType(mimeType) {
  return env.uploads.allowedTypes.includes(mimeType) && Boolean(EXTENSION_BY_MIME_TYPE[mimeType]);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Write an uploaded file for one traveller's document.
 *
 * @param {object} file
 * @param {number} file.travellerId
 * @param {Buffer} file.buffer
 * @param {string} file.mimeType
 * @param {string} file.originalName  Kept only as a label shown back to the
 *   traveller and staff — never used to build a path.
 * @returns {{ storedFileName: string, originalFileName: string, mimeType: string, sizeBytes: number }}
 */
async function store({ travellerId, buffer, mimeType, originalName }) {
  if (!isAllowedMimeType(mimeType)) {
    throw ApiError.badRequest(
      'That file type is not accepted. Upload a PDF, JPEG, PNG or WebP.',
      { code: 'UNSUPPORTED_FILE_TYPE', details: { file: 'Unsupported type.' } }
    );
  }

  const travellerDir = path.join(ROOT, String(travellerId));
  await ensureDir(travellerDir);

  const fileName = `${crypto.randomUUID()}${EXTENSION_BY_MIME_TYPE[mimeType]}`;
  await fs.writeFile(path.join(travellerDir, fileName), buffer);

  return {
    storedFileName: `${travellerId}/${fileName}`,
    originalFileName: String(originalName || 'document').slice(0, 255),
    mimeType,
    sizeBytes: buffer.length,
  };
}

/**
 * Resolve a stored file name to a safe absolute path.
 *
 * `storedFileName` only ever comes from our own database column, written by
 * `store()` above — never from a request. This check exists anyway, on the
 * same reasoning as everything else here that validates its own invariants:
 * a bug elsewhere should fail loudly here rather than read a file outside
 * the upload root.
 */
function resolvePath(storedFileName) {
  const resolved = path.resolve(ROOT, storedFileName);
  if (!resolved.startsWith(ROOT + path.sep)) {
    throw new Error(`Refusing to resolve a path outside the uploads root: ${storedFileName}`);
  }
  return resolved;
}

async function remove(storedFileName) {
  if (!storedFileName) return;
  try {
    await fs.unlink(resolvePath(storedFileName));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

module.exports = { store, remove, resolvePath, isAllowedMimeType };
