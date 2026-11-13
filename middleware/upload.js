import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import config from '../config/env.js';
import { AppError } from '../utils/AppError.js';

// uploads/ is resolved from this file, not from the shell's working directory.
const uploadDir = fileURLToPath(new URL('../uploads/', import.meta.url));
fs.mkdirSync(uploadDir, { recursive: true });

// MIME type -> accepted file extensions.
const allowedTypes = new Map([
  ['image/jpeg', ['.jpg', '.jpeg']],
  ['image/jpg', ['.jpg', '.jpeg']],
  ['image/png', ['.png']],
]);

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDir),
  filename: (_req, file, callback) => {
    // Never trust originalname. A random name prevents collisions and path
    // traversal; the extension comes from the validated MIME type.
    const extension = allowedTypes.get(file.mimetype)?.[0] || '.jpg';
    callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  },
});

function fileFilter(_req, file, callback) {
  const allowedExtensions = allowedTypes.get(file.mimetype);

  if (!allowedExtensions) {
    return callback(
      new AppError(415, 'Only JPEG, JPG and PNG images are allowed'),
    );
  }

  const extension = path.extname(file.originalname || '').toLowerCase();
  if (!allowedExtensions.includes(extension)) {
    return callback(
      new AppError(400, 'Image extension does not match its MIME type'),
    );
  }

  return callback(null, true);
}

/** Accepts exactly one image in the multipart field named "image". */
export const uploadImage = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.maxFileSizeBytes,
    files: 1,
    fields: 5,
    fieldSize: 10 * 1024,
  },
}).single('image');
