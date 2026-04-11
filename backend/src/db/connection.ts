import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';

const db = new Database(env.dbPath);
const schemaPath = path.resolve(process.cwd(), 'sql/schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf-8');
db.exec(schema);

// Migración del sistema legacy AuroraOcean (SQL Server → SQLite)
const legacySchemaPath = path.resolve(process.cwd(), 'sql/legacy_schema.sql');
if (fs.existsSync(legacySchemaPath)) {
  const legacySchema = fs.readFileSync(legacySchemaPath, 'utf-8');
  db.exec(legacySchema);
}

function tieneColumna(tabla: string, columna: string) {
  const cols = db.prepare(`PRAGMA table_info(${tabla})`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === columna);
}

function agregarColumnaSiFalta(tabla: string, columnaDef: string, nombreColumna: string) {
  if (!tieneColumna(tabla, nombreColumna)) {
    db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columnaDef}`);
  }
}

function asegurarMigraciones() {
  db.exec('PRAGMA foreign_keys = ON');

  // Extensiones de clientes
  agregarColumnaSiFalta('clientes', 'codigo TEXT', 'codigo');
  agregarColumnaSiFalta('clientes', 'sucursal_id TEXT', 'sucursal_id');
  agregarColumnaSiFalta('clientes', 'clase_cliente TEXT', 'clase_cliente');
  agregarColumnaSiFalta('clientes', 'cedula_rnc TEXT', 'cedula_rnc');
  agregarColumnaSiFalta('clientes', 'representante TEXT', 'representante');
  agregarColumnaSiFalta('clientes', 'correo TEXT', 'correo');
  agregarColumnaSiFalta('clientes', 'fecha_nacimiento TEXT', 'fecha_nacimiento');
  agregarColumnaSiFalta('clientes', 'telefono_1 TEXT', 'telefono_1');
  agregarColumnaSiFalta('clientes', 'telefono_2 TEXT', 'telefono_2');
  agregarColumnaSiFalta('clientes', 'limite_credito REAL NOT NULL DEFAULT 0', 'limite_credito');
  agregarColumnaSiFalta('clientes', 'limite_tiempo_dias INTEGER NOT NULL DEFAULT 0', 'limite_tiempo_dias');
  agregarColumnaSiFalta('clientes', 'tipo_cliente TEXT', 'tipo_cliente');
  agregarColumnaSiFalta('clientes', "estatus_credito TEXT NOT NULL DEFAULT 'abierto'", 'estatus_credito');
  agregarColumnaSiFalta('clientes', 'foto_url TEXT', 'foto_url');
  agregarColumnaSiFalta('clientes', 'porcentaje_descuento REAL NOT NULL DEFAULT 0', 'porcentaje_descuento');
  agregarColumnaSiFalta('clientes', "tipo_comprobante_fiscal TEXT NOT NULL DEFAULT 'consumidor_final'", 'tipo_comprobante_fiscal');
  agregarColumnaSiFalta('clientes', "credito_score TEXT NOT NULL DEFAULT 'A'", 'credito_score');
  agregarColumnaSiFalta('clientes', "credito_factor REAL NOT NULL DEFAULT 1", 'credito_factor');
  agregarColumnaSiFalta('clientes', 'cierre_credito_motivo TEXT', 'cierre_credito_motivo');
  agregarColumnaSiFalta('clientes', 'cierre_credito_detalle TEXT', 'cierre_credito_detalle');

  // Extensiones de productos
  agregarColumnaSiFalta('productos', 'ubicacion TEXT', 'ubicacion');
  agregarColumnaSiFalta('productos', 'imagen_url TEXT', 'imagen_url');
  agregarColumnaSiFalta('productos', 'costo REAL NOT NULL DEFAULT 0', 'costo');
  agregarColumnaSiFalta('productos', 'tipo TEXT', 'tipo');
  agregarColumnaSiFalta('productos', 'marca TEXT', 'marca');
  agregarColumnaSiFalta('productos', 'medida TEXT', 'medida');
  agregarColumnaSiFalta('productos', 'lleva_itbis INTEGER NOT NULL DEFAULT 1', 'lleva_itbis');
  agregarColumnaSiFalta('productos', 'margen REAL NOT NULL DEFAULT 0', 'margen');
  agregarColumnaSiFalta('productos', 'itbis_porcentaje REAL NOT NULL DEFAULT 18', 'itbis_porcentaje');
  agregarColumnaSiFalta('productos', 'existencia_minima REAL NOT NULL DEFAULT 0', 'existencia_minima');
  agregarColumnaSiFalta('productos', 'cantidad_a_ordenar REAL NOT NULL DEFAULT 0', 'cantidad_a_ordenar');
  agregarColumnaSiFalta('productos', 'precio_negocio_1 REAL NOT NULL DEFAULT 0', 'precio_negocio_1');
  agregarColumnaSiFalta('productos', 'precio_negocio_2 REAL NOT NULL DEFAULT 0', 'precio_negocio_2');
  agregarColumnaSiFalta('productos', 'codigo_barras TEXT', 'codigo_barras');
  agregarColumnaSiFalta('productos', 'cuenta_contable TEXT', 'cuenta_contable');
  agregarColumnaSiFalta('productos', 'referencia TEXT', 'referencia');
  agregarColumnaSiFalta('productos', 'uso_notas TEXT', 'uso_notas');
  agregarColumnaSiFalta('productos', 'suplidor_principal_id TEXT', 'suplidor_principal_id');
  db.exec('UPDATE productos SET precio_negocio_1 = precio WHERE COALESCE(precio_negocio_1,0)=0');
  db.exec('UPDATE productos SET precio_negocio_2 = COALESCE(NULLIF(precio_negocio_1,0), precio) WHERE COALESCE(precio_negocio_2,0)=0');

  // Extensiones de ventas
  agregarColumnaSiFalta('ventas', 'sucursal_id TEXT', 'sucursal_id');
  agregarColumnaSiFalta('ventas', 'forma_pago TEXT', 'forma_pago');
  agregarColumnaSiFalta('ventas', 'descuento_total REAL NOT NULL DEFAULT 0', 'descuento_total');
  agregarColumnaSiFalta('ventas', 'balance_pendiente REAL NOT NULL DEFAULT 0', 'balance_pendiente');
  agregarColumnaSiFalta('ventas', "invoice_type_code TEXT NOT NULL DEFAULT 'consumidor_final'", 'invoice_type_code');
  agregarColumnaSiFalta('ventas', 'ncf_sequence_value INTEGER', 'ncf_sequence_value');
  agregarColumnaSiFalta('ventas', 'cliente_nombre_libre TEXT', 'cliente_nombre_libre');
  agregarColumnaSiFalta('ventas', 'fiscal_rnc TEXT', 'fiscal_rnc');
  agregarColumnaSiFalta('ventas', 'fiscal_empresa TEXT', 'fiscal_empresa');

  // Tabla sucursales
  db.exec(`CREATE TABLE IF NOT EXISTS sucursales (
    id TEXT PRIMARY KEY,
    codigo TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    direccion TEXT,
    telefono TEXT,
    estado TEXT NOT NULL DEFAULT 'activa',
    configuracion_fiscal_json TEXT,
    fecha_creacion TEXT NOT NULL,
    fecha_actualizacion TEXT NOT NULL
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS usuarios_sucursales (
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL,
    sucursal_id TEXT NOT NULL,
    es_predeterminada INTEGER NOT NULL DEFAULT 0,
    fecha_creacion TEXT NOT NULL,
    UNIQUE(usuario_id, sucursal_id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (sucursal_id) REFERENCES sucursales(id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS suplidores (
    id TEXT PRIMARY KEY,
    codigo TEXT UNIQUE,
    nombre_comercial TEXT NOT NULL,
    razon_social TEXT,
    rnc_cedula TEXT,
    telefono TEXT,
    correo TEXT,
    direccion TEXT,
    contacto TEXT,
    estado TEXT NOT NULL DEFAULT 'activo',
    observaciones TEXT,
    fecha_creacion TEXT NOT NULL,
    fecha_actualizacion TEXT NOT NULL
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS categorias (
    id TEXT PRIMARY KEY,
    codigo TEXT UNIQUE,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    estado TEXT NOT NULL DEFAULT 'activa',
    fecha_creacion TEXT NOT NULL,
    fecha_actualizacion TEXT NOT NULL
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS inventario_sucursal (
    id TEXT PRIMARY KEY,
    sucursal_id TEXT NOT NULL,
    producto_id TEXT NOT NULL,
    stock REAL NOT NULL DEFAULT 0,
    fecha_creacion TEXT NOT NULL,
    fecha_actualizacion TEXT NOT NULL,
    UNIQUE(sucursal_id, producto_id),
    FOREIGN KEY (sucursal_id) REFERENCES sucursales(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS movimientos_inventario (
    id TEXT PRIMARY KEY,
    sucursal_id TEXT NOT NULL,
    producto_id TEXT NOT NULL,
    tipo TEXT NOT NULL,
    referencia_tipo TEXT,
    referencia_id TEXT,
    cantidad REAL NOT NULL,
    stock_anterior REAL NOT NULL,
    stock_nuevo REAL NOT NULL,
    observaciones TEXT,
    usuario_id TEXT,
    fecha_creacion TEXT NOT NULL,
    FOREIGN KEY (sucursal_id) REFERENCES sucursales(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS compras (
    id TEXT PRIMARY KEY,
    codigo_compra TEXT UNIQUE NOT NULL,
    suplidor_id TEXT NOT NULL,
    numero_factura TEXT,
    numero_ncf TEXT,
    fecha_factura TEXT NOT NULL,
    fecha_vencimiento TEXT,
    sucursal_id TEXT NOT NULL,
    empleado_id TEXT,
    condicion_compra TEXT NOT NULL CHECK(condicion_compra IN ('contado','credito')),
    estado_pago TEXT NOT NULL DEFAULT 'pendiente',
    estado TEXT NOT NULL DEFAULT 'activa',
    observaciones TEXT,
    subtotal REAL NOT NULL,
    itbis_total REAL NOT NULL,
    descuento_total REAL NOT NULL,
    total REAL NOT NULL,
    fecha_creacion TEXT NOT NULL,
    fecha_actualizacion TEXT NOT NULL,
    FOREIGN KEY (suplidor_id) REFERENCES suplidores(id),
    FOREIGN KEY (sucursal_id) REFERENCES sucursales(id),
    FOREIGN KEY (empleado_id) REFERENCES usuarios(id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS detalle_compras (
    id TEXT PRIMARY KEY,
    compra_id TEXT NOT NULL,
    producto_id TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    cantidad REAL NOT NULL,
    costo_unitario REAL NOT NULL,
    itbis_tasa REAL NOT NULL,
    itbis_monto REAL NOT NULL,
    descuento_monto REAL NOT NULL,
    subtotal_linea REAL NOT NULL,
    total_linea REAL NOT NULL,
    FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES productos(id)
  )`);



  db.exec(`CREATE TABLE IF NOT EXISTS import_uploads (
    id TEXT PRIMARY KEY,
    nombre_archivo TEXT NOT NULL,
    ruta_archivo TEXT NOT NULL,
    size_bytes INTEGER,
    bytes_recibidos INTEGER NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'subiendo',
    creado_por TEXT,
    fecha_creacion TEXT NOT NULL,
    fecha_actualizacion TEXT NOT NULL
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS import_jobs (
    id TEXT PRIMARY KEY,
    nombre_archivo TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'analizado',
    motor_origen TEXT,
    motor_destino TEXT NOT NULL DEFAULT 'sqlite',
    resumen_json TEXT,
    errores_json TEXT,
    advertencias_json TEXT,
    confirmado INTEGER NOT NULL DEFAULT 0,
    creado_por TEXT,
    fecha_creacion TEXT NOT NULL,
    fecha_actualizacion TEXT NOT NULL
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS import_staging_rows (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    tabla_legacy TEXT NOT NULL,
    tabla_destino TEXT,
    legacy_key TEXT,
    data_json TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    error TEXT,
    fecha_creacion TEXT NOT NULL,
    FOREIGN KEY (job_id) REFERENCES import_jobs(id) ON DELETE CASCADE
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS import_logs (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    nivel TEXT NOT NULL,
    modulo TEXT,
    mensaje TEXT NOT NULL,
    data_json TEXT,
    fecha_creacion TEXT NOT NULL,
    FOREIGN KEY (job_id) REFERENCES import_jobs(id) ON DELETE CASCADE
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS import_imported_refs (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    entidad TEXT NOT NULL,
    entidad_id TEXT NOT NULL,
    fecha_creacion TEXT NOT NULL,
    FOREIGN KEY (job_id) REFERENCES import_jobs(id) ON DELETE CASCADE
  )`);

  

  db.exec(`CREATE TABLE IF NOT EXISTS capacidades (
    id TEXT PRIMARY KEY,
    codigo TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    fecha_creacion TEXT NOT NULL
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS usuario_capacidades (
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL,
    capacidad_id TEXT NOT NULL,
    fecha_creacion TEXT NOT NULL,
    UNIQUE(usuario_id, capacidad_id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (capacidad_id) REFERENCES capacidades(id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS ncf_types (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    codigo TEXT UNIQUE NOT NULL,
    prefijo_fiscal TEXT NOT NULL,
    activo INTEGER NOT NULL DEFAULT 1,
    fecha_vigencia_desde TEXT,
    fecha_vigencia_hasta TEXT,
    observaciones TEXT,
    fecha_creacion TEXT NOT NULL,
    fecha_actualizacion TEXT NOT NULL
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS ncf_sequences (
    id TEXT PRIMARY KEY,
    ncf_type_id TEXT NOT NULL UNIQUE,
    secuencia_inicial INTEGER NOT NULL,
    secuencia_actual INTEGER NOT NULL,
    secuencia_final INTEGER NOT NULL,
    fecha_creacion TEXT NOT NULL,
    fecha_actualizacion TEXT NOT NULL,
    FOREIGN KEY (ncf_type_id) REFERENCES ncf_types(id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS cash_queue (
    id TEXT PRIMARY KEY,
    venta_id TEXT NOT NULL UNIQUE,
    estado TEXT NOT NULL,
    tomado_por_usuario_id TEXT,
    fecha_tomada TEXT,
    fecha_creacion TEXT NOT NULL,
    fecha_actualizacion TEXT NOT NULL,
    FOREIGN KEY (venta_id) REFERENCES ventas(id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS cash_item_checks (
    id TEXT PRIMARY KEY,
    venta_id TEXT NOT NULL,
    detalle_venta_id TEXT NOT NULL,
    confirmado INTEGER NOT NULL DEFAULT 0,
    confirmado_por_usuario_id TEXT,
    fecha_confirmacion TEXT,
    UNIQUE(venta_id, detalle_venta_id),
    FOREIGN KEY (venta_id) REFERENCES ventas(id),
    FOREIGN KEY (detalle_venta_id) REFERENCES detalle_ventas(id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    numero_orden TEXT UNIQUE NOT NULL,
    cliente_id TEXT NOT NULL,
    usuario_creador_id TEXT NOT NULL,
    venta_origen_id TEXT,
    estado TEXT NOT NULL,
    observaciones TEXT,
    pago_registrado INTEGER NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    fecha_creacion TEXT NOT NULL,
    fecha_actualizacion TEXT NOT NULL,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (usuario_creador_id) REFERENCES usuarios(id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    producto_id TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    marca TEXT,
    ubicacion TEXT,
    cantidad REAL NOT NULL,
    precio_unitario REAL NOT NULL,
    encontrado INTEGER NOT NULL DEFAULT 0,
    cantidad_verificada REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES productos(id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS order_assignments (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    picker_usuario_id TEXT NOT NULL,
    assigned_by_usuario_id TEXT NOT NULL,
    fecha_creacion TEXT NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (picker_usuario_id) REFERENCES usuarios(id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS order_verifications (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    order_item_id TEXT NOT NULL,
    verifier_usuario_id TEXT NOT NULL,
    bundle_id TEXT,
    cantidad_esperada REAL NOT NULL,
    cantidad_verificada REAL NOT NULL,
    confirmado INTEGER NOT NULL DEFAULT 0,
    fecha_creacion TEXT NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (order_item_id) REFERENCES order_items(id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS bundles (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    numero_bulto INTEGER NOT NULL,
    estado TEXT NOT NULL,
    cerrado_por_usuario_id TEXT,
    fecha_cierre TEXT,
    etiqueta_impresa_en TEXT,
    fecha_creacion TEXT NOT NULL,
    fecha_actualizacion TEXT NOT NULL,
    UNIQUE(order_id, numero_bulto),
    FOREIGN KEY (order_id) REFERENCES orders(id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS bundle_items (
    id TEXT PRIMARY KEY,
    bundle_id TEXT NOT NULL,
    order_item_id TEXT NOT NULL,
    cantidad REAL NOT NULL,
    fecha_creacion TEXT NOT NULL,
    FOREIGN KEY (bundle_id) REFERENCES bundles(id),
    FOREIGN KEY (order_item_id) REFERENCES order_items(id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS price_override_logs (
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL,
    venta_id TEXT,
    order_id TEXT,
    order_item_id TEXT,
    producto_id TEXT,
    precio_original REAL NOT NULL,
    precio_nuevo REAL NOT NULL,
    motivo TEXT,
    fecha_creacion TEXT NOT NULL
  )`);



  db.exec(`CREATE TABLE IF NOT EXISTS dgii_rnc (
    id TEXT PRIMARY KEY,
    rnc TEXT NOT NULL UNIQUE,
    razon_social TEXT,
    nombre_comercial TEXT,
    categoria TEXT,
    regimen_pagos TEXT,
    estado TEXT,
    actividad_economica TEXT,
    administracion_local TEXT,
    facturador_electronico TEXT,
    fuente TEXT,
    fecha_actualizacion_fuente TEXT,
    creado_en TEXT NOT NULL,
    actualizado_en TEXT NOT NULL
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS dgii_rnc_sync_log (
    id TEXT PRIMARY KEY,
    inicio TEXT NOT NULL,
    fin TEXT,
    estado TEXT NOT NULL,
    tipo_ejecucion TEXT NOT NULL,
    cantidad_insertados INTEGER NOT NULL DEFAULT 0,
    cantidad_actualizados INTEGER NOT NULL DEFAULT 0,
    cantidad_omitidos INTEGER NOT NULL DEFAULT 0,
    url_origen TEXT,
    formato TEXT,
    mensaje_error TEXT,
    archivo_descargado TEXT,
    hash_archivo TEXT
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS credit_score_logs (
    id TEXT PRIMARY KEY,
    cliente_id TEXT NOT NULL,
    score_anterior TEXT,
    score_nuevo TEXT NOT NULL,
    factor_anterior REAL,
    factor_nuevo REAL NOT NULL,
    dias_atraso INTEGER NOT NULL DEFAULT 0,
    motivo TEXT NOT NULL,
    usuario_id TEXT,
    fecha TEXT NOT NULL,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
  )`);

  try { db.exec("ALTER TABLE clientes ADD COLUMN ciudad TEXT"); } catch {}
  db.exec('CREATE INDEX IF NOT EXISTS idx_clientes_codigo ON clientes(codigo)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_clientes_doc ON clientes(cedula_rnc)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_productos_barra ON productos(codigo_barras)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_ventas_sucursal ON ventas(sucursal_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_compras_sucursal ON compras(sucursal_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_mov_inv_ref ON movimientos_inventario(referencia_tipo, referencia_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_dgii_rnc_rnc ON dgii_rnc(rnc)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_dgii_rnc_razon ON dgii_rnc(razon_social)');

  // ── Módulo tributario 606 ────────────────────────────────────────────────
  db.exec(`CREATE TABLE IF NOT EXISTS tax_configuration (
    id INTEGER PRIMARY KEY DEFAULT 1,
    rnc_contribuyente TEXT NOT NULL DEFAULT '',
    nombre_comercial TEXT NOT NULL DEFAULT '',
    emisor_electronico INTEGER NOT NULL DEFAULT 0,
    incluir_serie_b INTEGER NOT NULL DEFAULT 1,
    incluir_ecf_recibidos INTEGER NOT NULL DEFAULT 0,
    reglas_especiales_json TEXT NOT NULL DEFAULT '{}',
    version_plantilla TEXT NOT NULL DEFAULT '2024',
    fecha_actualizacion TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  // Asegurar fila única de configuración
  db.exec(`INSERT OR IGNORE INTO tax_configuration(id) VALUES(1)`);

  db.exec(`CREATE TABLE IF NOT EXISTS tax_606_catalogs (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL,
    codigo TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    activo INTEGER NOT NULL DEFAULT 1,
    UNIQUE(tipo, codigo)
  )`);

  // Catálogos base
  const insertCatalog = db.prepare(`INSERT OR IGNORE INTO tax_606_catalogs(id,tipo,codigo,descripcion) VALUES(lower(hex(randomblob(8))),?,?,?)`);
  const catalogs: [string,string,string][] = [
    ['tipo_identificacion','1','RNC (Registro Nacional del Contribuyente)'],
    ['tipo_identificacion','2','Cédula de Identidad y Electoral'],
    ['tipo_identificacion','3','Pasaporte'],
    ['tipo_identificacion','4','Número de Identificación en el Exterior'],
    ['tipo_bienes_servicios','1','Gastos de Personal'],
    ['tipo_bienes_servicios','2','Gastos por Trabajo, Suministros y Servicios'],
    ['tipo_bienes_servicios','3','Arrendamientos'],
    ['tipo_bienes_servicios','4','Gastos de Activos Fijos'],
    ['tipo_bienes_servicios','5','Representación y Gastos de Viaje'],
    ['tipo_bienes_servicios','6','Gastos Deducibles (Otros)'],
    ['tipo_bienes_servicios','7','Compra de Materias Primas'],
    ['tipo_bienes_servicios','8','Adquisición de Otros Bienes'],
    ['tipo_bienes_servicios','9','Adquisición de Activos'],
    ['tipo_bienes_servicios','10','Gastos no Deducibles'],
    ['tipo_bienes_servicios','11','Importaciones'],
    ['tipo_retencion_isr','1','Alquileres (10%)'],
    ['tipo_retencion_isr','2','Honorarios por Servicios (10%)'],
    ['tipo_retencion_isr','3','Otras Rentas (10%)'],
    ['tipo_retencion_isr','4','Otras Rentas (Personas Jurídicas) (27%)'],
    ['tipo_retencion_isr','5','Intereses Pagados a Personas Jurídicas Residentes (10%)'],
    ['tipo_retencion_isr','6','Intereses Pagados a Personas Físicas Residentes (10%)'],
    ['tipo_retencion_isr','7','Retención por Proveedores del Estado (5%)'],
    ['tipo_retencion_isr','8','Juegos Telefónicos (10%)'],
    ['forma_pago','1','Efectivo'],
    ['forma_pago','2','Cheques / Transferencias / Depósitos'],
    ['forma_pago','3','Tarjeta de Débito / Crédito'],
    ['forma_pago','4','A Crédito'],
    ['forma_pago','5','Permuta'],
    ['forma_pago','6','Nota de Crédito'],
    ['forma_pago','7','Mixto'],
    ['tipo_comprobante','B01','Factura de Crédito Fiscal'],
    ['tipo_comprobante','B02','Factura por Consumo'],
    ['tipo_comprobante','B03','Nota de Débito'],
    ['tipo_comprobante','B04','Nota de Crédito'],
    ['tipo_comprobante','B11','Comprobante de Compras'],
    ['tipo_comprobante','B13','Gastos Menores'],
    ['tipo_comprobante','B14','Regímenes Especiales de Tributación'],
    ['tipo_comprobante','B15','Gubernamental'],
    ['tipo_comprobante','B16','Para Exportaciones'],
    ['tipo_comprobante','B17','Para Pagos al Exterior'],
    ['tipo_comprobante','E31','e-CF Factura de Crédito Fiscal Electrónica'],
    ['tipo_comprobante','E32','e-CF Factura para Consumidor Final Electrónica'],
    ['tipo_comprobante','E33','e-CF Nota de Débito Electrónica'],
    ['tipo_comprobante','E34','e-CF Nota de Crédito Electrónica'],
    ['tipo_comprobante','E41','e-CF Comprobante de Compras Electrónico'],
    ['tipo_comprobante','E43','e-CF Gastos Menores Electrónico'],
    ['tipo_comprobante','E44','e-CF Regímenes Especiales de Tributación Electrónico'],
    ['tipo_comprobante','E45','e-CF Gubernamental Electrónico'],
    ['tipo_comprobante','E47','e-CF para Pagos al Exterior Electrónico'],
  ];
  for (const [tipo, codigo, descripcion] of catalogs) {
    insertCatalog.run(tipo, codigo, descripcion);
  }

  db.exec(`CREATE TABLE IF NOT EXISTS tax_606_records (
    id TEXT PRIMARY KEY,
    periodo TEXT NOT NULL,
    rnc_cedula_suplidor TEXT NOT NULL,
    tipo_identificacion TEXT NOT NULL,
    tipo_bienes_servicios TEXT,
    numero_comprobante TEXT NOT NULL,
    numero_comprobante_modificado TEXT,
    fecha_comprobante TEXT NOT NULL,
    fecha_pago TEXT,
    monto_bienes REAL NOT NULL DEFAULT 0,
    monto_servicios REAL NOT NULL DEFAULT 0,
    total_monto_facturado REAL NOT NULL DEFAULT 0,
    itbis_facturado REAL NOT NULL DEFAULT 0,
    itbis_retenido REAL NOT NULL DEFAULT 0,
    itbis_proporcionalidad REAL NOT NULL DEFAULT 0,
    itbis_costo REAL NOT NULL DEFAULT 0,
    itbis_por_adelantar REAL NOT NULL DEFAULT 0,
    itbis_percibido REAL NOT NULL DEFAULT 0,
    tipo_retencion_isr TEXT,
    monto_retencion_renta REAL NOT NULL DEFAULT 0,
    isr_percibido REAL NOT NULL DEFAULT 0,
    impuesto_selectivo REAL NOT NULL DEFAULT 0,
    otros_impuestos REAL NOT NULL DEFAULT 0,
    monto_propina_legal REAL NOT NULL DEFAULT 0,
    forma_pago TEXT NOT NULL DEFAULT '1',
    estado TEXT NOT NULL DEFAULT 'borrador',
    excluido INTEGER NOT NULL DEFAULT 0,
    excluido_justificacion TEXT,
    observaciones TEXT,
    errores_json TEXT,
    creado_por_id TEXT,
    actualizado_por_id TEXT,
    fecha_creacion TEXT NOT NULL,
    fecha_actualizacion TEXT NOT NULL
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_606_periodo ON tax_606_records(periodo)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_606_rnc ON tax_606_records(rnc_cedula_suplidor)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_606_ncf ON tax_606_records(numero_comprobante)');

  db.exec(`CREATE TABLE IF NOT EXISTS tax_606_periods (
    periodo TEXT PRIMARY KEY,
    estado TEXT NOT NULL DEFAULT 'abierto',
    cerrado_por_id TEXT,
    fecha_cierre TEXT,
    reabierto_por_id TEXT,
    fecha_reapertura TEXT,
    fecha_creacion TEXT NOT NULL
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS tax_606_exports (
    id TEXT PRIMARY KEY,
    periodo TEXT NOT NULL,
    nombre_archivo TEXT NOT NULL,
    contenido_txt TEXT NOT NULL,
    hash_archivo TEXT NOT NULL,
    cantidad_registros INTEGER NOT NULL DEFAULT 0,
    total_facturado REAL NOT NULL DEFAULT 0,
    total_itbis REAL NOT NULL DEFAULT 0,
    exportado_por_id TEXT,
    fecha_creacion TEXT NOT NULL
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS tax_606_audit_logs (
    id TEXT PRIMARY KEY,
    record_id TEXT NOT NULL,
    campo TEXT NOT NULL,
    valor_anterior TEXT,
    valor_nuevo TEXT,
    usuario_id TEXT,
    fecha_creacion TEXT NOT NULL
  )`);

  const now = new Date().toISOString();

  const defaultSucursal = db.prepare('SELECT id FROM sucursales LIMIT 1').get() as { id: string } | undefined;
  if (!defaultSucursal) {
    db.prepare('INSERT INTO sucursales(id,codigo,nombre,direccion,telefono,estado,configuracion_fiscal_json,fecha_creacion,fecha_actualizacion) VALUES(lower(hex(randomblob(16))),?,?,?,?,?,?,?,?)')
      .run('PRINCIPAL', 'Sucursal Principal', 'No definida', '', 'activa', JSON.stringify({ ncf_prefijo: 'B01' }), now, now);
  }

  db.prepare("DELETE FROM sucursales WHERE codigo='SUC-11'").run();
}

asegurarMigraciones();

export { db };
