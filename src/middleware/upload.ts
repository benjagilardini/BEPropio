import multer from 'multer';
import { config } from '../config/index.js';

const storage = multer.memoryStorage();

export const uploadContract = multer({
  storage,
  limits: { fileSize: config.maxFileSize },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos PDF o imágenes'));
    }
  },
}).single('contract');

export const uploadReceipt = multer({
  storage,
  limits: { fileSize: config.maxImageSize },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos PDF o imágenes'));
    }
  },
}).single('file');
