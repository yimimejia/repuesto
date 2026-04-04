import { Router } from 'express';
import { auth } from '../../shared/auth.js';
import { db } from '../../db/connection.js';
import { registrarAuditoria } from '../../shared/auditoria.js';

const clientesRouter = Router();
clientesRouter.use(auth);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOC_RE = /^[0-9-]{9,15}$/;

clientesRouter.get('/', (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) {
    return res.json(db.prepare('SELECT * FROM clientes ORDER BY nombre ASC').all());
  }
  const like = `%${q}%`;
  res.json(db.prepare(`SELECT * FROM clientes
    WHERE codigo LIKE ? OR nombre LIKE ? OR documento LIKE ? OR cedula_rnc LIKE ? OR telefono LIKE ? OR telefono_1 LIKE ? OR telefono_2 LIKE ? OR correo LIKE ?
    ORDER BY nombre ASC`).all(like, like, like, like, like, like, like, like));
});

clientesRouter.get('/fidelidad/lista', (req, res) => {
  const data = db.prepare(`
    SELECT c.id, c.codigo, c.nombre, c.telefono_1, c.correo, c.en_programa_fidelidad,
      COALESCE((SELECT SUM(mf.puntos) FROM movimientos_fidelidad mf WHERE mf.cliente_id=c.id AND mf.tipo='acumulacion'),0)
       - COALESCE((SELECT SUM(mf.puntos) FROM movimientos_fidelidad mf WHERE mf.cliente_id=c.id AND mf.tipo='canje'),0) AS puntos_disponibles,
      COALESCE((SELECT SUM(mf.puntos) FROM movimientos_fidelidad mf WHERE mf.cliente_id=c.id AND mf.tipo='acumulacion'),0) AS puntos_acumulados,
      COALESCE((SELECT COUNT(*) FROM ventas v WHERE v.cliente_id=c.id AND v.estado NOT IN ('anulada')),0) AS total_compras,
      COALESCE((SELECT SUM(v.total) FROM ventas v WHERE v.cliente_id=c.id AND v.estado NOT IN ('anulada')),0) AS total_gastado
    FROM clientes c WHERE c.en_programa_fidelidad=1 AND c.estado='activo' ORDER BY c.nombre ASC`).all();
  res.json(data);
});

clientesRouter.get('/fidelidad/:id/movimientos', (req, res) => {
  const movs = db.prepare('SELECT * FROM movimientos_fidelidad WHERE cliente_id=? ORDER BY fecha DESC LIMIT 100').all(req.params.id);
  const resumen = db.prepare(`SELECT 
    COALESCE(SUM(CASE WHEN tipo='acumulacion' THEN puntos ELSE 0 END),0) as puntos_acumulados,
    COALESCE(SUM(CASE WHEN tipo='canje' THEN puntos ELSE 0 END),0) as puntos_canjeados
    FROM movimientos_fidelidad WHERE cliente_id=?`).get(req.params.id) as any;
  res.json({ movimientos: movs, resumen });
});

clientesRouter.post('/fidelidad/:id/ajuste', (req, res) => {
  const { puntos, descripcion, tipo } = req.body;
  if (!puntos || !tipo) return res.status(400).json({ error: 'puntos y tipo son obligatorios' });
  const id = `fidaj-${Date.now()}`;
  db.prepare('INSERT INTO movimientos_fidelidad(id, cliente_id, tipo, puntos, descripcion, fecha) VALUES(?,?,?,?,?,?)').run(id, req.params.id, tipo, Number(puntos), descripcion ?? '', new Date().toISOString());
  res.json({ ok: true });
});

clientesRouter.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM clientes WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Cliente no encontrado' });
  const historial = db.prepare('SELECT id, numero_interno, fecha_creacion, total, tipo_venta, estado FROM ventas WHERE cliente_id=? ORDER BY fecha_creacion DESC LIMIT 50').all(req.params.id);
  res.json({ cliente: row, historial_ventas: historial });
});

clientesRouter.get('/:id/score-history', (req, res) => {
  const rows = db.prepare('SELECT * FROM credit_score_logs WHERE cliente_id=? ORDER BY fecha DESC LIMIT 100').all(req.params.id);
  res.json(rows);
});

clientesRouter.post('/', (req, res) => {
  const usuario = (req as any).usuario;
  const data = req.body;
  if (!data.nombre) return res.status(400).json({ error: 'Nombre es obligatorio' });
  if (data.correo && !EMAIL_RE.test(String(data.correo))) return res.status(400).json({ error: 'Correo inválido' });
  if (data.cedula_rnc && !DOC_RE.test(String(data.cedula_rnc))) return res.status(400).json({ error: 'Cédula/RNC inválido' });

  const codigo = String(data.codigo ?? '').trim();
  if (!codigo) return res.status(400).json({ error: 'Código es obligatorio' });
  const codigoExistente = db.prepare('SELECT id FROM clientes WHERE codigo=?').get(codigo) as any;
  if (codigoExistente) return res.status(409).json({ error: 'Código de cliente ya existe' });

  const id = codigo;
  const idExistente = db.prepare('SELECT id FROM clientes WHERE id=?').get(id) as any;
  if (idExistente) return res.status(409).json({ error: 'ID/Código de cliente ya existe' });
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO clientes(id,codigo,sucursal_id,clase_cliente,cedula_rnc,nombre,representante,direccion,correo,fecha_nacimiento,telefono,telefono_1,telefono_2,limite_credito,limite_tiempo_dias,tipo_cliente,estatus_credito,foto_url,porcentaje_descuento,tipo_comprobante_fiscal,documento,estado,fecha_creacion,fecha_actualizacion,en_programa_fidelidad,credito_score,credito_factor,cierre_credito_motivo,cierre_credito_detalle)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      id,
      codigo,
      data.sucursal_id ?? null,
      data.clase_cliente ?? '',
      data.cedula_rnc ?? data.documento ?? '',
      data.nombre,
      data.representante ?? '',
      data.direccion ?? '',
      data.correo ?? '',
      data.fecha_nacimiento ?? null,
      data.telefono_1 ?? data.telefono ?? '',
      data.telefono_1 ?? data.telefono ?? '',
      data.telefono_2 ?? '',
      Number(data.limite_credito ?? 0),
      Number(data.limite_tiempo_dias ?? 0),
      data.tipo_cliente ?? '',
      data.estatus_credito === 'cerrado' ? 'cerrado' : 'abierto',
      data.foto_url ?? '',
      Number(data.porcentaje_descuento ?? 0),
      data.tipo_comprobante_fiscal ?? 'consumidor_final',
      data.cedula_rnc ?? data.documento ?? '',
      data.estado ?? 'activo',
      now,
      now,
      data.en_programa_fidelidad ? 1 : 0,
      'A',
      1,
      null,
      null,
    );
  registrarAuditoria('cliente', id, 'crear', `Cliente ${data.nombre} creado`, usuario?.id);
  res.status(201).json({ id });
});

clientesRouter.put('/:id', (req, res) => {
  const usuario = (req as any).usuario;
  const data = req.body;
  const current = db.prepare('SELECT * FROM clientes WHERE id=?').get(req.params.id) as any;
  if (!current) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (data.correo && !EMAIL_RE.test(String(data.correo))) return res.status(400).json({ error: 'Correo inválido' });
  if (data.cedula_rnc && !DOC_RE.test(String(data.cedula_rnc))) return res.status(400).json({ error: 'Cédula/RNC inválido' });

  const codigo = String(data.codigo ?? current.codigo ?? '').trim();
  if (!codigo) return res.status(400).json({ error: 'Código es obligatorio' });
  const codigoExistente = db.prepare('SELECT id FROM clientes WHERE codigo=? AND id<>?').get(codigo, req.params.id) as any;
  if (codigoExistente) return res.status(409).json({ error: 'Código de cliente ya existe' });

  const now = new Date().toISOString();
  const estatusNuevo = data.estatus_credito ?? current.estatus_credito;
  const cerrandoCredito = current.estatus_credito === 'abierto' && estatusNuevo === 'cerrado';
  const motivoCierre = data.cierre_credito_motivo ?? current.cierre_credito_motivo ?? null;
  const detalleCierre = data.cierre_credito_detalle ?? current.cierre_credito_detalle ?? null;
  if (cerrandoCredito && usuario?.rol === 'administrador') {
    if (!motivoCierre || !['sin_causa', 'no_paga'].includes(String(motivoCierre))) {
      return res.status(400).json({ error: 'Debe indicar motivo de cierre de crédito (sin_causa o no_paga)' });
    }
    if (motivoCierre === 'no_paga' && !String(detalleCierre ?? '').trim()) {
      return res.status(400).json({ error: 'Debe describir la causa cuando el motivo sea no_paga' });
    }
  }

  const atraso = db.prepare(`SELECT COALESCE(MAX(CAST(julianday('now') - julianday(COALESCE(fecha_vencimiento, fecha_emision)) AS INTEGER)),0) as atraso
    FROM cuentas_por_cobrar WHERE cliente_id=? AND balance_pendiente>0 AND julianday('now') > julianday(COALESCE(fecha_vencimiento, fecha_emision))`).get(req.params.id) as any;
  const diasAtraso = Number(atraso?.atraso ?? 0);
  let score = 'A';
  let factor = 1;
  if (diasAtraso >= 120) { score = 'G'; factor = 0; }
  else if (diasAtraso >= 90) { score = 'F'; factor = 0.5; }
  else if (diasAtraso >= 60) { score = 'D'; factor = 0.75; }
  else if (diasAtraso >= 30) { score = 'C'; factor = 0.85; }
  else if (diasAtraso >= 7) { score = 'B'; factor = 0.9; }

  db.prepare(`UPDATE clientes SET
    codigo=?, sucursal_id=?, clase_cliente=?, cedula_rnc=?, nombre=?, representante=?, direccion=?, correo=?, fecha_nacimiento=?, telefono=?, telefono_1=?, telefono_2=?,
    limite_credito=?, limite_tiempo_dias=?, tipo_cliente=?, estatus_credito=?, foto_url=?, porcentaje_descuento=?, tipo_comprobante_fiscal=?, documento=?, estado=?, en_programa_fidelidad=?, fecha_actualizacion=?, credito_score=?, credito_factor=?, cierre_credito_motivo=?, cierre_credito_detalle=?
    WHERE id=?`)
    .run(
      codigo,
      data.sucursal_id ?? current.sucursal_id,
      data.clase_cliente ?? current.clase_cliente,
      data.cedula_rnc ?? current.cedula_rnc,
      data.nombre ?? current.nombre,
      data.representante ?? current.representante,
      data.direccion ?? current.direccion,
      data.correo ?? current.correo,
      data.fecha_nacimiento ?? current.fecha_nacimiento,
      data.telefono_1 ?? data.telefono ?? current.telefono,
      data.telefono_1 ?? data.telefono ?? current.telefono_1,
      data.telefono_2 ?? current.telefono_2,
      Number(data.limite_credito ?? current.limite_credito ?? 0),
      Number(data.limite_tiempo_dias ?? current.limite_tiempo_dias ?? 0),
      data.tipo_cliente ?? current.tipo_cliente,
      estatusNuevo,
      data.foto_url ?? current.foto_url,
      Number(data.porcentaje_descuento ?? current.porcentaje_descuento ?? 0),
      data.tipo_comprobante_fiscal ?? current.tipo_comprobante_fiscal,
      data.cedula_rnc ?? current.documento,
      data.estado ?? current.estado,
      data.en_programa_fidelidad !== undefined ? (data.en_programa_fidelidad ? 1 : 0) : (current.en_programa_fidelidad ?? 0),
      now,
      score,
      factor,
      estatusNuevo === 'cerrado' ? motivoCierre : null,
      estatusNuevo === 'cerrado' ? detalleCierre : null,
      req.params.id,
    );
  if (current.credito_score !== score || Number(current.credito_factor ?? 1) !== Number(factor)) {
    db.prepare('INSERT INTO credit_score_logs(id,cliente_id,score_anterior,score_nuevo,factor_anterior,factor_nuevo,dias_atraso,motivo,usuario_id,fecha) VALUES(lower(hex(randomblob(16))),?,?,?,?,?,?,?,?,?)')
      .run(req.params.id, current.credito_score ?? null, score, current.credito_factor ?? 1, factor, diasAtraso, 'actualizacion_cliente', usuario?.id ?? null, now);
  }
  registrarAuditoria('cliente', req.params.id, 'editar', `Cliente ${data.nombre ?? current.nombre} actualizado`, usuario?.id);
  res.json({ ok: true });
});

clientesRouter.delete('/:id', (req, res) => {
  const usuario = (req as any).usuario;
  const now = new Date().toISOString();
  const r = db.prepare("UPDATE clientes SET estado='inactivo', fecha_actualizacion=? WHERE id=?").run(now, req.params.id);
  if (!r.changes) return res.status(404).json({ error: 'Cliente no encontrado' });
  registrarAuditoria('cliente', req.params.id, 'inactivar', 'Cliente inactivado', usuario?.id);
  res.json({ ok: true });
});

export { clientesRouter };
