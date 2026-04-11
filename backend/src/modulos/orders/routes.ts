import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../../db/connection.js';
import { auth, permitir, permitirCapacidad } from '../../shared/auth.js';
import { registrarAuditoria } from '../../shared/auditoria.js';

const ordersRouter = Router();
ordersRouter.use(auth);
const now = () => new Date().toISOString();

ordersRouter.get('/', permitir('cajero', 'administrador', 'revendedor', 'buscador', 'vendedor', 'chofer'), (req, res) => {
  const usuario = (req as any).usuario;
  const base = `SELECT o.*, c.nombre as cliente_nombre, c.codigo as cliente_codigo, c.direccion, c.ciudad, c.telefono_1,
    u.nombre_completo as usuario_creador,
    (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id=o.id) as cantidad_items,
    (SELECT u2.nombre_completo FROM order_assignments oa JOIN usuarios u2 ON u2.id=oa.picker_usuario_id WHERE oa.order_id=o.id ORDER BY oa.fecha_creacion DESC LIMIT 1) as picker_asignado,
    (SELECT COUNT(*) FROM bundles b WHERE b.order_id=o.id) as total_bultos,
    (SELECT GROUP_CONCAT(CAST(b2.numero_bulto AS TEXT), ', ') FROM bundles b2 WHERE b2.order_id=o.id ORDER BY b2.numero_bulto) as bultos_lista,
    (SELECT uc.nombre_completo FROM usuarios uc WHERE uc.id=o.chofer_id) as chofer_nombre
    FROM orders o
    JOIN clientes c ON c.id=o.cliente_id
    JOIN usuarios u ON u.id=o.usuario_creador_id`;

  const rows = usuario.rol === 'buscador'
    ? db.prepare(base + ` WHERE o.estado NOT IN ('buscada_completa','en_verificacion','verificada','completada','en_camino','entregado') AND EXISTS (SELECT 1 FROM order_assignments oa WHERE oa.order_id=o.id AND oa.picker_usuario_id=?) ORDER BY o.fecha_creacion DESC`).all(usuario.id)
    : usuario.rol === 'vendedor'
      ? db.prepare(base + ` WHERE o.usuario_creador_id=? AND o.estado NOT IN ('completada','en_camino','entregado') ORDER BY o.fecha_creacion DESC`).all(usuario.id)
      : usuario.rol === 'revendedor'
        ? db.prepare(base + ' WHERE o.usuario_creador_id=? ORDER BY o.fecha_creacion DESC').all(usuario.id)
        : usuario.rol === 'chofer'
          ? db.prepare(base + ` WHERE o.chofer_id=? AND o.estado IN ('en_camino') ORDER BY o.fecha_creacion DESC`).all(usuario.id)
          : db.prepare(base + ' ORDER BY o.fecha_creacion DESC').all();

  res.json(rows);
});

ordersRouter.get('/report', permitir('administrador'), (_req, res) => {
  const rows = db.prepare(`SELECT
      o.id,
      o.numero_orden,
      o.estado,
      o.fecha_creacion,
      o.fecha_actualizacion,
      c.nombre as cliente_nombre,
      uc.nombre_completo as creado_por,
      ua.nombre_completo as picker_asignado,
      uv.nombre_completo as verificador,
      oa.fecha_creacion as fecha_asignacion,
      (SELECT MIN(ov.fecha_creacion) FROM order_verifications ov WHERE ov.order_id=o.id) as fecha_inicio_verificacion,
      (SELECT MAX(ov.fecha_creacion) FROM order_verifications ov WHERE ov.order_id=o.id) as fecha_fin_verificacion,
      (SELECT MAX(b.fecha_cierre) FROM bundles b WHERE b.order_id=o.id) as fecha_cierre_bultos
    FROM orders o
    JOIN clientes c ON c.id=o.cliente_id
    LEFT JOIN usuarios uc ON uc.id=o.usuario_creador_id
    LEFT JOIN order_assignments oa ON oa.order_id=o.id
    LEFT JOIN usuarios ua ON ua.id=oa.picker_usuario_id
    LEFT JOIN order_verifications ovx ON ovx.order_id=o.id
    LEFT JOIN usuarios uv ON uv.id=ovx.verifier_usuario_id
    GROUP BY o.id
    ORDER BY o.fecha_creacion DESC
    LIMIT 500`).all() as any[];

  const report = rows.map((r: any) => {
    const creacion = r.fecha_creacion ? new Date(r.fecha_creacion).getTime() : 0;
    const asignacion = r.fecha_asignacion ? new Date(r.fecha_asignacion).getTime() : 0;
    const iniVerif = r.fecha_inicio_verificacion ? new Date(r.fecha_inicio_verificacion).getTime() : 0;
    const finVerif = r.fecha_fin_verificacion ? new Date(r.fecha_fin_verificacion).getTime() : 0;
    const cierre = r.fecha_cierre_bultos ? new Date(r.fecha_cierre_bultos).getTime() : 0;
    const mins = (a: number, b: number) => (a > 0 && b > 0 && b >= a ? Math.round((b - a) / 60000) : null);
    return {
      ...r,
      min_creacion_a_asignacion: mins(creacion, asignacion),
      min_asignacion_a_inicio_verificacion: mins(asignacion, iniVerif),
      min_verificacion: mins(iniVerif, finVerif),
      min_total_hasta_cierre: mins(creacion, cierre),
    };
  });

  const promedios = db.prepare(`SELECT
      ROUND(AVG((julianday(COALESCE((SELECT oa.fecha_creacion FROM order_assignments oa WHERE oa.order_id=o.id ORDER BY oa.fecha_creacion DESC LIMIT 1), o.fecha_creacion)) - julianday(o.fecha_creacion))*24*60),2) as prom_min_creacion_asignacion,
      ROUND(AVG((julianday(COALESCE((SELECT MAX(b.fecha_cierre) FROM bundles b WHERE b.order_id=o.id), o.fecha_actualizacion)) - julianday(o.fecha_creacion))*24*60),2) as prom_min_total_cierre
    FROM orders o`).get();

  res.json({ rows: report, promedios });
});

ordersRouter.post('/', permitir('revendedor', 'administrador', 'al_por_mayor'), (req, res) => {
  const usuario = (req as any).usuario;
  const { cliente_id, items, observaciones, pago_registrado = false } = req.body;
  if (!cliente_id || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Orden inválida' });
  const id = uuid();
  const numero = `ORD-${Date.now()}`;
  const ts = now();
  const total = items.reduce((a: number, i: any) => a + Number(i.cantidad) * Number(i.precio_unitario), 0);
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO orders(id,numero_orden,cliente_id,usuario_creador_id,estado,observaciones,pago_registrado,total,fecha_creacion,fecha_actualizacion) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(id, numero, cliente_id, usuario.id, 'creada', observaciones ?? null, pago_registrado ? 1 : 0, total, ts, ts);
    const ins = db.prepare('INSERT INTO order_items(id,order_id,producto_id,descripcion,marca,ubicacion,cantidad,precio_unitario,encontrado,cantidad_verificada) VALUES(?,?,?,?,?,?,?,?,0,0)');
    for (const i of items) {
      const p = db.prepare('SELECT nombre, marca, ubicacion FROM productos WHERE id=?').get(i.producto_id) as any;
      ins.run(uuid(), id, i.producto_id, p?.nombre ?? i.descripcion ?? '', p?.marca ?? null, p?.ubicacion ?? null, i.cantidad, i.precio_unitario);
    }
  });
  tx();
  registrarAuditoria('orders', id, 'crear', 'Orden creada por revendedor', usuario.id);
  res.status(201).json({ id, numero_orden: numero, estado: 'creada' });
});

ordersRouter.post('/:id/asignar-picker', permitir('cajero', 'administrador'), permitirCapacidad('can_assign_picker'), (req, res) => {
  const usuario = (req as any).usuario;
  const { picker_usuario_id } = req.body;
  if (!picker_usuario_id) return res.status(400).json({ error: 'Picker requerido' });
  db.prepare('INSERT INTO order_assignments(id,order_id,picker_usuario_id,assigned_by_usuario_id,fecha_creacion) VALUES(?,?,?,?,?)').run(uuid(), req.params.id, picker_usuario_id, usuario.id, now());
  db.prepare("UPDATE orders SET estado='en_busqueda', fecha_actualizacion=? WHERE id=?").run(now(), req.params.id);
  registrarAuditoria('orders', String(req.params.id), 'asignar_picker', `Asignado picker ${picker_usuario_id}`, usuario.id);
  res.json({ ok: true });
});

ordersRouter.get('/:id/picker-view', permitir('buscador', 'vendedor', 'administrador', 'cajero'), (req, res) => {
  const items = db.prepare(`SELECT oi.id, oi.descripcion, oi.marca, oi.cantidad, oi.ubicacion, oi.encontrado
    FROM order_items oi WHERE oi.order_id=? ORDER BY oi.descripcion`).all(req.params.id);
  res.json(items);
});

ordersRouter.post('/:id/items/:itemId/found', permitir('buscador', 'vendedor', 'administrador', 'cajero'), (req, res) => {
  const usuario = (req as any).usuario;
  db.prepare('UPDATE order_items SET encontrado=1 WHERE id=? AND order_id=?').run(req.params.itemId, req.params.id);
  const pending = db.prepare('SELECT COUNT(*) as c FROM order_items WHERE order_id=? AND encontrado=0').get(req.params.id) as any;
  if (Number(pending.c) === 0) db.prepare("UPDATE orders SET estado='buscada', fecha_actualizacion=? WHERE id=?").run(now(), req.params.id);
  registrarAuditoria('orders', String(req.params.id), 'item_buscado', `Item ${req.params.itemId} buscado`, usuario.id);
  res.json({ ok: true });
});

ordersRouter.post('/:id/cambiar-estado', permitir('cajero', 'administrador'), (req, res) => {
  const { estado } = req.body as any;
  const validos = ['creada','en_busqueda','buscada','buscada_completa','en_verificacion','empacando','verificada','completada'];
  if (!validos.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });
  const order = db.prepare('SELECT id FROM orders WHERE id=?').get(req.params.id) as any;
  if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
  db.prepare('UPDATE orders SET estado=?, fecha_actualizacion=? WHERE id=?').run(estado, now(), req.params.id);
  const usuario = (req as any).usuario;
  registrarAuditoria('orders', String(req.params.id), 'estado_cambiado', `Estado → ${estado}`, usuario.id);
  res.json({ ok: true });
});

ordersRouter.post('/:id/completar-busqueda', permitir('buscador', 'vendedor', 'administrador'), (req, res) => {
  const usuario = (req as any).usuario;
  const order = db.prepare('SELECT estado FROM orders WHERE id=?').get(req.params.id) as any;
  if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
  if (!['en_busqueda','buscada'].includes(String(order.estado))) return res.status(409).json({ error: 'Estado inválido para completar búsqueda' });
  db.prepare("UPDATE orders SET estado='buscada_completa', fecha_actualizacion=? WHERE id=?").run(now(), req.params.id);
  registrarAuditoria('orders', String(req.params.id), 'busqueda_completada', 'Búsqueda marcada como completada por picker', usuario.id);
  res.json({ ok: true });
});

ordersRouter.post('/:id/verificar/iniciar', permitir('cajero', 'vendedor', 'administrador'), permitirCapacidad('can_verify'), (req, res) => {
  const order = db.prepare('SELECT estado FROM orders WHERE id=?').get(req.params.id) as any;
  if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
  if (!['buscada','buscada_completa','pendiente_verificacion','en_verificacion'].includes(String(order.estado))) return res.status(409).json({ error: 'Estado inválido para verificación' });
  db.prepare("UPDATE orders SET estado='en_verificacion', fecha_actualizacion=? WHERE id=?").run(now(), req.params.id);
  res.json({ ok: true });
});

ordersRouter.post('/:id/bundles', permitir('cajero', 'vendedor', 'administrador'), permitirCapacidad('can_verify'), (req, res) => {
  // Reutilizar bulto abierto vacío si existe, para evitar que cancelar incremente el número
  const existente = db.prepare(`SELECT b.id, b.numero_bulto, b.estado FROM bundles b WHERE b.order_id=? AND b.estado='abierto' AND NOT EXISTS (SELECT 1 FROM bundle_items bi WHERE bi.bundle_id=b.id) ORDER BY b.numero_bulto DESC LIMIT 1`).get(req.params.id) as any;
  if (existente) return res.status(201).json({ id: existente.id, numero_bulto: existente.numero_bulto, estado: existente.estado });
  const next = db.prepare('SELECT COALESCE(MAX(numero_bulto),0)+1 as n FROM bundles WHERE order_id=?').get(req.params.id) as any;
  const id = uuid();
  db.prepare('INSERT INTO bundles(id,order_id,numero_bulto,estado,fecha_creacion,fecha_actualizacion) VALUES(?,?,?,?,?,?)').run(id, req.params.id, next.n, 'abierto', now(), now());
  res.status(201).json({ id, numero_bulto: next.n, estado: 'abierto' });
});

// Cancelar (eliminar) un bulto abierto y vacío
ordersRouter.post('/:id/bundles/:bundleId/cancelar', permitir('cajero', 'vendedor', 'administrador'), permitirCapacidad('can_verify'), (req, res) => {
  const tieneItems = db.prepare('SELECT COUNT(*) as c FROM bundle_items WHERE bundle_id=?').get(req.params.bundleId) as any;
  if (Number(tieneItems.c) > 0) return res.status(409).json({ error: 'No se puede cancelar un bulto con artículos' });
  const bundle = db.prepare(`SELECT id FROM bundles WHERE id=? AND order_id=? AND estado='abierto'`).get(req.params.bundleId, req.params.id) as any;
  if (!bundle) return res.status(404).json({ error: 'Bulto no encontrado o ya cerrado' });
  db.prepare('DELETE FROM bundles WHERE id=?').run(req.params.bundleId);
  res.json({ ok: true });
});

ordersRouter.get('/:id/items-pendientes', permitir('cajero', 'vendedor', 'administrador'), permitirCapacidad('can_verify'), (req, res) => {
  const items = db.prepare(`
    SELECT oi.id, oi.descripcion, oi.cantidad as cantidad_total, oi.precio_unitario,
      p.codigo as producto_codigo,
      COALESCE((SELECT SUM(bi.cantidad) FROM bundle_items bi JOIN bundles b ON b.id=bi.bundle_id
                WHERE bi.order_item_id=oi.id AND b.order_id=? AND b.estado='cerrado'), 0) as en_bultos_cerrados,
      COALESCE((SELECT SUM(bi.cantidad) FROM bundle_items bi JOIN bundles b ON b.id=bi.bundle_id
                WHERE bi.order_item_id=oi.id AND b.order_id=? AND b.estado='abierto'), 0) as en_bulto_abierto
    FROM order_items oi LEFT JOIN productos p ON p.id=oi.producto_id
    WHERE oi.order_id=? ORDER BY oi.descripcion`).all(req.params.id, req.params.id, req.params.id);
  res.json(items);
});

ordersRouter.get('/:id/bundles/:bundleId/items', permitir('cajero', 'vendedor', 'administrador'), permitirCapacidad('can_verify'), (req, res) => {
  const items = db.prepare(`
    SELECT bi.id as bundle_item_id, bi.cantidad as cantidad_en_bulto,
      oi.id as order_item_id, oi.descripcion, oi.cantidad as cantidad_total, oi.precio_unitario,
      p.codigo as producto_codigo
    FROM bundle_items bi JOIN order_items oi ON oi.id=bi.order_item_id
    LEFT JOIN productos p ON p.id=oi.producto_id
    WHERE bi.bundle_id=? ORDER BY oi.descripcion`).all(req.params.bundleId);
  res.json(items);
});

ordersRouter.post('/:id/bundles/:bundleId/add-item', permitir('cajero', 'vendedor', 'administrador'), permitirCapacidad('can_verify'), (req, res) => {
  const { order_item_id, cantidad } = req.body as any;
  if (!order_item_id || !cantidad || Number(cantidad) <= 0) return res.status(400).json({ error: 'Datos inválidos' });
  const bundle = db.prepare(`SELECT id FROM bundles WHERE id=? AND order_id=? AND estado='abierto'`).get(req.params.bundleId, req.params.id) as any;
  if (!bundle) return res.status(404).json({ error: 'Bulto no encontrado o ya cerrado' });
  const existing = db.prepare('SELECT id FROM bundle_items WHERE bundle_id=? AND order_item_id=?').get(req.params.bundleId, order_item_id) as any;
  if (existing) {
    db.prepare('UPDATE bundle_items SET cantidad=? WHERE id=?').run(Number(cantidad), existing.id);
  } else {
    db.prepare('INSERT INTO bundle_items(id,bundle_id,order_item_id,cantidad,fecha_creacion) VALUES(?,?,?,?,?)').run(uuid(), req.params.bundleId, order_item_id, Number(cantidad), now());
  }
  const items = db.prepare(`SELECT bi.id as bundle_item_id, bi.cantidad as cantidad_en_bulto,
    oi.id as order_item_id, oi.descripcion, oi.cantidad as cantidad_total, oi.precio_unitario
    FROM bundle_items bi JOIN order_items oi ON oi.id=bi.order_item_id WHERE bi.bundle_id=? ORDER BY oi.descripcion`).all(req.params.bundleId);
  res.json({ ok: true, items });
});

ordersRouter.post('/:id/bundles/:bundleId/remove-item', permitir('cajero', 'vendedor', 'administrador'), permitirCapacidad('can_verify'), (req, res) => {
  const { order_item_id } = req.body as any;
  db.prepare('DELETE FROM bundle_items WHERE bundle_id=? AND order_item_id=?').run(req.params.bundleId, order_item_id);
  res.json({ ok: true });
});

ordersRouter.post('/:id/verificaciones', permitir('cajero', 'vendedor', 'administrador'), permitirCapacidad('can_verify'), (req, res) => {
  const usuario = (req as any).usuario;
  const { order_item_id, bundle_id, cantidad_verificada } = req.body;
  const item = db.prepare('SELECT * FROM order_items WHERE id=? AND order_id=?').get(order_item_id, req.params.id) as any;
  if (!item) return res.status(404).json({ error: 'Item no encontrado' });

  const tx = db.transaction(() => {
    db.prepare('INSERT INTO order_verifications(id,order_id,order_item_id,verifier_usuario_id,bundle_id,cantidad_esperada,cantidad_verificada,confirmado,fecha_creacion) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(uuid(), req.params.id, order_item_id, usuario.id, bundle_id, item.cantidad, cantidad_verificada, 1, now());
    db.prepare('UPDATE order_items SET cantidad_verificada=?, encontrado=1 WHERE id=?').run(cantidad_verificada, order_item_id);
    db.prepare('INSERT INTO bundle_items(id,bundle_id,order_item_id,cantidad,fecha_creacion) VALUES(?,?,?,?,?)').run(uuid(), bundle_id, order_item_id, cantidad_verificada, now());
  });
  tx();

  const pending = db.prepare('SELECT COUNT(*) as c FROM order_items WHERE order_id=? AND (cantidad_verificada < cantidad)').get(req.params.id) as any;
  if (Number(pending.c) === 0) db.prepare("UPDATE orders SET estado='empacando', fecha_actualizacion=? WHERE id=?").run(now(), req.params.id);
  registrarAuditoria('orders', String(req.params.id), 'verificar_item', `Item ${order_item_id} verificado`, usuario.id);
  res.json({ ok: true });
});

ordersRouter.post('/:id/bundles/:bundleId/cerrar', permitir('cajero', 'vendedor', 'administrador'), permitirCapacidad('can_verify', 'can_print_bundle_labels'), (req, res) => {
  const usuario = (req as any).usuario;
  db.prepare("UPDATE bundles SET estado='cerrado', cerrado_por_usuario_id=?, fecha_cierre=?, etiqueta_impresa_en=?, fecha_actualizacion=? WHERE id=? AND order_id=?")
    .run(usuario.id, now(), now(), now(), req.params.bundleId, req.params.id);
  const bundle = db.prepare(`SELECT b.numero_bulto, o.numero_orden, c.codigo as cliente_codigo, c.nombre as cliente_nombre, c.direccion, c.ciudad
    FROM bundles b JOIN orders o ON o.id=b.order_id JOIN clientes c ON c.id=o.cliente_id WHERE b.id=?`).get(req.params.bundleId) as any;
  const nextN = (db.prepare('SELECT COALESCE(MAX(numero_bulto),0)+1 as n FROM bundles WHERE order_id=?').get(req.params.id) as any).n;
  const nextId = uuid();
  db.prepare('INSERT OR IGNORE INTO bundles(id,order_id,numero_bulto,estado,fecha_creacion,fecha_actualizacion) VALUES(?,?,?,?,?,?)').run(nextId, req.params.id, nextN, 'abierto', now(), now());
  registrarAuditoria('orders', String(req.params.id), 'cerrar_bulto', `Bulto ${bundle?.numero_bulto} cerrado`, usuario.id);
  res.json({
    ok: true,
    etiqueta: {
      fecha: new Date().toLocaleDateString('es-DO'),
      cliente_codigo: bundle?.cliente_codigo,
      cliente_nombre: bundle?.cliente_nombre,
      direccion: bundle?.direccion,
      ciudad: bundle?.ciudad,
      numero_orden: bundle?.numero_orden,
      bulto: bundle?.numero_bulto,
    },
    siguiente_bulto: { id: nextId, numero_bulto: nextN, estado: 'abierto' },
  });
});



ordersRouter.get('/:id/bundles/:bundleId/label', permitir('cajero', 'vendedor', 'administrador'), permitirCapacidad('can_verify', 'can_print_bundle_labels'), (req, res) => {
  const bundle = db.prepare(`SELECT b.numero_bulto, b.fecha_cierre, c.codigo as cliente_codigo, c.nombre as cliente_nombre, c.direccion
    FROM bundles b JOIN orders o ON o.id=b.order_id JOIN clientes c ON c.id=o.cliente_id
    WHERE b.id=? AND b.order_id=?`).get(req.params.bundleId, req.params.id) as any;
  if (!bundle) return res.status(404).json({ error: 'Bulto no encontrado' });
  res.json({
    empresa: 'Importadora Repuestos Calcaño',
    fecha: bundle.fecha_cierre ? new Date(bundle.fecha_cierre).toLocaleDateString('es-DO') : new Date().toLocaleDateString('es-DO'),
    cliente_codigo: bundle.cliente_codigo,
    cliente_nombre: bundle.cliente_nombre,
    direccion: bundle.direccion,
    bulto: bundle.numero_bulto,
  });
});

ordersRouter.get('/:id/final-invoice', permitir('cajero', 'administrador', 'vendedor'), permitirCapacidad('can_verify'), (req, res) => {
  const o = db.prepare(`
    SELECT o.*, c.nombre as cliente_nombre, c.codigo as cliente_codigo, c.direccion, c.ciudad,
      c.cedula_rnc as cliente_rnc, c.telefono_1, c.porcentaje_descuento,
      u.nombre_completo as vendedor_nombre,
      v.ncf, v.tipo_comprobante
    FROM orders o
    JOIN clientes c ON c.id=o.cliente_id
    JOIN usuarios u ON u.id=o.usuario_creador_id
    LEFT JOIN ventas v ON v.id=o.venta_origen_id
    WHERE o.id=?`).get(req.params.id) as any;
  if (!o) return res.status(404).json({ error: 'Orden no encontrada' });

  // Avanzar estado automáticamente al imprimir la factura
  if (o.estado === 'empacando' || o.estado === 'en_verificacion') {
    db.prepare("UPDATE orders SET estado='verificada', fecha_actualizacion=? WHERE id=?").run(now(), req.params.id);
  }

  const items = db.prepare(`
    SELECT oi.descripcion, oi.cantidad, oi.precio_unitario,
      p.codigo as producto_codigo,
      (SELECT b.numero_bulto FROM bundle_items bi JOIN bundles b ON b.id=bi.bundle_id
       WHERE bi.order_item_id=oi.id LIMIT 1) as bulto_num
    FROM order_items oi
    LEFT JOIN productos p ON p.id=oi.producto_id
    WHERE oi.order_id=?
    ORDER BY oi.descripcion`).all(req.params.id) as any[];

  const totalBultos = (db.prepare('SELECT COUNT(*) as c FROM bundles WHERE order_id=?').get(req.params.id) as any).c;
  const desc_pct = Number(o.porcentaje_descuento || 0);
  const fmt = (n: number) => n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  let subTotal = 0, totalDesc = 0, totalItbis = 0, totalNeto = 0;
  const rows = items.map((it: any) => {
    const precio = Number(it.precio_unitario || 0);
    const cant = Number(it.cantidad || 0);
    const descUnit = precio * (desc_pct / 100);
    const baseNeta = precio - descUnit;
    const itbisUnit = baseNeta * 0.18;
    const precioNeto = baseNeta + itbisUnit;
    const totalLinea = precioNeto * cant;
    subTotal += precio * cant;
    totalDesc += descUnit * cant;
    totalItbis += itbisUnit * cant;
    totalNeto += totalLinea;
    return `<tr>
      <td class="ctr">${it.producto_codigo ?? ''}</td>
      <td class="ctr">${cant % 1 === 0 ? cant.toFixed(0) : cant.toFixed(2)}</td>
      <td class="ctr">${it.bulto_num ?? '-'}</td>
      <td class="ctr">UNI</td>
      <td class="desc">${(it.descripcion ?? '').toUpperCase()}</td>
      <td class="num">${fmt(precio)}</td>
      <td class="num">${fmt(descUnit)}</td>
      <td class="num">${fmt(itbisUnit)}</td>
      <td class="num">${fmt(precioNeto)}</td>
      <td class="num">${fmt(totalLinea)}</td>
    </tr>`;
  }).join('');

  const fechaDoc = new Date().toLocaleDateString('es-DO');
  const fechaVenc = new Date(); fechaVenc.setFullYear(fechaVenc.getFullYear() + 1);
  const ncfVence = o.ncf ? fechaVenc.toLocaleDateString('es-DO') : '-';
  const tipoComp = o.tipo_comprobante === 'credito_fiscal' ? 'CRÉDITO FISCAL' : o.tipo_comprobante === 'consumidor_final' ? 'CONSUMIDOR FINAL' : (o.tipo_comprobante ?? 'CRÉDITO FISCAL');

  const irc_svg = `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="90" viewBox="0 0 140 90">
    <!-- gear outer ring -->
    <circle cx="44" cy="45" r="38" fill="#c8102e"/>
    <!-- gear teeth 8x -->
    ${[0,45,90,135,180,225,270,315].map(a=>`<rect x="39" y="3" width="10" height="13" rx="3" fill="#c8102e" transform="rotate(${a} 44 45)"/>`).join('')}
    <!-- inner white ring -->
    <circle cx="44" cy="45" r="26" fill="white"/>
    <!-- inner red hub -->
    <circle cx="44" cy="45" r="18" fill="#c8102e"/>
    <!-- spokes -->
    ${[0,60,120,180,240,300].map(a=>`<line x1="44" y1="27" x2="44" y2="45" stroke="white" stroke-width="2" transform="rotate(${a} 44 45)"/>`).join('')}
    <!-- hub center -->
    <circle cx="44" cy="45" r="5" fill="white"/>
    <!-- motorcycle side silhouette (white) -->
    <!-- rear wheel -->
    <circle cx="22" cy="54" r="9" fill="none" stroke="white" stroke-width="2.5"/>
    <circle cx="22" cy="54" r="4" fill="white"/>
    <!-- front wheel -->
    <circle cx="64" cy="54" r="9" fill="none" stroke="white" stroke-width="2.5"/>
    <circle cx="64" cy="54" r="4" fill="white"/>
    <!-- frame -->
    <path d="M22 46 L34 28 L52 28 L58 36 L64 46" fill="none" stroke="white" stroke-width="2.5" stroke-linejoin="round"/>
    <!-- seat/tank -->
    <path d="M34 28 L52 28 L52 35 L34 35 Z" fill="white"/>
    <!-- rider body simplified -->
    <path d="M48 28 L54 18 L62 22 L58 30" fill="white"/>
    <!-- handlebar -->
    <line x1="62" y1="22" x2="68" y2="26" stroke="white" stroke-width="2.5"/>
    <!-- engine block -->
    <rect x="30" y="38" width="20" height="10" rx="2" fill="white" opacity="0.7"/>
    <!-- IRC text -->
    <text y="55" font-family="Arial Black,Arial" font-weight="900" font-size="32">
      <tspan x="88" fill="#0a2d6e">I</tspan><tspan fill="#c8102e">R</tspan><tspan fill="#0a2d6e">C</tspan>
    </text>
  </svg>`;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <title>Factura ${o.numero_orden}</title>
  <style>
    @page { size: 8.5in 11in portrait; margin: 0.5in 0.55in; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; }
    .company-name { font-size: 16px; font-weight: 900; text-align: center; margin-bottom: 8px; letter-spacing: 0.5px; }
    /* Header: left col = logo+desc, center = factura label, right = addr+fiscal */
    .header { display: grid; grid-template-columns: 155px 1fr 195px; gap: 0; margin-bottom: 8px; }
    .left-col { display: flex; flex-direction: column; }
    .logo-box { display: flex; align-items: center; padding-bottom: 4px; }
    .desc-box { border: 1px solid #555; padding: 6px 8px; font-size: 9.5px; line-height: 1.5; font-weight: 600; flex: 1; }
    .center-col { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 12px; }
    .factura-title { font-size: 15px; font-weight: 900; text-align: center; color: #111; }
    .factura-sub { font-size: 11px; font-weight: 700; text-align: center; margin-top: 3px; }
    .right-col { display: flex; flex-direction: column; gap: 0; }
    .addr-box { border: 1px solid #555; padding: 6px 8px; font-size: 9.5px; text-align: right; line-height: 1.5; font-weight: 600; }
    .fiscal-box { padding: 6px 8px; font-size: 9.5px; text-align: right; line-height: 1.7; border: 1px solid #555; border-top: none; }
    .pedido-row { display: flex; justify-content: flex-end; gap: 40px; font-size: 10px; margin-bottom: 5px; font-weight: 700; }
    .client-section { border: 1px solid #777; padding: 7px 10px; margin-bottom: 8px; font-size: 10px; line-height: 1.75; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    col.c-cod  { width: 8%; }
    col.c-cant { width: 6%; }
    col.c-blt  { width: 7%; }
    col.c-ref  { width: 5%; }
    col.c-desc { width: 16%; }
    col.c-pre  { width: 11%; }
    col.c-des  { width: 10%; }
    col.c-itb  { width: 9%; }
    col.c-pn   { width: 14%; }
    col.c-tn   { width: 14%; }
    th { background: #ebebeb; border: 1px solid #555; padding: 5px 3px; font-size: 9px; text-align: center; white-space: nowrap; }
    td { border: 1px solid #aaa; padding: 4px 4px; font-size: 9.5px; vertical-align: top; overflow: hidden; }
    td.desc { white-space: normal; word-break: break-word; line-height: 1.4; }
    td.num  { text-align: right; white-space: nowrap; }
    td.ctr  { text-align: center; white-space: nowrap; }
    .totals-row { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 8px; }
    .totals-table { border-collapse: collapse; }
    .totals-table td { border: none; padding: 3px 8px; font-size: 10px; text-align: right; white-space: nowrap; overflow: visible; }
    .totals-table td:first-child { text-align: left; }
    .totals-table tr:last-child td { font-weight: 900; font-size: 11px; border-top: 1.5px solid #333; padding-top: 5px; }
    .sig-row { display: flex; justify-content: space-around; margin-top: 36px; }
    .sig-box { text-align: center; border-top: 1px solid #333; padding-top: 4px; width: 200px; font-size: 10px; }
    .footer-logos { display: flex; justify-content: center; gap: 50px; margin-top: 18px; align-items: center; }
    .footer-logo { font-size: 20px; font-weight: 900; }
    .footer-logo.linumax { color: #e63946; }
    .footer-logo.haojue { color: #1d3557; }
  </style>
  </head><body>
  <div class="company-name">IMPORTADORA REPUESTOS CALCAÑO SRL</div>
  <div class="header">
    <div class="left-col">
      <div class="logo-box">${irc_svg}</div>
      <div class="desc-box">COMERCIALIZACION Y DISTRIBUCION DE REPUESTOS ORIGINALES Y DE ALTA CALIDAD PARA MOTOCICLETAS</div>
    </div>
    <div class="center-col">
      <div class="factura-title">FACTURA</div>
      <div class="factura-sub">VALIDA PARA CREDITO FISCAL</div>
    </div>
    <div class="right-col">
      <div class="addr-box">VILLA MAGDALENA SAN PEDRO<br/>DE MACORIS<br/>RNC: 130716171</div>
      <div class="fiscal-box">
        <div>FECHA: ${fechaDoc}</div>
        <div>VENCE: ${ncfVence}</div>
        <div>NCF: ${o.ncf ?? '-'}</div>
        <div>(${tipoComp})</div>
      </div>
    </div>
  </div>
  <div class="pedido-row">
    <span>PEDIDO ${o.numero_orden}</span>
    <span>FACT NO. ${o.numero_orden}</span>
  </div>
  <div class="client-section">
    <strong>CLIENTE</strong><br/>
    COD: ${o.cliente_codigo ?? '-'} &nbsp;&nbsp;&nbsp; NOMBRE: ${(o.cliente_nombre ?? '').toUpperCase()}<br/>
    RNC: ${o.cliente_rnc ?? '-'}<br/>
    DIRECCIÓN: ${(o.direccion ?? '').toUpperCase()}<br/>
    VENDEDOR: ${(o.vendedor_nombre ?? '').toUpperCase()} &nbsp;&nbsp;&nbsp; TEL: ${o.telefono_1 ?? '-'}
  </div>
  <table>
    <colgroup>
      <col class="c-cod"/><col class="c-cant"/><col class="c-blt"/><col class="c-ref"/>
      <col class="c-desc"/><col class="c-pre"/><col class="c-des"/><col class="c-itb"/>
      <col class="c-pn"/><col class="c-tn"/>
    </colgroup>
    <thead><tr>
      <th>COD</th><th>CANT</th><th>BULTO</th><th>REF</th><th style="text-align:left">DESCRIPCION</th>
      <th>PRECIO</th><th>DESCUENTO</th><th>ITBIS</th><th>PRECIO NETO</th><th>TOTAL NETO</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals-row">
    <div style="font-size:11px;font-weight:700;margin-top:4px">TOTAL BULTOS: ${totalBultos}</div>
    <table class="totals-table">
      <tr><td>SUB-TOTAL</td><td>${fmt(subTotal)}</td></tr>
      <tr><td>ITBIS</td><td>${fmt(totalItbis)}</td></tr>
      <tr><td>${desc_pct > 0 ? desc_pct + '%' : ''} DESCUENTO</td><td>${fmt(totalDesc)}</td></tr>
      <tr><td>TOTAL NETO</td><td>${fmt(totalNeto)}</td></tr>
    </table>
  </div>
  <div class="sig-row">
    <div class="sig-box">Despachado por:</div>
    <div class="sig-box">Recibido conforme:</div>
  </div>
  <div class="footer-logos">
    <span class="footer-logo linumax">🏍 LINUMAX</span>
    <span class="footer-logo haojue">W Haojue</span>
  </div>
  </body></html>`;

  res.json({ preview_html: html, data: { orden: o, items, total_bultos: totalBultos },
  });
});

// GET choferes disponibles (para el cajero asignar)
ordersRouter.get('/choferes', permitir('cajero', 'administrador'), (req, res) => {
  const choferes = db.prepare(`SELECT u.id, u.nombre_completo FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE r.nombre='chofer' AND u.estado='activo' ORDER BY u.nombre_completo`).all();
  res.json({ choferes });
});

// Enviar orden completada a un chofer
ordersRouter.post('/:id/enviar-chofer', permitir('cajero', 'administrador'), (req, res) => {
  const usuario = (req as any).usuario;
  const { chofer_id } = req.body;
  if (!chofer_id) return res.status(400).json({ error: 'chofer_id requerido' });
  const orden = db.prepare('SELECT estado FROM orders WHERE id=?').get(req.params.id) as any;
  if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
  if (orden.estado !== 'completada') return res.status(400).json({ error: 'La orden debe estar completada para enviarla' });
  db.prepare('UPDATE orders SET estado=?, chofer_id=?, fecha_actualizacion=? WHERE id=?').run('en_camino', chofer_id, now(), req.params.id);
  registrarAuditoria('orders', String(req.params.id), 'enviar_chofer', `Orden enviada a chofer ${chofer_id}`, usuario.id);
  res.json({ ok: true, estado: 'en_camino' });
});

// Chofer marca entrega completada
ordersRouter.post('/:id/entregado', permitir('chofer', 'cajero', 'administrador'), (req, res) => {
  const usuario = (req as any).usuario;
  const orden = db.prepare('SELECT estado, chofer_id FROM orders WHERE id=?').get(req.params.id) as any;
  if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
  if (orden.estado !== 'en_camino') return res.status(400).json({ error: 'La orden no está en camino' });
  if (usuario.rol === 'chofer' && orden.chofer_id !== usuario.id) return res.status(403).json({ error: 'No eres el chofer asignado' });
  db.prepare('UPDATE orders SET estado=?, fecha_actualizacion=? WHERE id=?').run('entregado', now(), req.params.id);
  registrarAuditoria('orders', String(req.params.id), 'entregado', 'Entrega confirmada por chofer', usuario.id);
  res.json({ ok: true, estado: 'entregado' });
});

export { ordersRouter };
