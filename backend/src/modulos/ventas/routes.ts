import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../../db/connection.js';
import { auth, permitir, permitirCapacidad } from '../../shared/auth.js';
import { formatNcf } from '../ncf/routes.js';
import { emitir } from '../../realtime/hub.js';
import { ajustarInventario, stockSucursal } from '../inventario/service.js';
import { registrarAuditoria } from '../../shared/auditoria.js';
import { exigirSucursalUsuario } from '../../shared/sucursales.js';

const ahora = () => new Date().toISOString();
const ventasRouter = Router();
ventasRouter.use(auth);

ventasRouter.get('/', permitir('administrador'), (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 200), 500);
  const offset = Number(req.query.offset ?? 0);
  const data = db.prepare(`SELECT v.*, COALESCE(v.cliente_nombre_libre, c.nombre) as cliente_nombre, u.nombre_completo as vendedor_nombre,
      COALESCE((SELECT SUM(dv.cantidad * COALESCE(p.costo,0)) FROM detalle_ventas dv LEFT JOIN productos p ON p.id=dv.producto_id WHERE dv.venta_id=v.id),0) as costo_total,
      COALESCE((SELECT SUM(dv.cantidad * (dv.precio_unitario - COALESCE(p.costo,0))) FROM detalle_ventas dv LEFT JOIN productos p ON p.id=dv.producto_id WHERE dv.venta_id=v.id),0) - COALESCE(v.descuento_total,0) as beneficio
    FROM ventas v
    JOIN clientes c ON c.id=v.cliente_id
    JOIN usuarios u ON u.id=v.vendedor_id
    ORDER BY v.fecha_creacion DESC LIMIT ? OFFSET ?`).all(limit, offset);
  res.json(data);
});

ventasRouter.get('/historial', permitir('cajero', 'administrador'), (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 300), 500);
  const rows = db.prepare(`SELECT v.id, v.numero_interno, v.fecha_creacion, v.tipo_venta, v.forma_pago, v.subtotal, v.itbis_total, v.descuento_total, v.total, v.estado,
      COALESCE(v.cliente_nombre_libre, c.nombre) as cliente_nombre, u.nombre_completo as vendedor_nombre,
      COALESCE((SELECT SUM(dv.cantidad * COALESCE(p.costo,0)) FROM detalle_ventas dv LEFT JOIN productos p ON p.id=dv.producto_id WHERE dv.venta_id=v.id),0) as costo_total,
      COALESCE((SELECT SUM(dv.cantidad * (dv.precio_unitario - COALESCE(p.costo,0))) FROM detalle_ventas dv LEFT JOIN productos p ON p.id=dv.producto_id WHERE dv.venta_id=v.id),0) - COALESCE(v.descuento_total,0) as beneficio
    FROM ventas v
    JOIN clientes c ON c.id=v.cliente_id
    JOIN usuarios u ON u.id=v.vendedor_id
    ORDER BY v.fecha_creacion DESC
    LIMIT ?`).all(limit);
  res.json(rows);
});

ventasRouter.get('/pendientes', permitir('cajero', 'administrador', 'al_por_mayor'), (req, res) => {
  const sucursalId = String((req.query.sucursal_id as string | undefined) ?? '').trim();
  const data = sucursalId
    ? db.prepare(`SELECT v.*, COALESCE(v.cliente_nombre_libre, c.nombre) as cliente_nombre, u.nombre_completo as vendedor_nombre, su.nombre as sucursal_nombre,
      (SELECT COUNT(*) FROM detalle_ventas dv WHERE dv.venta_id=v.id) as cantidad_articulos
    FROM ventas v JOIN clientes c ON c.id=v.cliente_id JOIN usuarios u ON u.id=v.vendedor_id LEFT JOIN sucursales su ON su.id=v.sucursal_id
    WHERE v.estado IN ('enviada_a_caja','en_revision_caja','lista_para_cobro') AND v.sucursal_id=? ORDER BY v.fecha_creacion ASC`).all(sucursalId)
    : db.prepare(`SELECT v.*, COALESCE(v.cliente_nombre_libre, c.nombre) as cliente_nombre, u.nombre_completo as vendedor_nombre, su.nombre as sucursal_nombre,
      (SELECT COUNT(*) FROM detalle_ventas dv WHERE dv.venta_id=v.id) as cantidad_articulos
    FROM ventas v JOIN clientes c ON c.id=v.cliente_id JOIN usuarios u ON u.id=v.vendedor_id LEFT JOIN sucursales su ON su.id=v.sucursal_id
    WHERE v.estado IN ('enviada_a_caja','en_revision_caja','lista_para_cobro') ORDER BY v.fecha_creacion ASC`).all();
  res.json(data);
});

ventasRouter.get('/:id', permitir('cajero', 'administrador', 'vendedor', 'al_por_mayor'), (req, res) => {
  const venta = db.prepare(`SELECT v.*, COALESCE(v.cliente_nombre_libre, c.nombre) as cliente_nombre, c.documento as cliente_documento, c.telefono as cliente_telefono,
      vu.nombre_completo as vendedor_nombre, cu.nombre_completo as cajero_nombre, su.nombre as sucursal_nombre
    FROM ventas v
    JOIN clientes c ON c.id=v.cliente_id
    JOIN usuarios vu ON vu.id=v.vendedor_id
    LEFT JOIN usuarios cu ON cu.id=v.cajero_id
    LEFT JOIN sucursales su ON su.id=v.sucursal_id
    WHERE v.id=?`).get(String(req.params.id));
  if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });
  const detalle = db.prepare(`SELECT dv.*, p.costo FROM detalle_ventas dv
    LEFT JOIN productos p ON p.id=dv.producto_id
    WHERE dv.venta_id=? ORDER BY dv.descripcion ASC`).all(String(req.params.id));
  const pagos = db.prepare('SELECT * FROM pagos WHERE venta_id=? ORDER BY fecha_creacion DESC').all(String(req.params.id));
  return res.json({ venta, detalle, pagos });
});

ventasRouter.post('/', permitir('vendedor', 'administrador', 'cajero'), (req, res) => {
  const usuario = (req as any).usuario;
  const { cliente_id, cliente_nombre_libre, fiscal_rnc, fiscal_empresa, vendedor_id, items, tipo_venta = 'contado', fecha_vencimiento, condicion_credito, usuario_autorizador_id, ncf, tipo_comprobante, sucursal_id, forma_pago = 'pendiente' } = req.body;
  if (!sucursal_id || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Venta inválida' });
  try {
    exigirSucursalUsuario(usuario.id, usuario.rol, sucursal_id);
  } catch (e: any) {
    return res.status(403).json({ error: e.message });
  }

  const portador = db.prepare("SELECT * FROM clientes WHERE UPPER(nombre)='PORTADOR' ORDER BY fecha_creacion LIMIT 1").get() as any;
  const clienteIdFinal = cliente_id || portador?.id;
  const cliente = db.prepare('SELECT * FROM clientes WHERE id=?').get(clienteIdFinal) as any;
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (tipo_comprobante && String(tipo_comprobante) !== 'consumidor_final') {
    if (!String(fiscal_rnc ?? '').trim() || !String(fiscal_empresa ?? '').trim()) {
      return res.status(400).json({ error: 'RNC y nombre de empresa son obligatorios para facturación fiscal' });
    }
  }

  let subtotal = 0; let itbis_total = 0; let descuento_total = 0;
  for (const i of items) {
    const stock = stockSucursal(sucursal_id, i.producto_id);
    if (stock < Number(i.cantidad)) {
      return res.status(400).json({ error: `Stock insuficiente para ${i.descripcion || i.codigo_producto}` });
    }
    const lineaBruta = Number(i.cantidad) * Number(i.precio_unitario);
    const desc = Number(i.descuento_monto ?? 0);
    subtotal += lineaBruta;
    descuento_total += desc;
itbis_total += (lineaBruta - desc) - ((lineaBruta - desc) / (1 + Number(i.itbis_tasa ?? 0.18)));
  }
  const total = subtotal - descuento_total;

  if (tipo_venta === 'credito') {
    if (!cliente_id) return res.status(400).json({ error: 'Debe seleccionar un cliente para venta a crédito' });
    if (cliente.estatus_credito !== 'abierto') return res.status(400).json({ error: 'Cliente no está habilitado para ventas a crédito' });
    if (Number(cliente.limite_credito ?? 0) <= 0) return res.status(400).json({ error: 'Cliente sin límite de crédito disponible' });
    const balance = db.prepare('SELECT COALESCE(SUM(balance_pendiente),0) as b FROM cuentas_por_cobrar WHERE cliente_id=? AND balance_pendiente>0').get(cliente_id) as any;
    const atraso = db.prepare(`SELECT COALESCE(MAX(CAST(julianday('now') - julianday(COALESCE(fecha_vencimiento, fecha_emision)) AS INTEGER)),0) as atraso
      FROM cuentas_por_cobrar WHERE cliente_id=? AND balance_pendiente>0 AND julianday('now') > julianday(COALESCE(fecha_vencimiento, fecha_emision))`).get(clienteIdFinal) as any;
    const diasAtraso = Number(atraso?.atraso ?? 0);
    let score = 'A';
    let factor = 1;
    if (diasAtraso >= 120) { score = 'G'; factor = 0; }
    else if (diasAtraso >= 90) { score = 'F'; factor = 0.5; }
    else if (diasAtraso >= 60) { score = 'D'; factor = 0.75; }
    else if (diasAtraso >= 30) { score = 'C'; factor = 0.85; }
    else if (diasAtraso >= 7) { score = 'B'; factor = 0.9; }
    if (cliente.credito_score !== score || Number(cliente.credito_factor ?? 1) !== Number(factor)) {
      db.prepare('UPDATE clientes SET credito_score=?, credito_factor=?, fecha_actualizacion=? WHERE id=?').run(score, factor, ahora(), clienteIdFinal);
      db.prepare('INSERT INTO credit_score_logs(id,cliente_id,score_anterior,score_nuevo,factor_anterior,factor_nuevo,dias_atraso,motivo,usuario_id,fecha) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(uuid(), clienteIdFinal, cliente.credito_score ?? null, score, cliente.credito_factor ?? 1, factor, diasAtraso, 'venta_credito_validacion', usuario.id, ahora());
    }

    const limiteBase = Number(cliente.limite_credito ?? 0);
    const limiteAjustado = limiteBase * factor;
    const disponible = limiteAjustado - Number(balance.b ?? 0);
    if (limiteBase > 0 && total > disponible) {
      return res.status(400).json({ error: `Límite de crédito excedido para score ${score}. Disponible: ${disponible.toFixed(2)}` });
    }
  }

  const id = uuid();
  const numero = `V-${Date.now()}`;
  const estado = tipo_venta === 'credito' ? 'cuenta_por_cobrar' : 'borrador';
  const now = ahora();
  const vendedorIdFinal = vendedor_id && String(vendedor_id).trim() ? String(vendedor_id) : usuario.id;

  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO ventas(id,numero_interno,cliente_id,cliente_nombre_libre,fiscal_rnc,fiscal_empresa,vendedor_id,tipo_venta,estado,subtotal,itbis_total,total,ncf,tipo_comprobante,fecha_comprobante,fecha_creacion,fecha_actualizacion,sucursal_id,forma_pago,descuento_total,balance_pendiente,invoice_type_code)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, numero, clienteIdFinal, cliente_nombre_libre && String(cliente_nombre_libre).trim() ? String(cliente_nombre_libre).trim() : null, String(fiscal_rnc ?? '').trim() || null, String(fiscal_empresa ?? '').trim() || null, vendedorIdFinal, tipo_venta, estado, subtotal, itbis_total, total, ncf ?? null, tipo_comprobante ?? cliente.tipo_comprobante_fiscal ?? 'consumidor_final', now, now, now, sucursal_id, forma_pago, descuento_total, tipo_venta === 'credito' ? total : 0, tipo_comprobante ?? cliente.tipo_comprobante_fiscal ?? 'consumidor_final');

    const insDet = db.prepare(`INSERT INTO detalle_ventas(id,venta_id,producto_id,codigo_producto,descripcion,cantidad,precio_unitario,itbis_tasa,itbis_monto,subtotal_linea)
      VALUES(?,?,?,?,?,?,?,?,?,?)`);
    for (const i of items) {
      const base = Number(i.cantidad) * Number(i.precio_unitario);
      const desc = Number(i.descuento_monto ?? 0);
      const tasa = Number(i.itbis_tasa ?? 0.18);
      const itbisMonto = (base - desc) - ((base - desc) / (1 + tasa));
      insDet.run(uuid(), id, i.producto_id, i.codigo_producto, i.descripcion, i.cantidad, i.precio_unitario, tasa, itbisMonto, base - desc);
      ajustarInventario({ sucursalId: sucursal_id, productoId: i.producto_id, cantidadDelta: -Number(i.cantidad), tipo: 'salida_venta', referenciaTipo: 'venta', referenciaId: id, usuarioId: usuario.id });
    }

    if (tipo_venta === 'credito') {
      db.prepare(`INSERT INTO cuentas_por_cobrar(id,venta_id,cliente_id,monto_original,balance_pendiente,fecha_emision,fecha_vencimiento,condicion_credito,estado,usuario_creador_id,usuario_autorizador_id,fecha_creacion,fecha_actualizacion)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(uuid(), id, clienteIdFinal, total, total, now, fecha_vencimiento ?? null, condicion_credito ?? null, 'pendiente', usuario.id, usuario_autorizador_id ?? null, now, now);
    }
  });

  tx();

  // Registrar puntos de fidelidad si el cliente está en el programa
  if (clienteIdFinal) {
    const clienteFid = db.prepare('SELECT en_programa_fidelidad FROM clientes WHERE id=?').get(clienteIdFinal) as any;
    if (clienteFid?.en_programa_fidelidad) {
      const puntosGanados = Math.floor(total); // 1 punto por cada peso gastado
      db.prepare('INSERT INTO movimientos_fidelidad(id, cliente_id, venta_id, tipo, puntos, descripcion, fecha) VALUES(?,?,?,?,?,?,?)')
        .run(`fid-${id}`, clienteIdFinal, id, 'acumulacion', puntosGanados, `Compra factura #${numero} — RD$ ${total.toFixed(2)}`, now);
    }
  }

  registrarAuditoria('venta', id, 'crear', `Venta ${numero} (${tipo_venta}) registrada`, usuario.id);
  emitir('venta_creada', { id, numero_interno: numero, tipo_venta, estado });
  res.status(201).json({ id, numero_interno: numero, total, estado, tipo_venta });
});

ventasRouter.post('/:id/anular', permitir('administrador'), (req, res) => {
  const usuario = (req as any).usuario;
  const venta = db.prepare('SELECT * FROM ventas WHERE id=?').get(String(req.params.id)) as any;
  try {
    exigirSucursalUsuario(usuario.id, usuario.rol, venta?.sucursal_id);
  } catch (e: any) {
    return res.status(403).json({ error: e.message });
  }
  if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });
  if (venta.estado === 'anulada') return res.status(400).json({ error: 'Venta ya anulada' });
  const detalles = db.prepare('SELECT * FROM detalle_ventas WHERE venta_id=?').all(String(req.params.id)) as any[];

  const tx = db.transaction(() => {
    for (const d of detalles) {
      ajustarInventario({ sucursalId: venta.sucursal_id, productoId: d.producto_id, cantidadDelta: Number(d.cantidad), tipo: 'reversa_venta', referenciaTipo: 'venta_anulada', referenciaId: venta.id, usuarioId: usuario.id });
    }
    db.prepare("UPDATE ventas SET estado='anulada', motivo_anulacion=?, fecha_actualizacion=? WHERE id=?").run(req.body?.motivo_anulacion ?? 'Anulación manual', ahora(), String(req.params.id));
    if (venta.tipo_venta === 'credito') db.prepare("UPDATE cuentas_por_cobrar SET estado='anulada', balance_pendiente=0, fecha_actualizacion=? WHERE venta_id=?").run(ahora(), String(req.params.id));
  });
  tx();
  registrarAuditoria('venta', String(req.params.id), 'anular', 'Venta anulada con reversa de inventario', usuario.id);
  res.json({ ok: true });
});

// endpoints existentes


ventasRouter.post('/:id/preparar-cobro-directo', permitir('cajero', 'administrador'), (req, res) => {
  const usuario = (req as any).usuario;
  const id = String(req.params.id);
  const now = ahora();
  const tx = db.transaction(() => {
    const up = db.prepare("UPDATE ventas SET estado='lista_para_cobro', bloqueo_usuario_id=?, bloqueo_desde=?, fecha_actualizacion=? WHERE id=? AND estado='borrador' AND tipo_venta='contado'").run(usuario.id, now, now, id);
    if (!up.changes) throw new Error('Venta no disponible para cobro directo');
    db.prepare('INSERT OR IGNORE INTO cash_queue(id,venta_id,estado,tomado_por_usuario_id,fecha_tomada,fecha_creacion,fecha_actualizacion) VALUES(?,?,?,?,?,?,?)')
      .run(uuid(), id, 'lista_para_cobro', usuario.id, now, now, now);
    const detalles = db.prepare('SELECT id FROM detalle_ventas WHERE venta_id=?').all(id) as any[];
    const ins = db.prepare('INSERT OR IGNORE INTO cash_item_checks(id,venta_id,detalle_venta_id,confirmado,confirmado_por_usuario_id,fecha_confirmacion) VALUES(?,?,?,?,?,?)');
    for (const d of detalles) ins.run(uuid(), id, d.id, 1, usuario.id, now);
  });
  try { tx(); } catch (e: any) { return res.status(400).json({ error: e.message }); }
  registrarAuditoria('venta', id, 'cobro_directo', 'Venta preparada para cobro directo por cajero', usuario.id);
  return res.json({ ok: true });
});

ventasRouter.post('/:id/enviar-cajero', permitir('vendedor', 'administrador'), (req, res) => {
  const id = String(req.params.id);
  const now = ahora();
  const tx = db.transaction(() => {
    const ok = db.prepare(`UPDATE ventas SET estado='enviada_a_caja', fecha_actualizacion=? WHERE id=? AND tipo_venta='contado' AND estado='borrador'`).run(now, id);
    if (!ok.changes) throw new Error('No se pudo enviar a caja');
    db.prepare('INSERT OR IGNORE INTO cash_queue(id,venta_id,estado,fecha_creacion,fecha_actualizacion) VALUES(?,?,?,?,?)').run(uuid(), id, 'enviada_a_caja', now, now);
  });
  try { tx(); } catch (e: any) { return res.status(400).json({ error: e.message }); }
  registrarAuditoria('venta', id, 'enviar_caja', 'Factura enviada a caja', ((req as any).usuario?.id ?? null));
  emitir('venta_pendiente', { venta_id: id });
  res.json({ ok: true });
});

ventasRouter.patch('/:id/detalle/:detalleId/precio', permitir('al_por_mayor', 'administrador', 'revendedor'), permitirCapacidad('can_override_price'), (req, res) => {
  const usuario = (req as any).usuario;
  const id = String(req.params.id);
  const detalleId = String(req.params.detalleId);
  const { precio_unitario, motivo } = req.body as { precio_unitario?: number; motivo?: string };
  const nuevoPrecio = Number(precio_unitario);
  if (!Number.isFinite(nuevoPrecio) || nuevoPrecio <= 0) return res.status(400).json({ error: 'Precio inválido' });
  const detalle = db.prepare(`SELECT dv.*, p.costo FROM detalle_ventas dv JOIN productos p ON p.id=dv.producto_id WHERE dv.id=? AND dv.venta_id=?`).get(detalleId, id) as any;
  if (!detalle) return res.status(404).json({ error: 'Detalle no encontrado' });
  if (nuevoPrecio < Number(detalle.costo)) return res.status(400).json({ error: 'No se permite vender por debajo del costo' });

  const base = Number(detalle.cantidad) * nuevoPrecio;
  const tasa = Number(detalle.itbis_tasa ?? 0.18);
  const itbisMonto = base - (base / (1 + tasa));
  const subtotalLinea = base;

  const tx = db.transaction(() => {
    db.prepare('UPDATE detalle_ventas SET precio_unitario=?, itbis_monto=?, subtotal_linea=? WHERE id=?').run(nuevoPrecio, itbisMonto, subtotalLinea, detalleId);
    const totales = db.prepare(`SELECT COALESCE(SUM(cantidad*precio_unitario),0) as subtotal, COALESCE(SUM(itbis_monto),0) as itbis_total, COALESCE(SUM(subtotal_linea),0) as total FROM detalle_ventas WHERE venta_id=?`).get(id) as any;
    db.prepare('UPDATE ventas SET subtotal=?, itbis_total=?, total=?, fecha_actualizacion=? WHERE id=?').run(totales.subtotal, totales.itbis_total, totales.total, ahora(), id);
    db.prepare('INSERT INTO price_override_logs(id,usuario_id,venta_id,order_id,order_item_id,producto_id,precio_original,precio_nuevo,motivo,fecha_creacion) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(uuid(), usuario.id, id, null, null, detalle.producto_id, detalle.precio_unitario, nuevoPrecio, motivo ?? null, ahora());
  });
  tx();

  registrarAuditoria('venta', id, 'override_precio', `Precio cambiado en detalle ${detalleId}`, usuario.id);
  emitir('venta_actualizada', { venta_id: id });
  res.json({ ok: true });
});

ventasRouter.post('/:id/tomar-en-caja', permitir('cajero', 'administrador'), (req, res) => {
  const usuario = (req as any).usuario;
  const id = String(req.params.id);
  const now = ahora();
  const tx = db.transaction(() => {
    const result = db.prepare(`UPDATE ventas SET estado='en_revision_caja', bloqueo_usuario_id=?, bloqueo_desde=?, fecha_actualizacion=?, version=version+1 WHERE id=? AND estado='enviada_a_caja'`).run(usuario.id, now, now, id);
    if (!result.changes) throw new Error('Venta ya tomada por otro usuario o no disponible');
    db.prepare(`UPDATE cash_queue SET estado='en_revision_caja', tomado_por_usuario_id=?, fecha_tomada=?, fecha_actualizacion=? WHERE venta_id=?`).run(usuario.id, now, now, id);
    const detalles = db.prepare('SELECT id FROM detalle_ventas WHERE venta_id=?').all(id) as any[];
    const ins = db.prepare('INSERT OR IGNORE INTO cash_item_checks(id,venta_id,detalle_venta_id,confirmado) VALUES(?,?,?,0)');
    for (const d of detalles) ins.run(uuid(), id, d.id);
  });
  try { tx(); } catch (e: any) { return res.status(409).json({ error: e.message }); }
  registrarAuditoria('venta', id, 'tomar_caja', 'Venta tomada para revisión física', usuario.id);
  emitir('venta_bloqueada', { venta_id: id, usuario_id: usuario.id });
  res.json({ ok: true });
});

ventasRouter.post('/:id/cobrar', permitir('cajero', 'administrador'), permitirCapacidad('can_charge'), (req, res) => {
  const usuario = (req as any).usuario;
  const id = String(req.params.id);
  const { tipo_pago, monto_efectivo = 0, monto_tarjeta = 0, monto_transferencia = 0, monto_nota_credito = 0, referencia, monto_recibido = 0 } = req.body;
  const venta = db.prepare('SELECT * FROM ventas WHERE id=?').get(id) as any;
  if (!venta || venta.estado !== 'lista_para_cobro') return res.status(400).json({ error: 'Venta no lista para cobro' });

  const montoTotal = Number(monto_efectivo) + Number(monto_tarjeta) + Number(monto_transferencia) + Number(monto_nota_credito);
  if (Math.abs(montoTotal - venta.total) > 0.01) return res.status(400).json({ error: `Monto de pago (${montoTotal.toFixed(2)}) no cuadra con total (${venta.total.toFixed(2)})` });
  const cambio = (tipo_pago === 'efectivo' || tipo_pago === 'mixto') ? Math.max(0, Number(monto_recibido) - Number(monto_efectivo)) : 0;

  const now = ahora();
  const tx = db.transaction(() => {
    const tipo = db.prepare("SELECT id,prefijo_fiscal FROM ncf_types WHERE codigo=COALESCE((SELECT invoice_type_code FROM ventas WHERE id=?),'consumidor_final')").get(id) as any;
    if (!tipo) throw new Error('Tipo de NCF no configurado');
    const seq = db.prepare('SELECT * FROM ncf_sequences WHERE ncf_type_id=?').get(tipo.id) as any;
    if (!seq || Number(seq.secuencia_actual) > Number(seq.secuencia_final)) throw new Error('Secuencia NCF agotada');
    const ncfAsignado = formatNcf(tipo.prefijo_fiscal, Number(seq.secuencia_actual));
    db.prepare('UPDATE ncf_sequences SET secuencia_actual=secuencia_actual+1, fecha_actualizacion=? WHERE ncf_type_id=? AND secuencia_actual=?').run(now, tipo.id, seq.secuencia_actual);
    db.prepare(`INSERT INTO pagos(id,venta_id,tipo_pago,monto_total,monto_efectivo,monto_tarjeta,monto_transferencia,referencia,cambio,fecha_creacion,usuario_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(uuid(), id, tipo_pago, montoTotal, monto_efectivo, monto_tarjeta, monto_transferencia, referencia ?? null, cambio, now, usuario.id);
    db.prepare(`UPDATE ventas SET estado='cobrada', cajero_id=?, forma_pago=?, ncf=?, ncf_sequence_value=?, bloqueo_usuario_id=NULL,bloqueo_desde=NULL,fecha_actualizacion=?,version=version+1 WHERE id=?`).run(usuario.id, tipo_pago, ncfAsignado, seq.secuencia_actual, now, id);
    db.prepare("UPDATE cash_queue SET estado='cobrada', fecha_actualizacion=? WHERE venta_id=?").run(now, id);
  });
  try { tx(); } catch (e:any) { return res.status(400).json({ error: e.message }); }

  registrarAuditoria('venta', id, 'cobrar', 'Venta cobrada y NCF asignado', usuario.id);
  emitir('venta_cobrada', { venta_id: id, tipo_pago, montoTotal });
  res.json({ ok: true, cambio });
});



ventasRouter.get('/:id/caja-checklist', permitir('cajero', 'administrador'), (req, res) => {
  const items = db.prepare(`SELECT c.id as check_id, c.confirmado, dv.id as detalle_id, dv.descripcion, dv.cantidad, dv.precio_unitario, dv.subtotal_linea
    FROM cash_item_checks c
    JOIN detalle_ventas dv ON dv.id=c.detalle_venta_id
    WHERE c.venta_id=? ORDER BY dv.descripcion`).all(String(req.params.id));
  res.json(items);
});

ventasRouter.post('/:id/caja-checklist/:checkId', permitir('cajero', 'administrador'), (req, res) => {
  const usuario = (req as any).usuario;
  const id = String(req.params.id);
  db.prepare('UPDATE cash_item_checks SET confirmado=1, confirmado_por_usuario_id=?, fecha_confirmacion=? WHERE id=? AND venta_id=?').run(usuario.id, ahora(), String(req.params.checkId), id);
  const pending = db.prepare('SELECT COUNT(*) as c FROM cash_item_checks WHERE venta_id=? AND confirmado=0').get(id) as any;
  if (Number(pending.c) === 0) {
    db.prepare("UPDATE ventas SET estado='lista_para_cobro', fecha_actualizacion=? WHERE id=?").run(ahora(), id);
    db.prepare("UPDATE cash_queue SET estado='lista_para_cobro', fecha_actualizacion=? WHERE venta_id=?").run(ahora(), id);
  }
  registrarAuditoria('venta', id, 'checklist_caja', `Checklist confirmado ${String(req.params.checkId)}`, usuario.id);
  res.json({ ok: true, pendientes: Number(pending.c) });
});

ventasRouter.get('/preview-ncf/:invoiceTypeCode', permitir('cajero', 'vendedor', 'administrador', 'revendedor'), (req, res) => {
  const row = db.prepare(`SELECT t.prefijo_fiscal, s.secuencia_actual
    FROM ncf_types t JOIN ncf_sequences s ON s.ncf_type_id=t.id WHERE t.codigo=?`).get(req.params.invoiceTypeCode) as any;
  if (!row) return res.status(404).json({ error: 'Tipo de comprobante no configurado' });
  res.json({ ncf: formatNcf(row.prefijo_fiscal, Number(row.secuencia_actual)) });
});

export { ventasRouter };
