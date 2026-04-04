import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../../db/connection.js';
import { auth, permitir } from '../../shared/auth.js';
import { ajustarInventario } from '../inventario/service.js';
import { emitir } from '../../realtime/hub.js';
import { registrarAuditoria } from '../../shared/auditoria.js';

const ahora = () => new Date().toISOString();
export const notasCreditoRouter = Router();
notasCreditoRouter.use(auth);

function generarNumeroNC(): string {
  const ultima = db.prepare("SELECT numero FROM notas_credito ORDER BY fecha_creacion DESC LIMIT 1").get() as any;
  if (!ultima) return 'NC-0001';
  const match = ultima.numero.match(/NC-(\d+)/);
  if (!match) return 'NC-0001';
  const siguiente = Number(match[1]) + 1;
  return `NC-${String(siguiente).padStart(4, '0')}`;
}

notasCreditoRouter.get('/', permitir('cajero', 'administrador', 'vendedor', 'al_por_mayor'), (req, res) => {
  const { cliente_id, estado, fecha_desde, fecha_hasta } = req.query;
  let sql = `SELECT nc.*, c.nombre as cliente_nombre, c.telefono_1 as cliente_telefono
    , v.numero_interno as venta_numero, v.fecha_creacion as venta_fecha, v.sucursal_id as venta_sucursal_id, v.vendedor_id
    FROM notas_credito nc
    JOIN clientes c ON c.id = nc.cliente_id
    LEFT JOIN ventas v ON v.id = nc.venta_original_id
    WHERE 1=1`;
  const params: any[] = [];
  if (cliente_id) { sql += ' AND nc.cliente_id = ?'; params.push(cliente_id); }
  if (estado) { sql += ' AND nc.estado = ?'; params.push(estado); }
  if (fecha_desde) { sql += ' AND date(nc.fecha_creacion) >= date(?)'; params.push(fecha_desde); }
  if (fecha_hasta) { sql += ' AND date(nc.fecha_creacion) <= date(?)'; params.push(fecha_hasta); }
  sql += ' ORDER BY nc.fecha_creacion DESC LIMIT 200';
  res.json(db.prepare(sql).all(...params));
});

notasCreditoRouter.get('/codigo/:codigo', permitir('cajero', 'administrador', 'vendedor', 'al_por_mayor'), (req, res) => {
  const nc = db.prepare(`SELECT nc.*, c.nombre as cliente_nombre
    FROM notas_credito nc JOIN clientes c ON c.id = nc.cliente_id
    WHERE nc.numero = ?`).get(req.params.codigo) as any;
  if (!nc) return res.status(404).json({ error: 'Nota de crédito no encontrada' });
  const detalle = db.prepare('SELECT * FROM detalle_devoluciones WHERE nota_credito_id = ?').all(nc.id);
  return res.json({ ...nc, detalle });
});

notasCreditoRouter.post('/generar', permitir('cajero', 'administrador', 'vendedor', 'al_por_mayor'), (req, res) => {
  const usuario = (req as any).usuario;
  const { venta_id, items_devolucion, notas: notasTexto } = req.body as {
    venta_id: string;
    items_devolucion: { producto_id: string; codigo_producto: string; descripcion: string; cantidad: number; precio_unitario: number; itbis_tasa?: number }[];
    notas?: string;
  };

  if (!venta_id || !Array.isArray(items_devolucion) || items_devolucion.length === 0) {
    return res.status(400).json({ error: 'Datos de devolución inválidos' });
  }

  const venta = db.prepare('SELECT * FROM ventas WHERE id = ?').get(venta_id) as any;
  if (!venta) return res.status(404).json({ error: 'Venta original no encontrada' });

  const items = items_devolucion.filter(i => Number(i.cantidad) > 0);
  if (items.length === 0) return res.status(400).json({ error: 'Debe seleccionar al menos un item con cantidad mayor a 0' });

  let montoTotal = 0;
  for (const i of items) {
    const base = Number(i.cantidad) * Number(i.precio_unitario);
    const itbis = base * Number(i.itbis_tasa ?? 0.18);
    montoTotal += base + itbis;
  }

  const ncId = uuid();
  const now = ahora();

  try {
    const tx = db.transaction(() => {
      const numero = generarNumeroNC();
      db.prepare(`INSERT INTO notas_credito(id, numero, cliente_id, venta_original_id, monto_original, monto_restante, estado, emitida_por, notas, fecha_creacion, fecha_actualizacion)
        VALUES (?, ?, ?, ?, ?, ?, 'activo', ?, ?, ?, ?)`)
        .run(ncId, numero, venta.cliente_id, venta_id, montoTotal, montoTotal, usuario.id, notasTexto ?? null, now, now);

      for (const i of items) {
        db.prepare(`INSERT INTO detalle_devoluciones(id, nota_credito_id, producto_id, codigo_producto, descripcion, cantidad_devuelta, precio_unitario, fecha_creacion)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(uuid(), ncId, i.producto_id, i.codigo_producto, i.descripcion, i.cantidad, i.precio_unitario, now);

        ajustarInventario({
          sucursalId: venta.sucursal_id,
          productoId: i.producto_id,
          cantidadDelta: Number(i.cantidad),
          tipo: 'reversa_venta',
          referenciaTipo: 'nota_credito',
          referenciaId: ncId,
          observaciones: `Devolución NC ${numero}`,
          usuarioId: usuario.id,
        });
      }
    });
    tx();

    const nc = db.prepare('SELECT * FROM notas_credito WHERE id = ?').get(ncId) as any;
    registrarAuditoria('nota_credito', ncId, 'crear', `NC ${nc.numero} generada por devolución de venta ${venta.numero_interno}`, usuario.id);
    emitir('nota_credito_creada', { id: ncId, numero: nc.numero, monto: montoTotal });
    return res.status(201).json(nc);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

notasCreditoRouter.post('/aplicar', permitir('cajero', 'administrador', 'vendedor', 'al_por_mayor'), (req, res) => {
  const usuario = (req as any).usuario;
  const { codigo_nc, total_compra, cliente_id } = req.body as { codigo_nc: string; total_compra: number; cliente_id: string };

  if (!codigo_nc || !total_compra) return res.status(400).json({ error: 'Código NC y total son requeridos' });

  const nc = db.prepare('SELECT * FROM notas_credito WHERE numero = ?').get(codigo_nc) as any;
  if (!nc) return res.status(404).json({ error: 'Nota de crédito no encontrada' });
  if (nc.estado === 'usado') return res.status(400).json({ error: 'Esta nota de crédito ya fue utilizada completamente' });
  if (nc.estado === 'anulado') return res.status(400).json({ error: 'Esta nota de crédito está anulada' });
  if (nc.cliente_id !== cliente_id) return res.status(400).json({ error: 'Esta nota de crédito pertenece a otro cliente' });
  if (Number(nc.monto_restante) <= 0) return res.status(400).json({ error: 'Esta nota de crédito no tiene saldo disponible' });

  const monto_nc = Number(nc.monto_restante);
  const total = Number(total_compra);

  if (monto_nc >= total) {
    const saldo_restante = monto_nc - total;
    const now = ahora();

    if (saldo_restante < 0.01) {
      db.prepare("UPDATE notas_credito SET estado='usado', monto_restante=0, fecha_actualizacion=? WHERE id=?").run(now, nc.id);
      return res.json({
        resultado: 'completo',
        monto_aplicado: total,
        saldo_restante: 0,
        nc_agotada: true,
        nueva_nc: null,
        diferencia_pagar: 0,
      });
    } else {
      const nuevaId = uuid();
      const nuevaNum = generarNumeroNC();
      db.prepare("UPDATE notas_credito SET estado='usado', monto_restante=0, fecha_actualizacion=? WHERE id=?").run(now, nc.id);
      db.prepare(`INSERT INTO notas_credito(id, numero, cliente_id, venta_original_id, monto_original, monto_restante, estado, emitida_por, notas, fecha_creacion, fecha_actualizacion)
        VALUES (?, ?, ?, ?, ?, ?, 'activo', ?, ?, ?, ?)`)
        .run(nuevaId, nuevaNum, nc.cliente_id, nc.venta_original_id, saldo_restante, saldo_restante, usuario.id, `Saldo de ${nc.numero}`, now, now);
      const nueva_nc = db.prepare('SELECT * FROM notas_credito WHERE id=?').get(nuevaId);
      return res.json({
        resultado: 'con_saldo',
        monto_aplicado: total,
        saldo_restante,
        nc_agotada: true,
        nueva_nc,
        diferencia_pagar: 0,
      });
    }
  } else {
    const diferencia = total - monto_nc;
    const now = ahora();
    db.prepare("UPDATE notas_credito SET estado='usado', monto_restante=0, fecha_actualizacion=? WHERE id=?").run(now, nc.id);
    return res.json({
      resultado: 'insuficiente',
      monto_aplicado: monto_nc,
      saldo_restante: 0,
      nc_agotada: true,
      nueva_nc: null,
      diferencia_pagar: diferencia,
    });
  }
});

notasCreditoRouter.post('/:id/anular', permitir('administrador'), (req, res) => {
  const nc = db.prepare('SELECT * FROM notas_credito WHERE id=?').get(req.params.id) as any;
  if (!nc) return res.status(404).json({ error: 'NC no encontrada' });
  db.prepare("UPDATE notas_credito SET estado='anulado', fecha_actualizacion=? WHERE id=?").run(ahora(), nc.id);
  res.json({ ok: true });
});
