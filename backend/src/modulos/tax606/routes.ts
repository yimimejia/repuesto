import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../../db/connection.js';
import { permitir } from '../../shared/auth.js';

export const tax606Router = Router();

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

function padN(v: any, n: number) { return String(v ?? '').padEnd(n).substring(0, n); }
function padR(v: any, n: number) { return String(v ?? '').padStart(n, '0').substring(0, n); }
function fmtAmt(v: number, n: number) { return String(Math.round(v * 100)).padStart(n, '0'); }

// ─── Catálogos ─────────────────────────────────────────────────────────────
tax606Router.get('/catalogs', (req, res) => {
  const rows = db.prepare('SELECT tipo, codigo, descripcion FROM tax_606_catalogs WHERE activo=1 ORDER BY tipo, codigo').all();
  const grouped: Record<string, any[]> = {};
  for (const r of rows as any[]) {
    if (!grouped[r.tipo]) grouped[r.tipo] = [];
    grouped[r.tipo].push({ codigo: r.codigo, descripcion: r.descripcion });
  }
  res.json(grouped);
});

// ─── Configuración tributaria ───────────────────────────────────────────────
tax606Router.get('/config', permitir('administrador'), (req, res) => {
  const cfg = db.prepare('SELECT * FROM tax_configuration WHERE id=1').get();
  res.json(cfg);
});

tax606Router.put('/config', permitir('administrador'), (req, res) => {
  const { rnc_contribuyente, nombre_comercial, emisor_electronico, incluir_serie_b, incluir_ecf_recibidos, reglas_especiales_json, version_plantilla } = req.body;
  db.prepare(`UPDATE tax_configuration SET
    rnc_contribuyente=?, nombre_comercial=?, emisor_electronico=?,
    incluir_serie_b=?, incluir_ecf_recibidos=?, reglas_especiales_json=?,
    version_plantilla=?, fecha_actualizacion=?
    WHERE id=1`).run(
    rnc_contribuyente ?? '', nombre_comercial ?? '', emisor_electronico ? 1 : 0,
    incluir_serie_b !== false ? 1 : 0, incluir_ecf_recibidos ? 1 : 0,
    JSON.stringify(reglas_especiales_json ?? {}), version_plantilla ?? '2024', now()
  );
  res.json({ ok: true });
});

// ─── Períodos ───────────────────────────────────────────────────────────────
tax606Router.get('/periods', permitir('administrador', 'cajero'), (req, res) => {
  const periods = db.prepare(`
    SELECT p.periodo, p.estado, p.fecha_cierre,
      COUNT(r.id) as total_registros,
      COALESCE(SUM(CASE WHEN r.excluido=0 AND r.estado!='anulado' THEN r.total_monto_facturado ELSE 0 END),0) as total_facturado,
      COALESCE(SUM(CASE WHEN r.excluido=0 AND r.estado!='anulado' THEN r.itbis_facturado ELSE 0 END),0) as total_itbis,
      SUM(CASE WHEN r.errores_json IS NOT NULL AND r.errores_json!='[]' AND r.errores_json!='' THEN 1 ELSE 0 END) as con_errores
    FROM tax_606_periods p
    LEFT JOIN tax_606_records r ON r.periodo=p.periodo
    GROUP BY p.periodo ORDER BY p.periodo DESC LIMIT 24`).all();
  res.json({ periods });
});

tax606Router.post('/periods/:period/open', permitir('administrador'), (req, res) => {
  const { period } = req.params;
  const usuario = (req as any).usuario;
  const existing = db.prepare('SELECT periodo, estado FROM tax_606_periods WHERE periodo=?').get(period) as any;
  if (!existing) {
    db.prepare('INSERT INTO tax_606_periods(periodo,estado,fecha_creacion) VALUES(?,?,?)').run(period, 'abierto', now());
  } else if (existing.estado === 'cerrado') {
    db.prepare('UPDATE tax_606_periods SET estado=?, reabierto_por_id=?, fecha_reapertura=? WHERE periodo=?').run('abierto', usuario.id, now(), period);
  }
  res.json({ ok: true });
});

tax606Router.post('/periods/:period/close', permitir('administrador'), (req, res) => {
  const { period } = req.params;
  const usuario = (req as any).usuario;
  const existing = db.prepare('SELECT periodo FROM tax_606_periods WHERE periodo=?').get(period) as any;
  if (!existing) return res.status(404).json({ error: 'Período no encontrado' });
  db.prepare('UPDATE tax_606_periods SET estado=?, cerrado_por_id=?, fecha_cierre=? WHERE periodo=?').run('cerrado', usuario.id, now(), period);
  res.json({ ok: true });
});

// ─── Registros 606 ──────────────────────────────────────────────────────────
tax606Router.get('/records', permitir('administrador', 'cajero'), (req, res) => {
  const { periodo, suplidor, ncf, estado, tipo_comprobante, con_errores, page = '1', limit = '50' } = req.query as any;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(200, Math.max(10, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  const wheres: string[] = ['1=1'];
  const params: any[] = [];
  if (periodo) { wheres.push('r.periodo=?'); params.push(periodo); }
  if (suplidor) { wheres.push('r.rnc_cedula_suplidor LIKE ?'); params.push(`%${suplidor}%`); }
  if (ncf) { wheres.push('r.numero_comprobante LIKE ?'); params.push(`%${ncf}%`); }
  if (estado) { wheres.push('r.estado=?'); params.push(estado); }
  if (tipo_comprobante) { wheres.push("substr(r.numero_comprobante,1,3)=?"); params.push(tipo_comprobante); }
  if (con_errores === '1') { wheres.push("r.errores_json IS NOT NULL AND r.errores_json!='[]'"); }

  const where = wheres.join(' AND ');
  const total = (db.prepare(`SELECT COUNT(*) as c FROM tax_606_records r WHERE ${where}`).get(...params as []) as any).c;
  const rows = db.prepare(`SELECT r.*, u.nombre_completo as creado_por_nombre
    FROM tax_606_records r
    LEFT JOIN usuarios u ON u.id=r.creado_por_id
    WHERE ${where} ORDER BY r.fecha_comprobante DESC, r.fecha_creacion DESC
    LIMIT ? OFFSET ?`).all(...params as [], limitNum, offset);

  res.json({ records: rows, total, page: pageNum, pages: Math.ceil(total / limitNum) });
});

tax606Router.get('/records/:id', permitir('administrador', 'cajero'), (req, res) => {
  const r = db.prepare('SELECT * FROM tax_606_records WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Registro no encontrado' });
  res.json(r);
});

function validarRegistro606(data: any): string[] {
  const errors: string[] = [];
  if (!data.rnc_cedula_suplidor) errors.push('RNC/Cédula del suplidor es obligatorio');
  if (!data.tipo_identificacion) errors.push('Tipo de identificación es obligatorio');
  if (!data.numero_comprobante) errors.push('Número de comprobante es obligatorio');
  if (!data.fecha_comprobante) errors.push('Fecha de comprobante es obligatoria');
  if (!data.forma_pago) errors.push('Forma de pago es obligatoria');
  if (!data.periodo || !/^\d{6}$/.test(data.periodo)) errors.push('Período debe tener formato AAAAMM');
  const total = (data.monto_bienes || 0) + (data.monto_servicios || 0);
  if (total <= 0) errors.push('El monto facturado total debe ser mayor a cero');
  if ((data.itbis_retenido > 0 || data.monto_retencion_renta > 0) && !data.fecha_pago) {
    errors.push('Fecha de pago es obligatoria cuando hay retenciones');
  }
  if (data.tipo_identificacion === '1' && data.rnc_cedula_suplidor && !/^\d{9}$/.test(data.rnc_cedula_suplidor.replace(/-/g, ''))) {
    errors.push('RNC debe tener 9 dígitos');
  }
  if (data.tipo_identificacion === '2' && data.rnc_cedula_suplidor && !/^\d{11}$/.test(data.rnc_cedula_suplidor.replace(/-/g, ''))) {
    errors.push('Cédula debe tener 11 dígitos');
  }
  return errors;
}

tax606Router.post('/records', permitir('administrador', 'cajero'), (req, res) => {
  const usuario = (req as any).usuario;
  const data = req.body;
  const period = data.periodo;

  const periodoRow = db.prepare('SELECT estado FROM tax_606_periods WHERE periodo=?').get(period) as any;
  if (periodoRow?.estado === 'cerrado') return res.status(400).json({ error: 'El período está cerrado. Solo un administrador puede reabrirlo.' });

  // Calcular total automáticamente
  data.total_monto_facturado = (data.monto_bienes || 0) + (data.monto_servicios || 0);
  // itbis_por_adelantar = itbis_facturado - itbis_retenido - itbis_proporcionalidad - itbis_costo
  data.itbis_por_adelantar = Math.max(0,
    (data.itbis_facturado || 0) - (data.itbis_retenido || 0) - (data.itbis_proporcionalidad || 0) - (data.itbis_costo || 0)
  );

  // Verificar duplicado NCF en período para mismo suplidor
  const dup = db.prepare(`SELECT id FROM tax_606_records WHERE periodo=? AND rnc_cedula_suplidor=? AND numero_comprobante=? AND estado!='anulado'`).get(period, data.rnc_cedula_suplidor, data.numero_comprobante);
  if (dup) return res.status(400).json({ error: 'Ya existe un registro con este NCF para el mismo suplidor en este período' });

  if (!periodoRow) {
    db.prepare('INSERT INTO tax_606_periods(periodo,estado,fecha_creacion) VALUES(?,?,?)').run(period, 'abierto', now());
  }

  const errors = validarRegistro606(data);
  const id = uid();
  db.prepare(`INSERT INTO tax_606_records(
    id,periodo,rnc_cedula_suplidor,tipo_identificacion,tipo_bienes_servicios,
    numero_comprobante,numero_comprobante_modificado,fecha_comprobante,fecha_pago,
    monto_bienes,monto_servicios,total_monto_facturado,itbis_facturado,itbis_retenido,
    itbis_proporcionalidad,itbis_costo,itbis_por_adelantar,itbis_percibido,
    tipo_retencion_isr,monto_retencion_renta,isr_percibido,impuesto_selectivo,
    otros_impuestos,monto_propina_legal,forma_pago,estado,observaciones,errores_json,
    creado_por_id,actualizado_por_id,fecha_creacion,fecha_actualizacion
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, period, data.rnc_cedula_suplidor, data.tipo_identificacion, data.tipo_bienes_servicios ?? null,
    data.numero_comprobante, data.numero_comprobante_modificado ?? null, data.fecha_comprobante, data.fecha_pago ?? null,
    data.monto_bienes || 0, data.monto_servicios || 0, data.total_monto_facturado,
    data.itbis_facturado || 0, data.itbis_retenido || 0,
    data.itbis_proporcionalidad || 0, data.itbis_costo || 0, data.itbis_por_adelantar || 0, data.itbis_percibido || 0,
    data.tipo_retencion_isr ?? null, data.monto_retencion_renta || 0, data.isr_percibido || 0,
    data.impuesto_selectivo || 0, data.otros_impuestos || 0, data.monto_propina_legal || 0,
    data.forma_pago || '1',
    errors.length === 0 ? 'borrador' : 'borrador',
    data.observaciones ?? null,
    errors.length > 0 ? JSON.stringify(errors) : null,
    usuario.id, usuario.id, now(), now()
  );
  res.json({ id, errores: errors });
});

tax606Router.put('/records/:id', permitir('administrador', 'cajero'), (req, res) => {
  const usuario = (req as any).usuario;
  const existing = db.prepare('SELECT * FROM tax_606_records WHERE id=?').get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: 'Registro no encontrado' });

  const periodoRow = db.prepare('SELECT estado FROM tax_606_periods WHERE periodo=?').get(existing.periodo) as any;
  if (periodoRow?.estado === 'cerrado') return res.status(400).json({ error: 'El período está cerrado' });

  const data = { ...existing, ...req.body };
  data.total_monto_facturado = (data.monto_bienes || 0) + (data.monto_servicios || 0);
  data.itbis_por_adelantar = Math.max(0,
    (data.itbis_facturado || 0) - (data.itbis_retenido || 0) - (data.itbis_proporcionalidad || 0) - (data.itbis_costo || 0)
  );

  const errors = validarRegistro606(data);

  // Audit log campos clave
  const auditCampos = ['rnc_cedula_suplidor','numero_comprobante','fecha_comprobante','total_monto_facturado','itbis_facturado','forma_pago'];
  const auditStmt = db.prepare('INSERT INTO tax_606_audit_logs(id,record_id,campo,valor_anterior,valor_nuevo,usuario_id,fecha_creacion) VALUES(?,?,?,?,?,?,?)');
  for (const campo of auditCampos) {
    if (String(existing[campo] ?? '') !== String(data[campo] ?? '')) {
      auditStmt.run(uid(), req.params.id, campo, String(existing[campo] ?? ''), String(data[campo] ?? ''), usuario.id, now());
    }
  }

  db.prepare(`UPDATE tax_606_records SET
    rnc_cedula_suplidor=?,tipo_identificacion=?,tipo_bienes_servicios=?,
    numero_comprobante=?,numero_comprobante_modificado=?,fecha_comprobante=?,fecha_pago=?,
    monto_bienes=?,monto_servicios=?,total_monto_facturado=?,itbis_facturado=?,itbis_retenido=?,
    itbis_proporcionalidad=?,itbis_costo=?,itbis_por_adelantar=?,itbis_percibido=?,
    tipo_retencion_isr=?,monto_retencion_renta=?,isr_percibido=?,impuesto_selectivo=?,
    otros_impuestos=?,monto_propina_legal=?,forma_pago=?,observaciones=?,
    errores_json=?,actualizado_por_id=?,fecha_actualizacion=?
    WHERE id=?`).run(
    data.rnc_cedula_suplidor, data.tipo_identificacion, data.tipo_bienes_servicios ?? null,
    data.numero_comprobante, data.numero_comprobante_modificado ?? null, data.fecha_comprobante, data.fecha_pago ?? null,
    data.monto_bienes || 0, data.monto_servicios || 0, data.total_monto_facturado,
    data.itbis_facturado || 0, data.itbis_retenido || 0,
    data.itbis_proporcionalidad || 0, data.itbis_costo || 0, data.itbis_por_adelantar || 0, data.itbis_percibido || 0,
    data.tipo_retencion_isr ?? null, data.monto_retencion_renta || 0, data.isr_percibido || 0,
    data.impuesto_selectivo || 0, data.otros_impuestos || 0, data.monto_propina_legal || 0,
    data.forma_pago || '1', data.observaciones ?? null,
    errors.length > 0 ? JSON.stringify(errors) : null,
    usuario.id, now(), req.params.id
  );
  res.json({ ok: true, errores: errors });
});

tax606Router.patch('/records/:id/estado', permitir('administrador', 'cajero'), (req, res) => {
  const { estado, excluido, excluido_justificacion } = req.body;
  const usuario = (req as any).usuario;
  const existing = db.prepare('SELECT estado FROM tax_606_records WHERE id=?').get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: 'No encontrado' });
  const allowedEstados = ['borrador', 'validado', 'exportado', 'anulado', 'rectificado'];
  if (estado && !allowedEstados.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });

  if (excluido !== undefined) {
    db.prepare('UPDATE tax_606_records SET excluido=?, excluido_justificacion=?, actualizado_por_id=?, fecha_actualizacion=? WHERE id=?')
      .run(excluido ? 1 : 0, excluido_justificacion ?? null, usuario.id, now(), req.params.id);
  }
  if (estado) {
    db.prepare('UPDATE tax_606_records SET estado=?, actualizado_por_id=?, fecha_actualizacion=? WHERE id=?').run(estado, usuario.id, now(), req.params.id);
    db.prepare('INSERT INTO tax_606_audit_logs(id,record_id,campo,valor_anterior,valor_nuevo,usuario_id,fecha_creacion) VALUES(?,?,?,?,?,?,?)')
      .run(uid(), req.params.id, 'estado', existing.estado, estado, usuario.id, now());
  }
  res.json({ ok: true });
});

// ─── Validación de período ───────────────────────────────────────────────────
tax606Router.post('/validate/:period', permitir('administrador', 'cajero'), (req, res) => {
  const { period } = req.params;
  const records = db.prepare("SELECT * FROM tax_606_records WHERE periodo=? AND excluido=0 AND estado!='anulado'").all(period) as any[];

  let totalErrores = 0;
  const updateStmt = db.prepare('UPDATE tax_606_records SET errores_json=?, estado=?, fecha_actualizacion=? WHERE id=?');
  for (const r of records) {
    const errors = validarRegistro606(r);
    const errJson = errors.length > 0 ? JSON.stringify(errors) : null;
    const estado = errors.length === 0 ? 'validado' : 'borrador';
    updateStmt.run(errJson, estado, now(), r.id);
    if (errors.length > 0) totalErrores++;
  }
  res.json({ total: records.length, con_errores: totalErrores, ok: totalErrores === 0 });
});

// ─── Preview TXT ─────────────────────────────────────────────────────────────
function generarTXT606(period: string): { txt: string; registros: any[]; totales: any } {
  const cfg = db.prepare('SELECT * FROM tax_configuration WHERE id=1').get() as any;
  const records = db.prepare(`SELECT * FROM tax_606_records
    WHERE periodo=? AND excluido=0 AND estado!='anulado'
    ORDER BY fecha_comprobante, numero_comprobante`).all(period) as any[];

  let totalBienes = 0, totalServicios = 0, totalFacturado = 0, totalItbis = 0, totalRetenido = 0, totalISR = 0;
  const lines: string[] = [];

  for (const r of records) {
    totalBienes += r.monto_bienes || 0;
    totalServicios += r.monto_servicios || 0;
    totalFacturado += r.total_monto_facturado || 0;
    totalItbis += r.itbis_facturado || 0;
    totalRetenido += r.itbis_retenido || 0;
    totalISR += r.monto_retencion_renta || 0;

    const rnc = r.rnc_cedula_suplidor.replace(/-/g, '');
    lines.push([
      padN(period, 6),
      padR(rnc, 11),
      padN(r.tipo_identificacion, 1),
      padN(r.tipo_bienes_servicios ?? '', 2),
      padN(r.numero_comprobante, 19),
      padN(r.numero_comprobante_modificado ?? '', 19),
      padN(r.fecha_comprobante?.replace(/-/g, '') ?? '', 8),
      padN(r.fecha_pago?.replace(/-/g, '') ?? '        ', 8),
      fmtAmt(r.monto_servicios || 0, 12),
      fmtAmt(r.monto_bienes || 0, 12),
      fmtAmt(r.total_monto_facturado || 0, 12),
      fmtAmt(r.itbis_facturado || 0, 12),
      fmtAmt(r.itbis_retenido || 0, 12),
      fmtAmt(r.itbis_proporcionalidad || 0, 12),
      fmtAmt(r.itbis_costo || 0, 12),
      fmtAmt(r.itbis_por_adelantar || 0, 12),
      fmtAmt(r.itbis_percibido || 0, 12),
      padN(r.tipo_retencion_isr ?? ' ', 2),
      fmtAmt(r.monto_retencion_renta || 0, 12),
      fmtAmt(r.isr_percibido || 0, 12),
      fmtAmt(r.impuesto_selectivo || 0, 12),
      fmtAmt(r.otros_impuestos || 0, 12),
      fmtAmt(r.monto_propina_legal || 0, 12),
      padN(r.forma_pago ?? '1', 1),
    ].join(''));
  }

  const txt = lines.join('\r\n');
  return {
    txt,
    registros: records,
    totales: { totalBienes, totalServicios, totalFacturado, totalItbis, totalRetenido, totalISR, cantidad: records.length }
  };
}

tax606Router.get('/preview/:period', permitir('administrador', 'cajero'), (req, res) => {
  const { period } = req.params;
  const { txt, totales } = generarTXT606(period);
  res.json({ preview: txt.substring(0, 5000), totales, periodo: period });
});

// ─── Exportar TXT ─────────────────────────────────────────────────────────────
tax606Router.post('/export/:period', permitir('administrador'), (req, res) => {
  const { period } = req.params;
  const usuario = (req as any).usuario;

  // Validar primero
  const records = db.prepare("SELECT * FROM tax_606_records WHERE periodo=? AND excluido=0 AND estado!='anulado'").all(period) as any[];
  if (records.length === 0) return res.status(400).json({ error: 'No hay registros activos en este período' });

  const conErrores = records.filter((r: any) => r.errores_json && r.errores_json !== '[]').length;
  if (conErrores > 0) return res.status(400).json({ error: `Hay ${conErrores} registros con errores. Corrígelos antes de exportar.` });

  const { txt, totales } = generarTXT606(period);
  const hash = crypto.createHash('sha256').update(txt).digest('hex');
  const cfg = db.prepare('SELECT rnc_contribuyente FROM tax_configuration WHERE id=1').get() as any;
  const nombreArchivo = `606_${cfg?.rnc_contribuyente ?? 'RNC'}_${period}.txt`;

  const exportId = uid();
  db.prepare(`INSERT INTO tax_606_exports(id,periodo,nombre_archivo,contenido_txt,hash_archivo,cantidad_registros,total_facturado,total_itbis,exportado_por_id,fecha_creacion)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
    exportId, period, nombreArchivo, txt, hash, totales.cantidad, totales.totalFacturado, totales.totalItbis, usuario.id, now()
  );

  // Marcar registros como exportados
  db.prepare("UPDATE tax_606_records SET estado='exportado', fecha_actualizacion=? WHERE periodo=? AND excluido=0 AND estado='validado'").run(now(), period);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  res.send(txt);
});

// ─── Historial de exportaciones ───────────────────────────────────────────────
tax606Router.get('/exports', permitir('administrador'), (req, res) => {
  const exports = db.prepare(`SELECT e.*, u.nombre_completo as exportado_por
    FROM tax_606_exports e LEFT JOIN usuarios u ON u.id=e.exportado_por_id
    ORDER BY e.fecha_creacion DESC LIMIT 50`).all();
  res.json({ exports });
});

tax606Router.get('/exports/:id/download', permitir('administrador'), (req, res) => {
  const exp = db.prepare('SELECT * FROM tax_606_exports WHERE id=?').get(req.params.id) as any;
  if (!exp) return res.status(404).json({ error: 'Exportación no encontrada' });
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${exp.nombre_archivo}"`);
  res.send(exp.contenido_txt);
});

// ─── Auditoría ───────────────────────────────────────────────────────────────
tax606Router.get('/audit', permitir('administrador'), (req, res) => {
  const { record_id } = req.query as any;
  const rows = record_id
    ? db.prepare('SELECT a.*, u.nombre_completo as usuario FROM tax_606_audit_logs a LEFT JOIN usuarios u ON u.id=a.usuario_id WHERE a.record_id=? ORDER BY a.fecha_creacion DESC').all(record_id)
    : db.prepare('SELECT a.*, u.nombre_completo as usuario FROM tax_606_audit_logs a LEFT JOIN usuarios u ON u.id=a.usuario_id ORDER BY a.fecha_creacion DESC LIMIT 200').all();
  res.json({ logs: rows });
});

// ─── Dashboard del período ────────────────────────────────────────────────────
tax606Router.get('/dashboard/:period', permitir('administrador', 'cajero'), (req, res) => {
  const { period } = req.params;
  const periodoRow = db.prepare('SELECT * FROM tax_606_periods WHERE periodo=?').get(period) as any;
  const stats = db.prepare(`SELECT
    COUNT(*) as total,
    SUM(CASE WHEN excluido=0 AND estado!='anulado' THEN 1 ELSE 0 END) as activos,
    SUM(CASE WHEN estado='validado' THEN 1 ELSE 0 END) as validados,
    SUM(CASE WHEN estado='exportado' THEN 1 ELSE 0 END) as exportados,
    SUM(CASE WHEN errores_json IS NOT NULL AND errores_json!='[]' THEN 1 ELSE 0 END) as con_errores,
    COALESCE(SUM(CASE WHEN excluido=0 AND estado!='anulado' THEN total_monto_facturado ELSE 0 END),0) as total_facturado,
    COALESCE(SUM(CASE WHEN excluido=0 AND estado!='anulado' THEN itbis_facturado ELSE 0 END),0) as total_itbis,
    COALESCE(SUM(CASE WHEN excluido=0 AND estado!='anulado' THEN itbis_retenido ELSE 0 END),0) as total_itbis_retenido,
    COALESCE(SUM(CASE WHEN excluido=0 AND estado!='anulado' THEN monto_retencion_renta ELSE 0 END),0) as total_isr
    FROM tax_606_records WHERE periodo=?`).get(period) as any;

  res.json({ periodo: period, estado_periodo: periodoRow?.estado ?? 'abierto', stats });
});
