import { Router } from 'express';
import { auth, permitir } from '../../shared/auth.js';
import { db } from '../../db/connection.js';

const reportesRouter = Router();
reportesRouter.use(auth, permitir('administrador'));

reportesRouter.get('/dgii-607', (_req, res) => {
  const rows = db.prepare(`SELECT v.numero_interno, v.ncf, v.fecha_comprobante, c.cedula_rnc as rnc_cedula, v.subtotal, v.itbis_total, v.total,
      v.tipo_venta, v.estado_comprobante, su.codigo as sucursal
    FROM ventas v JOIN clientes c ON c.id=v.cliente_id LEFT JOIN sucursales su ON su.id=v.sucursal_id
    WHERE v.estado_comprobante='emitido'`).all();
  res.json(rows);
});

reportesRouter.get('/dgii-608', (_req, res) => {
  const rows = db.prepare(`SELECT numero_interno, ncf, fecha_comprobante, motivo_anulacion FROM ventas WHERE estado='anulada'`).all();
  res.json(rows);
});

reportesRouter.get('/clientes', (_req, res) => {
  const rows = db.prepare(`SELECT
      c.codigo as id,
      c.nombre,
      COALESCE(c.telefono_1, c.telefono, '') as telefono,
      COALESCE(c.cedula_rnc, c.documento, '') as documento,
      c.direccion,
      c.estado,
      c.fecha_creacion,
      c.fecha_actualizacion,
      c.codigo,
      COALESCE(s.nombre, '—') as sucursal
    FROM clientes c
    LEFT JOIN sucursales s ON s.id = c.sucursal_id
    ORDER BY c.nombre`).all();
  res.json(rows);
});
reportesRouter.get('/suplidores', (_req, res) => res.json(db.prepare('SELECT * FROM suplidores ORDER BY nombre_comercial').all()));
reportesRouter.get('/productos', (_req, res) => res.json(db.prepare('SELECT * FROM productos ORDER BY nombre').all()));
reportesRouter.get('/inventario-sucursal', (_req, res) => {
  const rows = db.prepare(`SELECT s.nombre as sucursal, p.codigo, p.nombre, i.stock
    FROM inventario_sucursal i JOIN sucursales s ON s.id=i.sucursal_id JOIN productos p ON p.id=i.producto_id
    ORDER BY s.nombre, p.nombre`).all();
  res.json(rows);
});
reportesRouter.get('/compras-por-suplidor', (_req, res) => {
  const rows = db.prepare(`SELECT sp.nombre_comercial, COUNT(*) as cantidad, COALESCE(SUM(c.total),0) as monto
    FROM compras c JOIN suplidores sp ON sp.id=c.suplidor_id WHERE c.estado='activa'
    GROUP BY sp.id ORDER BY monto DESC`).all();
  res.json(rows);
});
reportesRouter.get('/compras-por-sucursal', (_req, res) => {
  const rows = db.prepare(`SELECT s.nombre as sucursal, COUNT(*) as cantidad, COALESCE(SUM(c.total),0) as monto
    FROM compras c JOIN sucursales s ON s.id=c.sucursal_id WHERE c.estado='activa'
    GROUP BY s.id ORDER BY monto DESC`).all();
  res.json(rows);
});
reportesRouter.get('/ventas-por-sucursal', (_req, res) => {
  const rows = db.prepare(`SELECT s.nombre as sucursal, COUNT(*) as cantidad, COALESCE(SUM(v.total),0) as monto
    FROM ventas v JOIN sucursales s ON s.id=v.sucursal_id WHERE v.estado<>'anulada'
    GROUP BY s.id ORDER BY monto DESC`).all();
  res.json(rows);
});

reportesRouter.get('/eficiencia-vendedores', (_req, res) => {
  const rows = db.prepare(`SELECT
      u.id as vendedor_id,
      u.nombre_completo as vendedor,
      r.nombre as rol,
      COALESCE(vs.cantidad_ventas, 0) as cantidad_ventas,
      COALESCE(vs.total_vendido, 0) as total_vendido,
      CASE WHEN COALESCE(vs.cantidad_ventas, 0) > 0 THEN ROUND(vs.total_vendido / vs.cantidad_ventas, 2) ELSE 0 END as ticket_promedio,
      COALESCE(os.ordenes_creadas, 0) as ordenes_creadas,
      COALESCE(os.ordenes_completadas, 0) as ordenes_completadas,
      CASE WHEN COALESCE(os.ordenes_creadas, 0) > 0
        THEN ROUND((CAST(os.ordenes_completadas AS REAL) / os.ordenes_creadas) * 100, 2)
        ELSE 0 END as eficiencia_ordenes_pct
    FROM usuarios u
    JOIN roles r ON r.id=u.rol_id
    LEFT JOIN (
      SELECT vendedor_id, COUNT(*) as cantidad_ventas, COALESCE(SUM(total),0) as total_vendido
      FROM ventas
      WHERE estado<>'anulada'
      GROUP BY vendedor_id
    ) vs ON vs.vendedor_id=u.id
    LEFT JOIN (
      SELECT usuario_creador_id,
        COUNT(*) as ordenes_creadas,
        SUM(CASE WHEN estado IN ('empacando','completada') THEN 1 ELSE 0 END) as ordenes_completadas
      FROM orders
      GROUP BY usuario_creador_id
    ) os ON os.usuario_creador_id=u.id
    WHERE u.estado='activo' AND r.nombre IN ('vendedor', 'revendedor')
    ORDER BY total_vendido DESC, eficiencia_ordenes_pct DESC, vendedor ASC`).all();
  res.json(rows);
});
reportesRouter.get('/cxc', (_req, res) => {
  const rows = db.prepare(`SELECT
      c.id as cxc_ref,
      v.numero_interno as venta,
      cl.codigo as cliente_codigo,
      cl.nombre as cliente_nombre,
      c.monto_original,
      c.balance_pendiente,
      c.fecha_emision,
      COALESCE(c.fecha_vencimiento, datetime(c.fecha_emision, '+' || COALESCE(cl.limite_tiempo_dias,0) || ' days')) as fecha_vencimiento,
      c.condicion_credito,
      c.estado,
      c.fecha_creacion,
      c.fecha_actualizacion
    FROM cuentas_por_cobrar c
    JOIN clientes cl ON cl.id=c.cliente_id
    JOIN ventas v ON v.id=c.venta_id
    WHERE c.balance_pendiente > 0 ORDER BY c.fecha_emision`).all();
  res.json(rows);
});
reportesRouter.get('/existencia-minima', (_req, res) => {
  const rows = db.prepare('SELECT * FROM productos WHERE existencia <= existencia_minima ORDER BY existencia ASC').all();
  res.json(rows);
});
reportesRouter.get('/base-606', (_req, res) => {
  const rows = db.prepare(`SELECT
      r.periodo, r.numero_comprobante, r.rnc_cedula_suplidor, r.fecha_comprobante,
      r.fecha_pago, r.monto_bienes, r.monto_servicios, r.total_monto_facturado,
      r.itbis_facturado, r.itbis_retenido, r.monto_retencion_renta, r.forma_pago,
      r.estado, r.tipo_bienes_servicios
    FROM tax_606_records r
    WHERE r.excluido=0 AND r.estado != 'anulado'
    ORDER BY r.periodo DESC, r.fecha_comprobante DESC LIMIT 500`).all();
  res.json(rows);
});

export { reportesRouter };
