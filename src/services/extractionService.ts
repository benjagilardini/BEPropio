import OpenAI from 'openai';
import { config } from '../config/index.js';
import { Lease } from '../models/Lease.js';
import { fileService } from './fileService.js';
import { AppError } from '../utils/AppError.js';

const EXTRACTION_PROMPT = `Sos un asistente que extrae datos de contratos de alquiler argentinos.
Dado el siguiente texto de un contrato, extraé los campos en formato JSON.
Para cada campo, incluí "sourceText" con la cita textual exacta del documento de donde lo extrajiste (máximo 120 caracteres).
Si un campo no se encuentra en el texto, poné null como valor y null como sourceText.

Campos a extraer:
- landlordName: nombre completo del locador/propietario
- tenantName: nombre completo del PRIMER locatario/inquilino (si hay varios, extraer solo el primero)
- tenantDni: DNI del primer locatario (solo números, sin puntos)
- startDate: fecha de inicio del contrato en formato YYYY-MM-DD
- endDate: fecha de fin del contrato en formato YYYY-MM-DD
- initialRent: monto del alquiler inicial (solo número, sin $ ni puntos de miles, con punto decimal si hay centavos)
- adjustmentIndex: índice de actualización (responder exactamente "IPC", "ICL" o "UVA" según lo que diga el contrato)
- adjustmentFrequencyMonths: cada cuántos meses se ajusta el alquiler (número entero)
- securityDeposit: monto del depósito de garantía (solo número, mismo formato que initialRent)

Respondé SOLO con un JSON válido con esta estructura:
{
  "fields": [
    { "fieldName": "...", "value": ..., "sourceText": "..." },
    ...
  ]
}`;

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

async function extractFieldsWithLLM(
  text: string,
): Promise<Array<{ fieldName: string; value: unknown; sourceText: string | null }>> {
  if (!config.openaiApiKey) {
    throw AppError.badRequest('OpenAI API key no configurada', 'OPENAI_NOT_CONFIGURED');
  }

  const openai = new OpenAI({ apiKey: config.openaiApiKey });

  const truncatedText = text.length > 30000 ? text.slice(0, 30000) : text;

  const response = await openai.chat.completions.create({
    model: config.openaiModel,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: EXTRACTION_PROMPT },
      { role: 'user', content: `Texto del contrato:\n\n"""\n${truncatedText}\n"""` },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw AppError.badRequest('La IA no devolvió resultados', 'EXTRACTION_EMPTY');
  }

  const parsed = JSON.parse(content);
  const fields: Array<{ fieldName: string; value: unknown; sourceText: string | null }> =
    parsed.fields || [];

  // Filter out fields with null values
  return fields.filter((f) => f.value !== null);
}

async function processLeaseDocument(landlordId: string, leaseId: string) {
  const lease = await Lease.findOne({ _id: leaseId, landlordId, status: 'draft' });
  if (!lease) throw AppError.notFound('Contrato no encontrado', 'LEASE_NOT_FOUND');
  if (!lease.document?.fileId) {
    throw AppError.badRequest('El contrato no tiene documento adjunto', 'NO_DOCUMENT');
  }

  // Read PDF from GridFS
  const buffer = await fileService.readFileToBuffer(lease.document.fileId);

  // Extract text
  let text: string;
  try {
    text = await extractTextFromPdf(buffer);
  } catch {
    throw AppError.badRequest(
      'No se pudo leer el texto del documento. Asegurate de subir un PDF con texto seleccionable.',
      'TEXT_EXTRACTION_FAILED',
    );
  }

  if (text.trim().length < 50) {
    throw AppError.badRequest(
      'El documento parece estar escaneado o no contiene texto legible. Subí un PDF con texto seleccionable.',
      'INSUFFICIENT_TEXT',
    );
  }

  // Extract fields with LLM
  let rawFields: Array<{ fieldName: string; value: unknown; sourceText: string | null }>;
  try {
    rawFields = await extractFieldsWithLLM(text);
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw AppError.badRequest(
      'Error al procesar el documento con IA. Intentá de nuevo.',
      'LLM_EXTRACTION_FAILED',
    );
  }

  // Map to extractedFields format
  lease.extractedFields = rawFields.map((f) => ({
    fieldName: f.fieldName,
    value: f.value,
    sourceText: f.sourceText ?? null,
    status: 'pending' as const,
    correctedValue: null,
  }));

  await lease.save();

  return lease;
}

export const extractionService = { processLeaseDocument, extractTextFromPdf, extractFieldsWithLLM };
