import multer from 'multer';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
const storageDir = resolve(process.env.UPLOAD_DIR || 'server/storage');
await mkdir(storageDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, storageDir),
  filename: (_req, file, cb) => {
    const ext =
      file.originalname
        .split('.')
        .pop()
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 8) || 'bin';
    cb(null, `${randomUUID()}.${ext}`);
  },
});
const supported = [
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
];
export function assignmentUpload(req, res, next) {
  const max = Math.min(20_000_000, Math.max(1, req.assignment?.maxFileBytes || 10_000_000));
  const middleware = multer({
    storage,
    limits: { fileSize: max, files: 1 },
    fileFilter: (request, file, cb) => {
      if (!supported.includes(file.mimetype))
        return cb(Object.assign(new Error('Unsupported file type'), { status: 400 }));
      if (
        request.assignment?.allowedMimeTypes?.length &&
        !request.assignment.allowedMimeTypes.includes(file.mimetype)
      )
        return cb(Object.assign(new Error('File type not allowed for this assignment'), { status: 400 }));
      cb(null, true);
    },
  }).single('file');
  middleware(req, res, next);
}
export const storedPath = (name) => resolve(storageDir, name);
