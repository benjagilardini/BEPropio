import mongoose from 'mongoose';
import { Readable } from 'node:stream';
import { AppError } from '../utils/AppError.js';

function getBucket(): mongoose.mongo.GridFSBucket {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not connected');
  return new mongoose.mongo.GridFSBucket(db);
}

async function uploadFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  metadata: Record<string, unknown> = {},
): Promise<mongoose.Types.ObjectId> {
  const bucket = getBucket();
  const uploadStream = bucket.openUploadStream(filename, {
    metadata: { ...metadata, contentType: mimeType },
  });

  const readable = Readable.from(buffer);
  await new Promise<void>((resolve, reject) => {
    readable.pipe(uploadStream).on('finish', resolve).on('error', reject);
  });

  return uploadStream.id as mongoose.Types.ObjectId;
}

async function downloadFile(fileId: mongoose.Types.ObjectId): Promise<{
  stream: mongoose.mongo.GridFSBucketReadStream;
  filename: string;
  contentType: string;
  length: number;
}> {
  const bucket = getBucket();
  const db = mongoose.connection.db!;
  const files = db.collection('fs.files');
  const fileMeta = await files.findOne({ _id: fileId });

  if (!fileMeta) {
    throw AppError.notFound('Archivo no encontrado', 'FILE_NOT_FOUND');
  }

  const stream = bucket.openDownloadStream(fileId);
  return {
    stream,
    filename: fileMeta.filename as string,
    contentType: ((fileMeta.metadata as any)?.contentType || fileMeta.contentType || 'application/octet-stream') as string,
    length: fileMeta.length as number,
  };
}

async function readFileToBuffer(fileId: mongoose.Types.ObjectId): Promise<Buffer> {
  const { stream } = await downloadFile(fileId);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function deleteFile(fileId: mongoose.Types.ObjectId): Promise<void> {
  const bucket = getBucket();
  await bucket.delete(fileId);
}

export const fileService = { uploadFile, downloadFile, readFileToBuffer, deleteFile };
