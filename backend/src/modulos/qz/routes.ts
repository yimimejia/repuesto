import { Router } from 'express';
import crypto from 'node:crypto';

export const qzRouter = Router();

/** Normaliza un PEM que puede tener \n literales, espacios o saltos reales entre líneas */
function normalizePem(raw: string): string {
  // 1. Reemplazar \n literales (\\n) con saltos reales
  let s = raw.replace(/\\n/g, '\n');
  // 2. Detectar si quedó en una sola línea (cabecera y base64 separados por espacios)
  const headerMatch = s.match(/-----BEGIN ([^-]+)-----/);
  if (!headerMatch) return s;
  const type = headerMatch[1];
  // Extraer contenido base64 (quitar cabecera y pie, luego quitar whitespace)
  const b64 = s
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  // Reconstruir con saltos reales cada 64 caracteres
  const wrapped = (b64.match(/.{1,64}/g) ?? []).join('\n');
  return `-----BEGIN ${type}-----\n${wrapped}\n-----END ${type}-----`;
}

qzRouter.get('/cert', (_req, res) => {
  const cert = process.env.QZ_CERTIFICATE;
  if (!cert) return res.status(503).type('text/plain').send('');
  res.type('text/plain').send(normalizePem(cert));
});

qzRouter.get('/cert/download', (_req, res) => {
  const cert = process.env.QZ_CERTIFICATE;
  if (!cert) return res.status(503).send('No configurado');
  res.setHeader('Content-Disposition', 'attachment; filename="repuestos-calcano-qztray.crt"');
  res.type('text/plain').send(normalizePem(cert));
});

qzRouter.post('/sign', (req, res) => {
  const privateKeyPem = process.env.QZ_PRIVATE_KEY;
  if (!privateKeyPem) return res.status(503).json({ error: 'Sin clave privada' });
  try {
    const { payload } = req.body;
    const keyNormalized = normalizePem(privateKeyPem);
    // Intentar SHA512 primero (requerido por QZ Tray), luego SHA256 como fallback
    let signature: string;
    try {
      signature = crypto.createSign('SHA512').update(payload).sign(keyNormalized, 'base64');
    } catch {
      signature = crypto.createSign('SHA256').update(payload).sign(keyNormalized, 'base64');
    }
    res.json({ signature });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
