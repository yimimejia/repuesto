import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../../db/connection.js';
import { auth, permitir } from '../../shared/auth.js';
import { emitir } from '../../realtime/hub.js';

const cxcRouter = Router();
const ahora = () => new Date().toISOString();
cxcRouter.use(auth);
const scorePorAtraso = (dias: number) => {
  if (dias >= 120) return { score: 'G', factor: 0 };
  if (dias >= 90) return { score: 'F', factor: 0.5 };
  if (dias >= 60) return { score: 'D', factor: 0.75 };
  if (dias >= 30) return { score: 'C', factor: 0.85 };
  if (dias >= 7) return { score: 'B', factor: 0.9 };
  return { score: 'A', factor: 1 };
};
const scoreStepUp: Record<string, string> = { G: 'F', F: 'D', D: 'C', C: 'B', B: 'A', A: 'A' };
const factorPorScore: Record<string, number> = { A: 1, B: 0.9, C: 0.85, D: 0.75, F: 0.5, G: 0 };

cxcRouter.get('/pendientes', permitir('cajero', 'administrador', 'vendedor', 'revendedor'), (req, res) => {
  const clienteId = req.query.cliente_id as string | undefined;
  const data = clienteId
    ? db.prepare(`SELECT c.*, cl.nombre as cliente_nombre, cl.limite_tiempo_dias, v.numero_interno,
        COALESCE(c.fecha_vencimiento, datetime(c.fecha_emision, '+' || COALESCE(cl.limite_tiempo_dias,0) || ' days')) as fecha_vencimiento_calculada,
        CAST(julianday(COALESCE(c.fecha_vencimiento, datetime(c.fecha_emision, '+' || COALESCE(cl.limite_tiempo_dias,0) || ' days'))) - julianday('now') AS INTEGER) as dias_restantes
      FROM cuentas_por_cobrar c
        JOIN clientes cl ON cl.id=c.cliente_id JOIN ventas v ON v.id=c.venta_id
        WHERE c.balance_pendiente>0 AND c.cliente_id=? ORDER BY c.fecha_emision ASC`).all(clienteId)
    : db.prepare(`SELECT c.*, cl.nombre as cliente_nombre, cl.limite_tiempo_dias, v.numero_interno,
        COALESCE(c.fecha_vencimiento, datetime(c.fecha_emision, '+' || COALESCE(cl.limite_tiempo_dias,0) || ' days')) as fecha_vencimiento_calculada,
        CAST(julianday(COALESCE(c.fecha_vencimiento, datetime(c.fecha_emision, '+' || COALESCE(cl.limite_tiempo_dias,0) || ' days'))) - julianday('now') AS INTEGER) as dias_restantes
      FROM cuentas_por_cobrar c
        JOIN clientes cl ON cl.id=c.cliente_id JOIN ventas v ON v.id=c.venta_id
        WHERE c.balance_pendiente>0 ORDER BY c.fecha_emision ASC`).all();
  res.json(data);
});

cxcRouter.post('/:id/cobrar', permitir('cajero', 'administrador', 'vendedor', 'revendedor'), (req, res) => {
  const usuario = (req as any).usuario;
  const id = req.params.id;
  const { tipo_pago, monto_efectivo = 0, monto_tarjeta = 0, monto_transferencia = 0, referencia, monto_recibido = 0 } = req.body;
  const cuenta = db.prepare('SELECT * FROM cuentas_por_cobrar WHERE id=?').get(id) as any;
  if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' });

  const total = Number(monto_efectivo) + Number(monto_tarjeta) + Number(monto_transferencia);
  if (total <= 0 || total - cuenta.balance_pendiente > 0.0001) return res.status(400).json({ error: 'Monto inválido' });
  const cambio = tipo_pago === 'efectivo' ? Math.max(0, Number(monto_recibido) - total) : 0;

  const now = ahora();
  const pagoId = uuid();
  db.prepare(`INSERT INTO pagos(id,cuenta_por_cobrar_id,tipo_pago,monto_total,monto_efectivo,monto_tarjeta,monto_transferencia,referencia,cambio,fecha_creacion,usuario_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(pagoId, id, tipo_pago, total, monto_efectivo, monto_tarjeta, monto_transferencia, referencia ?? null, cambio, now, usuario.id);
  db.prepare('INSERT INTO cobros_cxc(id,cuenta_por_cobrar_id,pago_id,monto_abono,fecha_creacion,usuario_id) VALUES(?,?,?,?,?,?)')
    .run(uuid(), id, pagoId, total, now, usuario.id);

  const nuevoBalance = Number(cuenta.balance_pendiente) - total;
  const nuevoEstado = nuevoBalance <= 0.0001 ? 'pagada_total' : 'parcialmente_pagada';
  db.prepare('UPDATE cuentas_por_cobrar SET balance_pendiente=?, estado=?, fecha_actualizacion=? WHERE id=?')
    .run(Math.max(0, nuevoBalance), nuevoEstado, now, id);

  db.prepare("UPDATE ventas SET estado=? WHERE id=? AND tipo_venta='credito'").run(nuevoEstado, cuenta.venta_id);

  const cliente = db.prepare('SELECT id, credito_score, credito_factor FROM clientes WHERE id=?').get(cuenta.cliente_id) as any;
  const atraso = db.prepare(`SELECT COALESCE(MAX(CAST(julianday('now') - julianday(COALESCE(fecha_vencimiento, fecha_emision)) AS INTEGER)),0) as atraso,
      COALESCE(SUM(balance_pendiente),0) as balance
    FROM cuentas_por_cobrar WHERE cliente_id=? AND balance_pendiente>0`).get(cuenta.cliente_id) as any;
  const diasAtraso = Math.max(0, Number(atraso?.atraso ?? 0));
  let nuevoScore = scorePorAtraso(diasAtraso).score;
  let nuevoFactor = scorePorAtraso(diasAtraso).factor;
  if (diasAtraso === 0 && Number(atraso?.balance ?? 0) === 0 && cliente?.credito_score && cliente.credito_score !== 'A') {
    nuevoScore = scoreStepUp[String(cliente.credito_score)] ?? 'A';
    nuevoFactor = factorPorScore[nuevoScore] ?? 1;
  }
  if (cliente && (cliente.credito_score !== nuevoScore || Number(cliente.credito_factor ?? 1) !== Number(nuevoFactor))) {
    db.prepare('UPDATE clientes SET credito_score=?, credito_factor=?, fecha_actualizacion=? WHERE id=?').run(nuevoScore, nuevoFactor, now, cuenta.cliente_id);
    db.prepare('INSERT INTO credit_score_logs(id,cliente_id,score_anterior,score_nuevo,factor_anterior,factor_nuevo,dias_atraso,motivo,usuario_id,fecha) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(uuid(), cuenta.cliente_id, cliente.credito_score ?? null, nuevoScore, cliente.credito_factor ?? 1, nuevoFactor, diasAtraso, 'cobro_cxc', usuario.id, now);
  }

  emitir('cobro_credito', { cuenta_id: id, monto_abono: total, balance_pendiente: Math.max(0, nuevoBalance) });
  res.json({ ok: true, balance_pendiente: Math.max(0, nuevoBalance), estado: nuevoEstado, cambio });
});

cxcRouter.get('/riesgo-resumen', permitir('cajero', 'administrador', 'vendedor', 'revendedor'), (_req, res) => {
  const rows = db.prepare(`SELECT credito_score as score, COUNT(*) as clientes, COALESCE(SUM(limite_credito),0) as limite_total
    FROM clientes WHERE estado='activo' GROUP BY credito_score ORDER BY credito_score ASC`).all() as any[];
  const logs = db.prepare('SELECT * FROM credit_score_logs ORDER BY fecha DESC LIMIT 50').all();
  res.json({ resumen: rows, historial: logs });
});

cxcRouter.get('/cuadre-dia', permitir('cajero', 'administrador', 'vendedor', 'revendedor'), (req, res) => {
  const usuario = (req as any).usuario;
  const soloPropios = usuario.rol === 'vendedor' || usuario.rol === 'revendedor';
  const where = soloPropios ? 'AND p.usuario_id=?' : '';
  const params = soloPropios ? [usuario.id] : [];
  const totales = db.prepare(`SELECT
      COALESCE(SUM(p.monto_total),0) as monto_total,
      COALESCE(SUM(p.monto_efectivo),0) as monto_efectivo,
      COALESCE(SUM(p.monto_tarjeta),0) as monto_tarjeta,
      COALESCE(SUM(p.monto_transferencia),0) as monto_transferencia
    FROM pagos p WHERE date(p.fecha_creacion)=date('now','localtime') ${where}`).get(...params) as any;
  const pagos = db.prepare(`SELECT p.id, p.fecha_creacion, p.tipo_pago, p.monto_total, c.cliente_id, cl.nombre as cliente_nombre, v.numero_interno
    FROM pagos p
    LEFT JOIN cuentas_por_cobrar c ON c.id=p.cuenta_por_cobrar_id
    LEFT JOIN clientes cl ON cl.id=c.cliente_id
    LEFT JOIN ventas v ON v.id=c.venta_id
    WHERE date(p.fecha_creacion)=date('now','localtime') ${where}
    ORDER BY p.fecha_creacion DESC LIMIT 100`).all(...params);
  res.json({ totales, pagos });
});

export { cxcRouter };
