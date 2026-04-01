import { createHash } from 'node:crypto';
import AdmZip from 'adm-zip';
import { v4 as uuid } from 'uuid';
import { env } from '../../config/env.js';
import { db } from '../../db/connection.js';

const clean = (v: any) => String(v ?? '').trim();
const cleanRnc = (v: any) => clean(v).replace(/\D/g, '');

let runningSync: Promise<{ ok: boolean; foundAfterSync?: boolean; message?: string }> | null = null;
let timer: NodeJS.Timeout | null = null;
let lastAutoRunKey = '';

function nowIso() { return new Date().toISOString(); }

function logStart(tipo: string, url: string, formato: string) {
  const id = uuid();
  db.prepare(`INSERT INTO dgii_rnc_sync_log(id,inicio,estado,tipo_ejecucion,url_origen,formato) VALUES(?,?,?,?,?,?)`)
    .run(id, nowIso(), 'ejecutando', tipo, url, formato);
  return id;
}

function logEnd(id: string, data: any) {
  db.prepare(`UPDATE dgii_rnc_sync_log
    SET fin=?, estado=?, cantidad_insertados=?, cantidad_actualizados=?, cantidad_omitidos=?, mensaje_error=?, archivo_descargado=?, hash_archivo=?
    WHERE id=?`)
    .run(nowIso(), data.estado, data.insertados ?? 0, data.actualizados ?? 0, data.omitidos ?? 0, data.error ?? null, data.archivo ?? null, data.hash ?? null, id);
}

async function download(url: string) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), env.dgiiRncTimeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(t);
  }
}

function parseZipRows(buffer: Buffer, format: 'csv' | 'txt') {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries().filter((e: AdmZip.IZipEntry) => !e.isDirectory);
  if (entries.length === 0) throw new Error('ZIP vacío');
  const raw = entries[0].getData().toString('utf-8');
  const lines = raw.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  if (format === 'csv') {
    const parseCsvLine = (line: string) => {
      const cols: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          const next = line[i + 1];
          if (inQuotes && next === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
          continue;
        }
        if (!inQuotes && (ch === ',' || ch === ';' || ch === '\t')) {
          cols.push(current.trim());
          current = '';
          continue;
        }
        current += ch;
      }
      cols.push(current.trim());
      return cols;
    };

    const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
    return lines.slice(1).map((l: string) => {
      const cols = parseCsvLine(l);
      const get = (...keys: string[]) => {
        const idx = headers.findIndex((h) => keys.some((k) => h.includes(k)));
        return idx >= 0 ? cols[idx] : '';
      };
      return {
        rnc: cleanRnc(get('rnc')),
        razon_social: clean(get('razon', 'nombre', 'social')),
        nombre_comercial: clean(get('comercial')),
        categoria: clean(get('categoria')),
        regimen_pagos: clean(get('regimen')),
        estado: clean(get('estado')),
        actividad_economica: clean(get('actividad')),
        administracion_local: clean(get('administracion', 'local')),
        facturador_electronico: clean(get('facturador', 'electronico')),
      };
    });
  }

  return lines.slice(1).map((l: string) => {
      const cols = l.split('|').map((c: string) => c.trim());
    return {
      rnc: cleanRnc(cols[0]),
      razon_social: clean(cols[1]),
      nombre_comercial: clean(cols[2]),
      categoria: clean(cols[3]),
      regimen_pagos: clean(cols[4]),
      estado: clean(cols[5]),
      actividad_economica: clean(cols[6]),
      administracion_local: clean(cols[7]),
      facturador_electronico: clean(cols[8]),
    };
  });
}

function upsertRows(rows: any[], source: string, fechaFuente: string) {
  let insertados = 0; let actualizados = 0; let omitidos = 0;
  const upsert = db.prepare(`INSERT INTO dgii_rnc(id,rnc,razon_social,nombre_comercial,categoria,regimen_pagos,estado,actividad_economica,administracion_local,facturador_electronico,fuente,fecha_actualizacion_fuente,creado_en,actualizado_en)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(rnc) DO UPDATE SET
      razon_social=excluded.razon_social,
      nombre_comercial=excluded.nombre_comercial,
      categoria=excluded.categoria,
      regimen_pagos=excluded.regimen_pagos,
      estado=excluded.estado,
      actividad_economica=excluded.actividad_economica,
      administracion_local=excluded.administracion_local,
      facturador_electronico=excluded.facturador_electronico,
      fuente=excluded.fuente,
      fecha_actualizacion_fuente=excluded.fecha_actualizacion_fuente,
      actualizado_en=excluded.actualizado_en`);

  const exists = db.prepare('SELECT id FROM dgii_rnc WHERE rnc=?');
  const tx = db.transaction(() => {
    for (const r of rows) {
      if (!r.rnc) { omitidos++; continue; }
      const ex = exists.get(r.rnc) as any;
      upsert.run(uuid(), r.rnc, r.razon_social, r.nombre_comercial, r.categoria, r.regimen_pagos, r.estado, r.actividad_economica, r.administracion_local, r.facturador_electronico, source, fechaFuente, nowIso(), nowIso());
      if (ex) actualizados++; else insertados++;
    }
  });
  tx();
  return { insertados, actualizados, omitidos };
}

async function syncFrom(url: string, format: 'csv' | 'txt', tipoEjecucion: string) {
  const logId = logStart(tipoEjecucion, url, format);
  try {
    const buffer = await download(url);
    const hash = createHash('sha256').update(buffer).digest('hex');
    const rows = parseZipRows(buffer, format);
    const result = upsertRows(rows, format.toUpperCase(), nowIso());
    logEnd(logId, { estado: 'ok', ...result, archivo: `catalogo.${format}.zip`, hash });
    return { ok: true };
  } catch (e: any) {
    logEnd(logId, { estado: 'error', error: e.message });
    return { ok: false, error: e.message };
  }
}

export async function syncCatalog(tipoEjecucion: 'automatica' | 'manual' | 'validacion_inmediata' = 'manual') {
  if (runningSync) return runningSync;
  runningSync = (async () => {
    const csv = await syncFrom(env.dgiiRncCsvUrl, 'csv', tipoEjecucion);
    if (csv.ok) return { ok: true };
    const txt = await syncFrom(env.dgiiRncTxtUrl, 'txt', tipoEjecucion);
    return { ok: txt.ok, message: txt.ok ? undefined : txt.error };
  })();
  const out = await runningSync;
  runningSync = null;
  return out;
}

function parseCronHourMinute(expr: string) {
  const [minuteRaw, hourRaw] = String(expr || '').trim().split(/\s+/);
  const minute = Number(minuteRaw);
  const hour = Number(hourRaw);
  if (!Number.isInteger(minute) || minute < 0 || minute > 59 || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    return { minute: 0, hour: 3 };
  }
  return { minute, hour };
}

export async function lookupRnc(rawRnc: string) {
  const rnc = cleanRnc(rawRnc);
  if (!rnc) return { ok: true, found: false, message: 'El RNC ingresado es incorrecto o no existe en el catálogo actual.' };

  const find = () => db.prepare('SELECT * FROM dgii_rnc WHERE rnc=?').get(rnc) as any;
  const row = find();
  if (row) return { ok: true, found: true, data: mapOut(row) };

  const sync = await syncCatalog('validacion_inmediata');
  const row2 = find();
  if (row2) return { ok: true, found: true, data: mapOut(row2), revalidated: true };
  if (!sync.ok) return { ok: true, found: false, message: 'No se encontró el RNC. Se intentó actualizar el catálogo en este momento y no fue posible validarlo.' };
  return { ok: true, found: false, message: 'El RNC ingresado es incorrecto o no existe en el catálogo actual.' };
}

function mapOut(r: any) {
  return {
    rnc: r.rnc,
    razonSocial: r.razon_social ?? '',
    nombreComercial: r.nombre_comercial ?? '',
    categoria: r.categoria ?? '',
    regimenPagos: r.regimen_pagos ?? '',
    estado: r.estado ?? '',
    actividadEconomica: r.actividad_economica ?? '',
    administracionLocal: r.administracion_local ?? '',
    facturadorElectronico: r.facturador_electronico ?? '',
  };
}

export function dgiiStatus() {
  const ultimo = db.prepare("SELECT * FROM dgii_rnc_sync_log WHERE estado='ok' ORDER BY inicio DESC LIMIT 1").get() as any;
  const error = db.prepare("SELECT * FROM dgii_rnc_sync_log WHERE estado='error' ORDER BY inicio DESC LIMIT 1").get() as any;
  const count = db.prepare('SELECT COUNT(*) as c FROM dgii_rnc').get() as any;
  const logs = db.prepare('SELECT * FROM dgii_rnc_sync_log ORDER BY inicio DESC LIMIT 20').all();
  const ultimaValidacionInmediata = db.prepare("SELECT * FROM dgii_rnc_sync_log WHERE tipo_ejecucion='validacion_inmediata' ORDER BY inicio DESC LIMIT 1").get() as any;
  return { ultimo_ok: ultimo, ultimo_error: error, total_registros: Number(count.c), logs, sync_en_progreso: Boolean(runningSync), ultima_validacion_inmediata: ultimaValidacionInmediata };
}

export function startDgiiSyncJob() {
  if (!env.dgiiRncSyncEnabled) return;
  if (timer) clearInterval(timer);
  const cron = parseCronHourMinute(env.dgiiRncSyncCron);
  timer = setInterval(() => {
    const d = new Date();
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
    if (d.getUTCHours() === cron.hour && d.getUTCMinutes() === cron.minute && lastAutoRunKey !== key) {
      lastAutoRunKey = key;
      syncCatalog('automatica');
    }
  }, 60_000);
}
