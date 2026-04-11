import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../../db/connection.js';
import { auth, permitir } from '../../shared/auth.js';
import { ajustarInventario } from '../inventario/service.js';
import { registrarAuditoria } from '../../shared/auditoria.js';
import { exigirSucursalUsuario } from '../../shared/sucursales.js';

const comprasRouter = Router();
comprasRouter.use(auth, permitir('administrador'));
const ahora = () => new Date().toISOString();

comprasRouter.get('/', (req, res) => {
  const sucursal = String(req.query.sucursal_id ?? '').trim();
  const suplidor = String(req.query.suplidor_id ?? '').trim();
  let sql = `SELECT c.*, s.nombre_comercial as suplidor_nombre, su.nombre as sucursal_nombre
    FROM compras c JOIN suplidores s ON s.id=c.suplidor_id JOIN sucursales su ON su.id=c.sucursal_id WHERE 1=1`;
  const params: any[] = [];
  if (sucursal) { sql += ' AND c.sucursal_id=?'; params.push(sucursal); }
  if (suplidor) { sql += ' AND c.suplidor_id=?'; params.push(suplidor); }
  sql += ' ORDER BY c.fecha_creacion DESC';
  res.json(db.prepare(sql).all(...params));
});

comprasRouter.post('/', (req, res) => {
  const usuario = (req as any).usuario;
  const d = req.body;
  if (!d.suplidor_id || !d.sucursal_id || !Array.isArray(d.items) || d.items.length === 0) return res.status(400).json({ error: 'Compra inválida' });
  try {
    exigirSucursalUsuario(usuario.id, usuario.rol, d.sucursal_id);
  } catch (e: any) {
    return res.status(403).json({ error: e.message });
  }
  const now = ahora();
  const id = uuid();
  const codigo = d.codigo_compra ?? `C-${Date.now()}`;

  let subtotal = 0; let itbis = 0; let descuento = 0;
  for (const i of d.items) {
    const base = Number(i.cantidad) * Number(i.costo_unitario);
    const it = base * Number(i.itbis_tasa ?? 0);
    const desc = Number(i.descuento_monto ?? 0);
    subtotal += base;
    itbis += it;
    descuento += desc;
  }
  const total = subtotal + itbis - descuento;

  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO compras(id,codigo_compra,suplidor_id,numero_factura,numero_ncf,fecha_factura,fecha_vencimiento,sucursal_id,empleado_id,condicion_compra,estado_pago,estado,observaciones,subtotal,itbis_total,descuento_total,total,fecha_creacion,fecha_actualizacion)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, codigo, d.suplidor_id, d.numero_factura ?? '', d.numero_ncf ?? '', d.fecha_factura ?? now, d.fecha_vencimiento ?? null, d.sucursal_id, d.empleado_id ?? usuario.id, d.condicion_compra ?? 'contado', d.estado_pago ?? 'pendiente', 'activa', d.observaciones ?? '', subtotal, itbis, descuento, total, now, now);

    const ins = db.prepare(`INSERT INTO detalle_compras(id,compra_id,producto_id,descripcion,cantidad,costo_unitario,itbis_tasa,itbis_monto,descuento_monto,subtotal_linea,total_linea)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
    for (const i of d.items) {
      const base = Number(i.cantidad) * Number(i.costo_unitario);
      const it = base * Number(i.itbis_tasa ?? 0);
      const desc = Number(i.descuento_monto ?? 0);
      const tl = base + it - desc;
      ins.run(uuid(), id, i.producto_id, i.descripcion ?? '', Number(i.cantidad), Number(i.costo_unitario), Number(i.itbis_tasa ?? 0), it, desc, base, tl);

      ajustarInventario({
        sucursalId: d.sucursal_id,
        productoId: i.producto_id,
        cantidadDelta: Number(i.cantidad),
        tipo: 'entrada_compra',
        referenciaTipo: 'compra',
        referenciaId: id,
        usuarioId: usuario.id,
      });
    }
  });

  tx();
  registrarAuditoria('compra', id, 'crear', `Compra ${codigo} registrada`, usuario.id);

  // ── Auto-crear registro Formato 606 ────────────────────────────────────────
  try {
    const suplidor = db.prepare('SELECT rnc_cedula, nombre_comercial FROM suplidores WHERE id=?').get(d.suplidor_id) as any;
    const rnc = (suplidor?.rnc_cedula ?? '').replace(/-/g, '').trim();
    if (rnc && d.numero_ncf) {
      const fechaRef = (d.fecha_factura ?? now).substring(0, 10);
      const periodo = fechaRef.replace(/-/g, '').substring(0, 6);
      const tipoId = rnc.length === 9 ? '1' : '2';
      const formaMap: Record<string, string> = { contado: '1', credito: '2', 'tarjeta-credito': '3', 'tarjeta-debito': '4', 'cheque': '5', mixto: '6' };
      const formaPago = formaMap[d.condicion_compra ?? 'contado'] ?? '1';
      const montoBase = subtotal - descuento;
      const itbisRecordado = itbis;
      const totalFacturado = montoBase + itbisRecordado;

      const periodoRow = db.prepare('SELECT periodo FROM tax_606_periods WHERE periodo=?').get(periodo);
      if (!periodoRow) {
        db.prepare('INSERT OR IGNORE INTO tax_606_periods(periodo,estado,fecha_creacion) VALUES(?,?,?)').run(periodo, 'abierto', now);
      }

      const dup = db.prepare(`SELECT id FROM tax_606_records WHERE periodo=? AND rnc_cedula_suplidor=? AND numero_comprobante=? AND estado!='anulado'`).get(periodo, rnc, d.numero_ncf);
      if (!dup) {
        db.prepare(`INSERT INTO tax_606_records(
          id,periodo,rnc_cedula_suplidor,tipo_identificacion,
          numero_comprobante,fecha_comprobante,
          monto_bienes,monto_servicios,total_monto_facturado,
          itbis_facturado,itbis_retenido,itbis_proporcionalidad,itbis_costo,itbis_por_adelantar,
          itbis_percibido,monto_retencion_renta,isr_percibido,
          impuesto_selectivo,otros_impuestos,monto_propina_legal,
          forma_pago,estado,observaciones,errores_json,
          creado_por_id,actualizado_por_id,fecha_creacion,fecha_actualizacion
        ) VALUES(?,?,?,?,?,?,?,?,?,?,0,0,0,?,0,0,0,0,0,0,?,?,?,?,?,?,?,?)`).run(
          uuid(), periodo, rnc, tipoId,
          d.numero_ncf, fechaRef,
          montoBase, 0, totalFacturado,
          itbisRecordado, Math.max(0, itbisRecordado),
          formaPago, 'borrador', d.observaciones ?? null, null,
          usuario.id, usuario.id, now, now
        );
      }
    }
  } catch (_) { /* No interrumpir si falla el 606 */ }

  res.status(201).json({ id, codigo_compra: codigo, total });
});


comprasRouter.put('/:id', (req, res) => {
  const usuario = (req as any).usuario;
  const compra = db.prepare('SELECT * FROM compras WHERE id=?').get(req.params.id) as any;
  try {
    exigirSucursalUsuario(usuario.id, usuario.rol, compra?.sucursal_id);
  } catch (e: any) {
    return res.status(403).json({ error: e.message });
  }
  if (!compra) return res.status(404).json({ error: 'Compra no encontrada' });
  if (compra.estado !== 'activa') return res.status(400).json({ error: 'Solo se puede editar compra activa' });
  const d = req.body;
  if (!Array.isArray(d.items) || d.items.length === 0) return res.status(400).json({ error: 'Detalle inválido' });

  try {
    exigirSucursalUsuario(usuario.id, usuario.rol, compra.sucursal_id);
  } catch (e: any) {
    return res.status(403).json({ error: e.message });
  }

  let subtotal = 0; let itbis = 0; let descuento = 0;
  for (const i of d.items) {
    const base = Number(i.cantidad) * Number(i.costo_unitario);
    subtotal += base;
    itbis += base * Number(i.itbis_tasa ?? 0);
    descuento += Number(i.descuento_monto ?? 0);
  }
  const total = subtotal + itbis - descuento;

  const tx = db.transaction(() => {
    const old = db.prepare('SELECT * FROM detalle_compras WHERE compra_id=?').all(compra.id) as any[];
    for (const o of old) {
      ajustarInventario({ sucursalId: compra.sucursal_id, productoId: o.producto_id, cantidadDelta: -Number(o.cantidad), tipo: 'reversa_compra', referenciaTipo: 'compra_edicion', referenciaId: compra.id, usuarioId: usuario.id });
    }
    db.prepare('DELETE FROM detalle_compras WHERE compra_id=?').run(compra.id);

    const ins = db.prepare(`INSERT INTO detalle_compras(id,compra_id,producto_id,descripcion,cantidad,costo_unitario,itbis_tasa,itbis_monto,descuento_monto,subtotal_linea,total_linea)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
    for (const i of d.items) {
      const base = Number(i.cantidad) * Number(i.costo_unitario);
      const it = base * Number(i.itbis_tasa ?? 0);
      const desc = Number(i.descuento_monto ?? 0);
      ins.run(uuid(), compra.id, i.producto_id, i.descripcion ?? '', Number(i.cantidad), Number(i.costo_unitario), Number(i.itbis_tasa ?? 0), it, desc, base, base + it - desc);
      ajustarInventario({ sucursalId: compra.sucursal_id, productoId: i.producto_id, cantidadDelta: Number(i.cantidad), tipo: 'entrada_compra', referenciaTipo: 'compra_edicion', referenciaId: compra.id, usuarioId: usuario.id });
    }

    db.prepare('UPDATE compras SET numero_factura=?, numero_ncf=?, fecha_factura=?, fecha_vencimiento=?, condicion_compra=?, estado_pago=?, observaciones=?, subtotal=?, itbis_total=?, descuento_total=?, total=?, fecha_actualizacion=? WHERE id=?')
      .run(d.numero_factura ?? compra.numero_factura, d.numero_ncf ?? compra.numero_ncf, d.fecha_factura ?? compra.fecha_factura, d.fecha_vencimiento ?? compra.fecha_vencimiento, d.condicion_compra ?? compra.condicion_compra, d.estado_pago ?? compra.estado_pago, d.observaciones ?? compra.observaciones, subtotal, itbis, descuento, total, ahora(), compra.id);
  });

  tx();
  registrarAuditoria('compra', compra.id, 'editar', 'Compra editada con recálculo y ajuste de inventario', usuario.id);
  res.json({ ok: true, total });
});

comprasRouter.post('/:id/anular', (req, res) => {
  const usuario = (req as any).usuario;
  const compra = db.prepare('SELECT * FROM compras WHERE id=?').get(req.params.id) as any;
  try {
    exigirSucursalUsuario(usuario.id, usuario.rol, compra?.sucursal_id);
  } catch (e: any) {
    return res.status(403).json({ error: e.message });
  }
  if (!compra) return res.status(404).json({ error: 'Compra no encontrada' });
  if (compra.estado === 'anulada') return res.status(400).json({ error: 'Compra ya anulada' });
  const detalles = db.prepare('SELECT * FROM detalle_compras WHERE compra_id=?').all(req.params.id) as any[];

  const tx = db.transaction(() => {
    for (const d of detalles) {
      ajustarInventario({
        sucursalId: compra.sucursal_id,
        productoId: d.producto_id,
        cantidadDelta: -Number(d.cantidad),
        tipo: 'reversa_compra',
        referenciaTipo: 'compra_anulada',
        referenciaId: compra.id,
        usuarioId: usuario.id,
      });
    }
    db.prepare("UPDATE compras SET estado='anulada', fecha_actualizacion=? WHERE id=?").run(ahora(), req.params.id);
  });

  tx();
  registrarAuditoria('compra', req.params.id, 'anular', 'Compra anulada con reversa de inventario', usuario.id);
  res.json({ ok: true });
});

export { comprasRouter };
