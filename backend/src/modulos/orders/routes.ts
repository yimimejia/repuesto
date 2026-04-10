import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../../db/connection.js';
import { auth, permitir, permitirCapacidad } from '../../shared/auth.js';
import { registrarAuditoria } from '../../shared/auditoria.js';

const ordersRouter = Router();
ordersRouter.use(auth);
const now = () => new Date().toISOString();

ordersRouter.get('/', permitir('cajero', 'administrador', 'revendedor', 'buscador', 'vendedor'), (req, res) => {
  const usuario = (req as any).usuario;
  const base = `SELECT o.*, c.nombre as cliente_nombre, c.codigo as cliente_codigo,
    u.nombre_completo as usuario_creador,
    (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id=o.id) as cantidad_items,
    (SELECT u2.nombre_completo FROM order_assignments oa JOIN usuarios u2 ON u2.id=oa.picker_usuario_id WHERE oa.order_id=o.id ORDER BY oa.fecha_creacion DESC LIMIT 1) as picker_asignado
    FROM orders o
    JOIN clientes c ON c.id=o.cliente_id
    JOIN usuarios u ON u.id=o.usuario_creador_id`;

  const rows = (usuario.rol === 'buscador' || usuario.rol === 'vendedor')
    ? db.prepare(base + ` WHERE EXISTS (SELECT 1 FROM order_assignments oa WHERE oa.order_id=o.id AND oa.picker_usuario_id=?) ORDER BY o.fecha_creacion DESC`).all(usuario.id)
    : usuario.rol === 'revendedor'
      ? db.prepare(base + ' WHERE o.usuario_creador_id=? ORDER BY o.fecha_creacion DESC').all(usuario.id)
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

ordersRouter.post('/:id/verificar/iniciar', permitir('cajero', 'vendedor', 'administrador'), permitirCapacidad('can_verify'), (req, res) => {
  const order = db.prepare('SELECT estado FROM orders WHERE id=?').get(req.params.id) as any;
  if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
  if (!['buscada','pendiente_verificacion','en_verificacion'].includes(String(order.estado))) return res.status(409).json({ error: 'Estado inválido para verificación' });
  db.prepare("UPDATE orders SET estado='en_verificacion', fecha_actualizacion=? WHERE id=?").run(now(), req.params.id);
  res.json({ ok: true });
});

ordersRouter.post('/:id/bundles', permitir('cajero', 'vendedor', 'administrador'), permitirCapacidad('can_verify'), (req, res) => {
  const next = db.prepare('SELECT COALESCE(MAX(numero_bulto),0)+1 as n FROM bundles WHERE order_id=?').get(req.params.id) as any;
  const id = uuid();
  db.prepare('INSERT INTO bundles(id,order_id,numero_bulto,estado,fecha_creacion,fecha_actualizacion) VALUES(?,?,?,"abierto",?,?)').run(id, req.params.id, next.n, now(), now());
  res.status(201).json({ id, numero_bulto: next.n, estado: 'abierto' });
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

ordersRouter.post('/:id/bundles/:bundleId/cerrar', permitir('cajero', 'vendedor', 'administrador'), permitirCapacidad('can_print_bundle_labels'), (req, res) => {
  const usuario = (req as any).usuario;
  db.prepare("UPDATE bundles SET estado='cerrado', cerrado_por_usuario_id=?, fecha_cierre=?, etiqueta_impresa_en=?, fecha_actualizacion=? WHERE id=? AND order_id=?")
    .run(usuario.id, now(), now(), now(), req.params.bundleId, req.params.id);
  const bundle = db.prepare(`SELECT b.numero_bulto, o.numero_orden, c.codigo as cliente_codigo, c.nombre as cliente_nombre, c.direccion
    FROM bundles b JOIN orders o ON o.id=b.order_id JOIN clientes c ON c.id=o.cliente_id WHERE b.id=?`).get(req.params.bundleId) as any;
  const next = db.prepare('SELECT COALESCE(MAX(numero_bulto),0)+1 as n FROM bundles WHERE order_id=?').get(req.params.id) as any;
  db.prepare('INSERT OR IGNORE INTO bundles(id,order_id,numero_bulto,estado,fecha_creacion,fecha_actualizacion) VALUES(?,?,?,"abierto",?,?)').run(uuid(), req.params.id, next.n, now(), now());
  registrarAuditoria('orders', String(req.params.id), 'cerrar_bulto', `Bulto ${bundle?.numero_bulto} cerrado`, usuario.id);
  res.json({ ok: true, etiqueta: {
    empresa: 'Importadora Repuestos Calcaño',
    fecha: new Date().toLocaleDateString('es-DO'),
    cliente_codigo: bundle?.cliente_codigo,
    cliente_nombre: bundle?.cliente_nombre,
    direccion: bundle?.direccion,
    bulto: bundle?.numero_bulto,
  } });
});



ordersRouter.get('/:id/bundles/:bundleId/label', permitir('cajero', 'vendedor', 'administrador'), permitirCapacidad('can_print_bundle_labels'), (req, res) => {
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
  const o = db.prepare(`SELECT o.*, c.nombre as cliente_nombre, c.codigo as cliente_codigo, c.direccion, v.ncf, v.tipo_comprobante
    FROM orders o JOIN clientes c ON c.id=o.cliente_id LEFT JOIN ventas v ON v.id=o.venta_origen_id WHERE o.id=?`).get(req.params.id) as any;
  if (!o) return res.status(404).json({ error: 'Orden no encontrada' });
  const items = db.prepare('SELECT descripcion, cantidad, precio_unitario, (cantidad*precio_unitario) as total FROM order_items WHERE order_id=?').all(req.params.id);
  const bultos = db.prepare('SELECT COUNT(*) as c FROM bundles WHERE order_id=?').get(req.params.id) as any;
  const fechaDoc = new Date().toLocaleString('es-DO');
  const total = items.reduce((acc: number, item: any) => acc + Number(item.total || 0), 0);
  const rows = items.map((it: any, idx: number) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${it.descripcion ?? ''}</td>
        <td style="text-align:right">${Number(it.cantidad || 0).toFixed(0)}</td>
        <td style="text-align:right">RD$ ${Number(it.precio_unitario || 0).toFixed(2)}</td>
        <td style="text-align:right">RD$ ${Number(it.total || 0).toFixed(2)}</td>
      </tr>`).join('');
  res.json({
    preview_html: `<!DOCTYPE html><html><head><meta charset="UTF-8" /><title>Factura final ${o.numero_orden}</title>
      <style>
        @page { size: 8.5in 11in; margin: 0.5in; }
        body { font-family: Arial, sans-serif; color: #111; }
        h1,h2,p { margin: 0; }
        .head { margin-bottom: 14px; }
        .muted { color: #475569; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; margin-top: 14px; }
        th, td { border: 1px solid #cbd5e1; padding: 8px; font-size: 13px; }
        th { background: #f8fafc; text-align: left; }
        .totales { margin-top: 14px; display: flex; justify-content: flex-end; }
        .totales div { min-width: 260px; border: 1px solid #cbd5e1; padding: 10px; }
      </style>
    </head><body>
      <div class="head">
        <h2>Importadora Repuestos Calcaño</h2>
        <p class="muted">Fecha: ${fechaDoc}</p>
        <p class="muted">Orden: ${o.numero_orden}</p>
        <p class="muted">Cliente: ${o.cliente_nombre} (${o.cliente_codigo ?? '-'})</p>
        <p class="muted">Dirección: ${o.direccion ?? '-'}</p>
        <p class="muted">NCF: ${o.ncf ?? '-'}</p>
        <p class="muted">Total bultos empacados: ${bultos.c}</p>
      </div>
      <table>
        <thead>
          <tr><th>#</th><th>Producto</th><th>Cantidad</th><th>Precio unitario</th><th>Total</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="totales">
        <div><strong>Total general: RD$ ${total.toFixed(2)}</strong></div>
      </div>
    </body></html>`,
    data: { orden: o, items, total_bultos: bultos.c },
  });
});

export { ordersRouter };
