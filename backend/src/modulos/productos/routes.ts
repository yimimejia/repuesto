import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { auth, permitir } from '../../shared/auth.js';
import { db } from '../../db/connection.js';
import { registrarAuditoria } from '../../shared/auditoria.js';

const productosRouter = Router();
productosRouter.use(auth);

productosRouter.get('/', (req, res) => {
  const q = String((req.query.q as string | undefined) ?? '').trim();
  const categoria = String((req.query.categoria as string | undefined) ?? '').trim();
  let sql = `SELECT p.*, c.nombre as categoria_nombre, s.nombre_comercial as suplidor_nombre
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria
    LEFT JOIN suplidores s ON s.id = p.suplidor_principal_id
    WHERE 1=1`;
  const params: any[] = [];

  if (q) {
    sql += ' AND (p.codigo LIKE ? OR p.nombre LIKE ? OR p.descripcion LIKE ? OR p.marca LIKE ? OR p.codigo_barras LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (categoria) {
    sql += ' AND p.categoria = ?';
    params.push(categoria);
  }

  sql += ' ORDER BY p.nombre ASC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

productosRouter.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM productos WHERE id=?').get(String(req.params.id));
  if (!row) return res.status(404).json({ error: 'Producto no encontrado' });
  const stock = db.prepare(`SELECT i.*, s.nombre as sucursal_nombre, s.codigo as sucursal_codigo
    FROM inventario_sucursal i JOIN sucursales s ON s.id=i.sucursal_id WHERE i.producto_id=? ORDER BY s.nombre`).all(String(req.params.id));
  res.json({ producto: row, stock_por_sucursal: stock });
});

productosRouter.post('/', permitir('administrador'), (req, res) => {
  const usuario = (req as any).usuario;
  const d = req.body;
  if (!d.codigo || !d.nombre || d.precio == null) return res.status(400).json({ error: 'Campos requeridos incompletos' });
  const ex = db.prepare('SELECT id FROM productos WHERE codigo=?').get(d.codigo) as any;
  if (ex) return res.status(409).json({ error: 'Código de producto ya existe' });

  const id = uuid();
  const now = new Date().toISOString();
  const precioBase = Number(d.precio);
  const precioNegocio1 = Number(d.precio_negocio_1 ?? precioBase);
  const precioNegocio2 = Number(d.precio_negocio_2 ?? precioNegocio1);
  const existenciaInicial = Number(d.existencia_inicial ?? d.existencia ?? 0);
  db.prepare(`INSERT INTO productos(id,codigo,nombre,descripcion,categoria,ubicacion,imagen_url,costo,precio,precio_negocio_1,precio_negocio_2,itbis_tasa,existencia,estado,tipo,marca,medida,lleva_itbis,margen,itbis_porcentaje,existencia_minima,cantidad_a_ordenar,codigo_barras,cuenta_contable,referencia,uso_notas,suplidor_principal_id,fecha_creacion,fecha_actualizacion)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, d.codigo, d.nombre, d.descripcion ?? '', d.categoria ?? null, d.ubicacion ?? '', d.imagen_url ?? '', Number(d.costo ?? 0), precioBase, precioNegocio1, precioNegocio2, Number(d.itbis_tasa ?? 0), existenciaInicial, 'activo', d.tipo ?? '', d.marca ?? '', d.medida ?? '', d.lleva_itbis ? 1 : 0, Number(d.margen ?? 0), Number(d.itbis_porcentaje ?? 18), Number(d.existencia_minima ?? 0), Number(d.cantidad_a_ordenar ?? 0), d.codigo_barras ?? '', d.cuenta_contable ?? '', d.referencia ?? '', d.uso_notas ?? '', d.suplidor_principal_id ?? null, now, now);

  if (existenciaInicial > 0 && d.sucursal_id_inicial) {
    db.prepare(`INSERT INTO inventario_sucursal(id,sucursal_id,producto_id,stock,fecha_creacion,fecha_actualizacion)
      VALUES(?,?,?,?,?,?) ON CONFLICT(sucursal_id,producto_id) DO UPDATE SET stock=stock+excluded.stock, fecha_actualizacion=excluded.fecha_actualizacion`)
      .run(uuid(), d.sucursal_id_inicial, id, existenciaInicial, now, now);
    db.prepare(`INSERT INTO movimientos_inventario(id,sucursal_id,producto_id,cantidad_delta,tipo,referencia_tipo,referencia_id,usuario_id,fecha_creacion)
      VALUES(?,?,?,?,?,?,?,?,?)`)
      .run(uuid(), d.sucursal_id_inicial, id, existenciaInicial, 'entrada_manual', 'creacion_producto', id, usuario?.id ?? null, now);
  }

  registrarAuditoria('producto', id, 'crear', `Producto ${d.codigo} creado con existencia inicial ${existenciaInicial}`, usuario?.id);
  res.status(201).json({ id });
});

productosRouter.put('/:id', permitir('administrador'), (req, res) => {
  const usuario = (req as any).usuario;
  const d = req.body;
  const current = db.prepare('SELECT * FROM productos WHERE id=?').get(String(req.params.id)) as any;
  if (!current) return res.status(404).json({ error: 'Producto no encontrado' });
  if (d.codigo) {
    const ex = db.prepare('SELECT id FROM productos WHERE codigo=? AND id<>?').get(d.codigo, String(req.params.id)) as any;
    if (ex) return res.status(409).json({ error: 'Código de producto ya existe' });
  }
  const now = new Date().toISOString();
  const prevPrecio = Number(current.precio);
  const nuevoPrecio = Number(d.precio ?? current.precio);
  const nuevoPrecioNegocio1 = Number(d.precio_negocio_1 ?? current.precio_negocio_1 ?? nuevoPrecio);
  const nuevoPrecioNegocio2 = Number(d.precio_negocio_2 ?? current.precio_negocio_2 ?? nuevoPrecioNegocio1);
  db.prepare(`UPDATE productos SET
    codigo=?, nombre=?, descripcion=?, categoria=?, ubicacion=?, imagen_url=?, costo=?, precio=?, precio_negocio_1=?, precio_negocio_2=?, itbis_tasa=?,
    tipo=?, marca=?, medida=?, lleva_itbis=?, margen=?, itbis_porcentaje=?, existencia_minima=?, cantidad_a_ordenar=?, codigo_barras=?, cuenta_contable=?, referencia=?, uso_notas=?, suplidor_principal_id=?, fecha_actualizacion=?
    WHERE id=?`)
    .run(d.codigo ?? current.codigo, d.nombre ?? current.nombre, d.descripcion ?? current.descripcion, d.categoria ?? current.categoria, d.ubicacion ?? current.ubicacion, d.imagen_url ?? current.imagen_url, Number(d.costo ?? current.costo), nuevoPrecio, nuevoPrecioNegocio1, nuevoPrecioNegocio2, Number(d.itbis_tasa ?? current.itbis_tasa), d.tipo ?? current.tipo, d.marca ?? current.marca, d.medida ?? current.medida, d.lleva_itbis != null ? (d.lleva_itbis ? 1 : 0) : current.lleva_itbis, Number(d.margen ?? current.margen), Number(d.itbis_porcentaje ?? current.itbis_porcentaje), Number(d.existencia_minima ?? current.existencia_minima), Number(d.cantidad_a_ordenar ?? current.cantidad_a_ordenar), d.codigo_barras ?? current.codigo_barras, d.cuenta_contable ?? current.cuenta_contable, d.referencia ?? current.referencia, d.uso_notas ?? current.uso_notas, d.suplidor_principal_id ?? current.suplidor_principal_id, now, String(req.params.id));

  registrarAuditoria('producto', String(req.params.id), 'editar', `Producto ${d.codigo ?? current.codigo} editado`, usuario?.id);
  if (prevPrecio !== nuevoPrecio) {
    registrarAuditoria('producto', String(req.params.id), 'cambio_precio', `Precio de ${prevPrecio} a ${nuevoPrecio}`, usuario?.id);
  }
  res.json({ ok: true });
});


productosRouter.delete('/:id', permitir('administrador'), (req, res) => {
  const usuario = (req as any).usuario;
  const r = db.prepare("UPDATE productos SET estado='inactivo', fecha_actualizacion=? WHERE id=?").run(new Date().toISOString(), String(req.params.id));
  if (!r.changes) return res.status(404).json({ error: 'Producto no encontrado' });
  registrarAuditoria('producto', String(req.params.id), 'inactivar', 'Producto inactivado', usuario?.id);
  res.json({ ok: true });
});

export { productosRouter };
