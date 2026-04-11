import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/theme.css';
import { Layout, MenuItem } from './app/Layout';
import { qzConnect, qzIsConnected, qzGetPrinters, qzPrintHtml } from './qz';

const API = import.meta.env.VITE_API_BASE ?? '/api';
const WS_URL = import.meta.env.VITE_WS_URL ?? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

function moduloDesdeRuta(pathname: string) {
  if (pathname === '/admin/importar-sql-legado') return 'importador';
  return null;
}

function rutaDesdeModulo(modulo: string, rol: string) {
  if (rol === 'administrador' && modulo === 'importador') return '/admin/importar-sql-legado';
  return '/';
}

type Usuario = { id: string; username: string; nombre: string; rol: string; sucursal_id?: string | null; capacidades?: string[]; puede_agregar_fidelidad?: boolean };
type Cliente = any;
type Producto = any;
type Sucursal = any;
type Categoria = any;
type Suplidor = any;
type Vendedor = any;
type Toast = { id: number; tipo: 'ok' | 'error'; texto: string };
const money = (n: number) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const scorePorAtraso = (diasAtraso: number) => {
  if (diasAtraso >= 120) return { grado: 'G', factor: 0 };
  if (diasAtraso >= 90) return { grado: 'F', factor: 0.5 };
  if (diasAtraso >= 60) return { grado: 'D', factor: 0.75 };
  if (diasAtraso >= 30) return { grado: 'C', factor: 0.85 };
  if (diasAtraso >= 7) return { grado: 'B', factor: 0.9 };
  return { grado: 'A', factor: 1 };
};

const menuPorRol: Record<string, MenuItem[]> = {
  vendedor: [
    { key: 'pos', label: 'POS Vendedor', icono: '🧾', acento: 'violeta' },
    { key: 'ordenes', label: 'Órdenes / Pedidos', icono: '📦', acento: 'celeste' },
  ],
  cajero: [
    { key: 'pos', label: 'POS / Caja', icono: '🧾', acento: 'violeta' },
    { key: 'caja', label: 'Facturas y Cobros', icono: '💳', acento: 'celeste' },
    { key: 'ordenes', label: 'Órdenes / Pedidos', icono: '📦', acento: 'celeste' },
    { key: 'pendiente-verificar', label: 'Pendiente verificar', icono: '✅', acento: 'verde' },
    { key: 'historial-ventas', label: 'Historial de Ventas', icono: '🗂️', acento: 'gris' },
    { key: 'fidelidad', label: 'Fidelidad', icono: '⭐', acento: 'amarillo' },
  ],
  al_por_mayor: [{ key: 'mayorista', label: 'Edición Mayorista', icono: '🏷️', acento: 'naranja' }],
  revendedor: [
    { key: 'revendedor', label: 'Catálogo Revendedor', icono: '🛍️', acento: 'verde' },
    { key: 'ordenes', label: 'Órdenes', icono: '📦', acento: 'celeste' },
    { key: 'cxc', label: 'Cobros Crédito', icono: '📒', acento: 'amarillo' },
    { key: 'por-vencer', label: 'Por vencer', icono: '⏳', acento: 'rojo' },
    { key: 'cuadrar', label: 'Cuadrar', icono: '⚖️', acento: 'amarillo' },
  ],
  buscador: [
    { key: 'ordenes', label: 'Órdenes asignadas', icono: '📦', acento: 'celeste' },
  ],
  chofer: [
    { key: 'chofer', label: 'Mis entregas', icono: '🚗', acento: 'celeste' },
  ],
  administrador: [
    { key: 'admin-dashboard', label: 'Dashboard', icono: '📈', acento: 'azul' },
    { key: 'pos', label: 'POS Vendedor', icono: '🧾', acento: 'violeta' },
    { key: 'caja', label: 'Caja / Cobros', icono: '💳', acento: 'celeste' },
    { key: 'ordenes', label: 'Órdenes / Pedidos', icono: '📦', acento: 'celeste' },
    { key: 'historial-ventas', label: 'Historial de Ventas', icono: '🗂️', acento: 'gris' },
    { key: 'devoluciones', label: 'Devoluciones', icono: '↩️', acento: 'naranja' },
    { key: 'cxc', label: 'Cuentas por Cobrar', icono: '📒', acento: 'amarillo' },
    { key: 'fidelidad', label: 'Fidelidad', icono: '⭐', acento: 'amarillo' },
    { key: 'productos', label: 'Productos', icono: '🔩', acento: 'verde' },
    { key: 'clientes', label: 'Clientes', icono: '👥', acento: 'naranja' },
    { key: 'compras', label: 'Compras', icono: '🧮', acento: 'rojo' },
    { key: 'inventario', label: 'Inventario Sucursal', icono: '🏪', acento: 'violeta' },
    { key: 'maestros', label: 'Suc / Cat / Suplidor', icono: '🧱', acento: 'celeste' },
    { key: 'usuarios', label: 'Usuarios', icono: '🛡️', acento: 'morado' },
    { key: 'ncf', label: 'Rangos NCF', icono: '🧾', acento: 'rojo' },
    { key: 'dgii', label: 'Catálogo DGII', icono: '🏛️', acento: 'gris' },
    { key: 'importador', label: 'Importar SQL', icono: '🧬', acento: 'gris' },
    { key: 'reportes', label: 'Reportes', icono: '📊', acento: 'azul' },
    { key: 'contabilidad', label: 'Contabilidad', icono: '🏦', acento: 'verde' },
    { key: 'eventos', label: 'Eventos', icono: '🔔', acento: 'rojo' },
  ],
};

async function api<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text() || 'Error de API');
  return res.json();
}

function Login({ onSuccess }: { onSuccess: (token: string, usuario: Usuario) => void }) {
  const [username, setUsername] = useState('admin1');
  const [password, setPassword] = useState('1234');
  const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'No se pudo iniciar sesión');
      onSuccess(data.token, data.usuario);
    } catch (err: any) { setError(err.message); }
  }
  return <div className="login-wrap"><form className="login-card" onSubmit={submit}><h1>Repuestos Calcaño</h1><label>Usuario</label><input value={username} onChange={(e) => setUsername(e.target.value)} /><label>Contraseña</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />{error && <div className="alert-error">{error}</div>}<button className="btn btn-primary">Iniciar sesión</button></form></div>;
}

function ReporteTabla({ filas }: { filas: any[] }) {
  if (!filas || filas.length === 0) return <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>Sin registros</p>;
  const cols = Object.keys(filas[0]);
  return (
    <div style={{ overflowX: 'auto', maxHeight: 480, overflowY: 'auto' }}>
      <table className="table-premium">
        <thead>
          <tr>{cols.map((c) => <th key={c}>{c.replace(/_/g, ' ')}</th>)}</tr>
        </thead>
        <tbody>
          {filas.slice(0, 200).map((row, i) => (
            <tr key={i}>
              {cols.map((c) => <td key={c}>{row[c] !== null && row[c] !== undefined ? String(row[c]) : '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const REPORTE_LABELS: Record<string, string> = {
  'clientes': 'Clientes',
  'suplidores': 'Suplidores',
  'productos': 'Productos',
  'inventario-sucursal': 'Inventario Sucursal',
  'compras-por-suplidor': 'Compras por Suplidor',
  'compras-por-sucursal': 'Compras por Sucursal',
  'ventas-por-sucursal': 'Ventas por Sucursal',
  'eficiencia-vendedores': 'Eficiencia por Vendedor',
  'cxc': 'Cuentas por Cobrar',
  'existencia-minima': 'Existencia Mínima',
  'base-606': 'Base 606',
};

const REPORTE_ICONS: Record<string, string> = {
  'clientes': '👥', 'suplidores': '🏭', 'productos': '🔩', 'inventario-sucursal': '🏪',
  'compras-por-suplidor': '🧮', 'compras-por-sucursal': '🧮', 'ventas-por-sucursal': '📈',
  'eficiencia-vendedores': '🏁',
  'cxc': '📒', 'existencia-minima': '⚠️', 'base-606': '🗂️',
};

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('pos_token') ?? '');
  const [usuario, setUsuario] = useState<Usuario | null>(() => {
    try { return JSON.parse(localStorage.getItem('pos_usuario') ?? 'null'); } catch { return null; }
  });
  const [modulo, setModulo] = useState(() => localStorage.getItem('pos_modulo') ?? 'pos');
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [suplidores, setSuplidores] = useState<Suplidor[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [pendientes, setPendientes] = useState<any[]>([]);
  const [cxc, setCxc] = useState<any[]>([]);
  const [cxcRiesgo, setCxcRiesgo] = useState<any>({ resumen: [], historial: [] });
  const [cxcCuadreDia, setCxcCuadreDia] = useState<any>({ totales: {}, pagos: [] });
  const [ncfTipos, setNcfTipos] = useState<any[]>([]);
  const [ncfEdit, setNcfEdit] = useState<Record<string, any>>({});
  const [tipoComprobante, setTipoComprobante] = useState('consumidor_final');
  const [ncfPreview, setNcfPreview] = useState('');
  const [cajaChecklistModal, setCajaChecklistModal] = useState<any>(null);
  const [inventario, setInventario] = useState<any[]>([]);
  const [compras, setCompras] = useState<any[]>([]);
  const [reportes, setReportes] = useState<Record<string, any[]>>({});
  const [importJobs, setImportJobs] = useState<any[]>([]);
  const [importMeta, setImportMeta] = useState<any>(null);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [jobSeleccionado, setJobSeleccionado] = useState('');
  const [sqlNombre, setSqlNombre] = useState('script.sql');
  const [sqlContenido, setSqlContenido] = useState('');
  const [sqlFile, setSqlFile] = useState<File | null>(null);
  const [subiendoSql, setSubiendoSql] = useState(false);
  const [uploadProgreso, setUploadProgreso] = useState(0);
  const [resultadoImport, setResultadoImport] = useState<any>(null);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any>({});
  const [cuadres, setCuadres] = useState<any[]>([]);
  const [ventasAll, setVentasAll] = useState<any[]>([]);
  const [historialVentas, setHistorialVentas] = useState<any[]>([]);
  const [adminResumen, setAdminResumen] = useState<any>({});
  const [tabContabilidad, setTabContabilidad] = useState<'cuadres'|'ventas'|'compras'>('cuadres');
  const [sucursalInvSeleccionada, setSucursalInvSeleccionada] = useState('');
  const [modalUsuario, setModalUsuario] = useState(false);
  const [editandoUsuario, setEditandoUsuario] = useState<any>(null);
  const [reporteActivo, setReporteActivo] = useState('');
  const [clienteQuery, setClienteQuery] = useState('PORTADOR');
  const [clienteNombreLibre, setClienteNombreLibre] = useState('PORTADOR');
  const [fiscalRnc, setFiscalRnc] = useState('');
  const [fiscalEmpresa, setFiscalEmpresa] = useState('');
  const [rncEstado, setRncEstado] = useState<'idle'|'consultando'|'actualizando'|'encontrado'|'no_encontrado'>('idle');
  const [rncMensaje, setRncMensaje] = useState('');
  const [dgiiPanel, setDgiiPanel] = useState<any>(null);
  const [ordenes, setOrdenes] = useState<any[]>([]);
  const [ordenesReporte, setOrdenesReporte] = useState<any>({ rows: [], promedios: {} });
  const [pickers, setPickers] = useState<any[]>([]);
  const [revClienteId, setRevClienteId] = useState('');
  const [revClienteBuscar, setRevClienteBuscar] = useState('');
  const [revPagoRegistrado, setRevPagoRegistrado] = useState(false);
  const [revCarrito, setRevCarrito] = useState<any[]>([]);
  const [revCarritoAbierto, setRevCarritoAbierto] = useState(false);
  const [revProductoInfoCard, setRevProductoInfoCard] = useState<any>(null);
  const [modalCantidadRevProducto, setModalCantidadRevProducto] = useState<any>(null);
  const [cantidadRevProductoSeleccionada, setCantidadRevProductoSeleccionada] = useState('1');
  const [revPrecioBiz2Activos, setRevPrecioBiz2Activos] = useState<Record<string, boolean>>({});
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<any>(null);
  const [pickerItems, setPickerItems] = useState<any[]>([]);
  const [bundleActual, setBundleActual] = useState<any>(null);
  const [bultoItems, setBultoItems] = useState<any[]>([]);
  const [ordenItemsCache, setOrdenItemsCache] = useState<Record<string, any[]>>({});
  const [bultoQtys, setBultoQtys] = useState<Record<string, string>>({});
  const [qzStatus, setQzStatus] = useState<'desconectado'|'conectando'|'conectado'|'error'>('desconectado');
  const [qzPrinters, setQzPrinters] = useState<string[]>([]);
  const [qzPrinterEtiqueta, setQzPrinterEtiqueta] = useState<string>(() => localStorage.getItem('qz_printer_etiqueta') || '');
  const [qzPrinterFactura, setQzPrinterFactura] = useState<string>(() => localStorage.getItem('qz_printer_factura') || '');
  const [qzPrinterCarta, setQzPrinterCarta] = useState<string>(() => localStorage.getItem('qz_printer_carta') || '');
  const [qzPanel, setQzPanel] = useState(false);
  const [productoInfoCard, setProductoInfoCard] = useState<any>(null);
  const [modalCantidadProducto, setModalCantidadProducto] = useState<any>(null);
  const [cantidadProductoSeleccionado, setCantidadProductoSeleccionado] = useState('1');
  const [editandoProducto, setEditandoProducto] = useState<any>(null);
  const [modalProductoInv, setModalProductoInv] = useState(false);
  const [modalProductosPage, setModalProductosPage] = useState(false);
  const [quickAddCat, setQuickAddCat] = useState(false);
  const [quickAddSup, setQuickAddSup] = useState(false);
  const [nuevaCatInline, setNuevaCatInline] = useState({ codigo: '', nombre: '' });
  const [nuevoSupInline, setNuevoSupInline] = useState({ codigo: '', nombre_comercial: '', telefono: '' });
  const [imagenAddFile, setImagenAddFile] = useState<File | null>(null);
  const [imagenEditFile, setImagenEditFile] = useState<File | null>(null);
  const [imagenAddPreview, setImagenAddPreview] = useState('');
  const [imagenEditPreview, setImagenEditPreview] = useState('');
  const [choferes, setChoferes] = useState<any[]>([]);
  const [choferSeleccionado, setChoferSeleccionado] = useState<Record<string, string>>({});

  const [modalCliente, setModalCliente] = useState(false);
  const [editandoCliente, setEditandoCliente] = useState<any>(null);
  const [posClienteNuevoModal, setPosClienteNuevoModal] = useState(false);
  const [posNuevoClienteNombre, setPosNuevoClienteNombre] = useState('');

  const [clienteId, setClienteId] = useState('');
  const [sucursalId, setSucursalId] = useState('');
  const [vendedorId, setVendedorId] = useState('');
  const [tipoVenta, setTipoVenta] = useState<'contado' | 'credito' | 'devolucion'>('contado');
  const [formaPago, setFormaPago] = useState('efectivo');
  const [buscarProducto, setBuscarProducto] = useState('');
  const [carrito, setCarrito] = useState<any[]>([]);
  const [descuentoGlobal, setDescuentoGlobal] = useState(0);
  const [clientesFidelidad, setClientesFidelidad] = useState<any[]>([]);
  const [modalFidelidad, setModalFidelidad] = useState(false);
  const [buscarClienteFidelidad, setBuscarClienteFidelidad] = useState('');
  const [clienteFidelidadSeleccionado, setClienteFidelidadSeleccionado] = useState<any>(null);
  const [creaClienteFidelidadNuevo, setCreaClienteFidelidadNuevo] = useState(false);
  const [modalDevolucion, setModalDevolucion] = useState(false);
  const [ventaDevolucionBuscar, setVentaDevolucionBuscar] = useState('');
  const [ventaDevolucionSeleccionada, setVentaDevolucionSeleccionada] = useState<any>(null);
  const [itemsDevolucionSeleccionados, setItemsDevolucionSeleccionados] = useState<any[]>([]);
  const [ncCreada, setNcCreada] = useState<any>(null);
  const [notasCredito, setNotasCredito] = useState<any[]>([]);
  const [historialFiltro, setHistorialFiltro] = useState<any>({ modo: 'hoy', fecha: '', mes: '', desde: '', hasta: '', sucursal_id: '', empleado_id: '' });
  const [devolFiltro, setDevolFiltro] = useState<any>({ modo: 'hoy', fecha: '', mes: '', desde: '', hasta: '', sucursal_id: '', empleado_id: '' });
  const [modalConfigReporte, setModalConfigReporte] = useState<'historial-ventas' | 'devoluciones' | ''>('');
  const [modalAplicarNC, setModalAplicarNC] = useState(false);
  const [eventos, setEventos] = useState<any[]>([]);
  const [codigoNC, setCodigoNC] = useState('');
  const [ncEncontrada, setNcEncontrada] = useState<any>(null);
  const [modalNcDiferencia, setModalNcDiferencia] = useState<any>(null);
  const [ventaDetalleModal, setVentaDetalleModal] = useState<any>(null);
  const [formaPagoComplementario, setFormaPagoComplementario] = useState('efectivo');
  const [montoRecibido, setMontoRecibido] = useState('');
  const [cajaCobrarModal, setCajaCobrarModal] = useState<any>(null);
  const [cajaTipoPago, setCajaTipoPago] = useState('efectivo');
  const [cajaMontoRecibido, setCajaMontoRecibido] = useState('');
  const [cajaMixtoEfectivo, setCajaMixtoEfectivo] = useState('');
  const [cajaMixtoOtroTipo, setCajaMixtoOtroTipo] = useState('tarjeta');

  const NUEVOCLUB_BLANK = { codigo: '', nombre: '', cedula_rnc: '', representante: '', direccion: '', correo: '', fecha_nacimiento: '', telefono_1: '', telefono_2: '', limite_credito: 0, limite_tiempo_dias: 30, tipo_cliente: '', estatus_credito: 'cerrado', porcentaje_descuento: 0, tipo_comprobante_fiscal: 'consumidor_final', en_programa_fidelidad: false };
  const [nuevoCliente, setNuevoCliente] = useState<any>(NUEVOCLUB_BLANK);
  const [nuevoProducto, setNuevoProducto] = useState<any>({ codigo: '', tipo: '', nombre: '', descripcion: '', marca: '', medida: '', costo: 0, lleva_itbis: true, margen: 0, precio: 0, precio_negocio_1: 0, precio_negocio_2: 0, itbis_porcentaje: 18, existencia_minima: 0, cantidad_a_ordenar: 0, ubicacion: '', categoria: '', codigo_barras: '', cuenta_contable: '', referencia: '', uso_notas: '', suplidor_principal_id: '', imagen_url: '' });
  const [nuevaCompra, setNuevaCompra] = useState<any>({ suplidor_id: '', sucursal_id: '', numero_factura: '', numero_ncf: '', fecha_factura: '', fecha_vencimiento: '', condicion_compra: 'contado', estado_pago: 'pendiente', observaciones: '', items: [] as any[] });
  const [itemCompra, setItemCompra] = useState<any>({ producto_id: '', cantidad: 1, costo_unitario: 0, itbis_tasa: 0.18, descuento_monto: 0 });
  const [modalCompra, setModalCompra] = useState(false);
  const [editandoSuplidor, setEditandoSuplidor] = useState<any>(null);
  const [cxcCobroModal, setCxcCobroModal] = useState<any>(null);
  const [cxcCobroMonto, setCxcCobroMonto] = useState('');
  const [cxcBuscarCliente, setCxcBuscarCliente] = useState('');
  const [nuevoUsuario, setNuevoUsuario] = useState<any>({ username: '', nombre_completo: '', password: '1234', rol: 'vendedor', sucursal_id: '' });
  const [nuevoSuplidor, setNuevoSuplidor] = useState<any>({ codigo: '', nombre_comercial: '', razon_social: '', rnc_cedula: '', telefono: '', correo: '', direccion: '', contacto: '', observaciones: '' });
  const [nuevaCategoria, setNuevaCategoria] = useState<any>({ codigo: '', nombre: '', descripcion: '' });
  const [nuevaSucursal, setNuevaSucursal] = useState<any>({ codigo: '', nombre: '', direccion: '', telefono: '' });

  const toast = (tipo: 'ok' | 'error', texto: string) => { const id = Date.now(); setToasts((t) => [...t, { id, tipo, texto }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000); };

  async function fileToDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function autoCodigoCliente(existentes: any[]): string {
    const nums = existentes
      .map((c) => { const m = String(c.codigo || '').match(/^CLI-(\d+)$/); return m ? parseInt(m[1], 10) : 0; })
      .filter((n) => n > 0);
    const max = nums.length > 0 ? Math.max(...nums) : 0;
    return `CLI-${String(max + 1).padStart(4, '0')}`;
  }

  async function cargarTodo() {
    if (!token || !usuario) return;
    const [cs, ps, sucs, cats, sups, vnds, invCon] = await Promise.all([
      api<any[]>('/clientes', token).catch(() => []),
      api<any[]>('/productos', token).catch(() => []),
      api<any[]>('/maestros/sucursales', token).catch(() => []),
      api<any[]>('/maestros/categorias', token).catch(() => []),
      api<any[]>('/maestros/suplidores', token).catch(() => []),
      api<any[]>('/usuarios/vendedores', token).catch(() => []),
      api<any[]>('/maestros/inventario/consolidado', token).catch(() => []),
    ]);
    setClientes(cs); setProductos(ps); setSucursales(sucs); setCategorias(cats); setSuplidores(sups); setVendedores(vnds); setInventario(invCon);
    if (!sucursalId && sucs[0]) setSucursalId(sucs[0].id);
    const [pen, cx, kp, historial, adminRes, cf, ncs, riesgoCxC, cuadreDia] = await Promise.all([
      api<any[]>('/ventas/pendientes', token).catch(() => []),
      api<any[]>('/cxc/pendientes', token).catch(() => []),
      api<any>('/dashboard/kpis', token).catch(() => ({})),
      api<any[]>('/ventas/historial', token).catch(() => []),
      api<any>('/dashboard/admin-resumen', token).catch(() => ({})),
      api<any[]>('/clientes/fidelidad/lista', token).catch(() => []),
      api<any[]>('/notas-credito', token).catch(() => []),
      api<any>('/cxc/riesgo-resumen', token).catch(() => ({ resumen: [], historial: [] })),
      api<any>('/cxc/cuadre-dia', token).catch(() => ({ totales: {}, pagos: [] })),
    ]);
    setPendientes(pen); setCxc(cx); setKpis(kp); setHistorialVentas(historial); setAdminResumen(adminRes); setClientesFidelidad(cf); setNotasCredito(ncs); setCxcRiesgo(riesgoCxC); setCxcCuadreDia(cuadreDia);
    const [ords, pks, ordRep, chofRes] = await Promise.all([
      api<any[]>('/orders', token).catch(() => []),
      (usuario.rol === 'cajero' || usuario.rol === 'administrador') ? api<any[]>('/usuarios/pickers', token).catch(() => []) : Promise.resolve([]),
      usuario.rol === 'administrador' ? api<any>('/orders/report', token).catch(() => ({ rows: [], promedios: {} })) : Promise.resolve({ rows: [], promedios: {} }),
      (usuario.rol === 'cajero' || usuario.rol === 'administrador') ? api<any>('/orders/choferes', token).catch(() => ({ choferes: [] })) : Promise.resolve({ choferes: [] }),
    ]);
    setOrdenes(ords);
    setPickers(pks);
    setOrdenesReporte(ordRep);
    setChoferes(chofRes.choferes ?? []);
    if (usuario.rol === 'administrador') {
      const [cm, us, rs, ij, im, cua, va, evs] = await Promise.all([api<any[]>('/compras', token).catch(() => []), api<any[]>('/usuarios', token).catch(() => []), api<any[]>('/usuarios/roles', token).catch(() => []), api<any[]>('/importador/jobs', token).catch(() => []), api<any>('/importador/meta', token).catch(() => null), api<any[]>('/cuadres', token).catch(() => []), api<any[]>('/ventas', token).catch(() => []), api<any[]>('/eventos', token).catch(() => [])]);
      setCompras(cm); setUsuarios(us); setRoles(rs); setImportJobs(ij); setImportMeta(im); setCuadres(cua); setVentasAll(va); setEventos(evs);
      const keys = ['clientes', 'suplidores', 'productos', 'inventario-sucursal', 'compras-por-suplidor', 'compras-por-sucursal', 'ventas-por-sucursal', 'eficiencia-vendedores', 'cxc', 'existencia-minima', 'base-606'];
      const out: Record<string, any[]> = {};
      await Promise.all(keys.map(async (k) => { out[k] = await api<any[]>(`/reportes/${k}`, token).catch(() => []); }));
      setReportes(out);
    }
  }

  useEffect(() => { cargarTodo().catch((e) => toast('error', e.message)); }, [token, usuario?.rol]);

  // Auto-conexión silenciosa a QZ Tray al iniciar sesión
  useEffect(() => {
    if (!token) return;
    setQzStatus('conectando');
    qzConnect()
      .then(() => qzGetPrinters())
      .then((printers) => {
        setQzPrinters(printers);
        setQzStatus('conectado');
      })
      .catch(() => setQzStatus('desconectado'));
  }, [token]);
  useEffect(() => {
    if (!token) return;
    const ws = new WebSocket(WS_URL);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (usuario?.rol === 'administrador' && msg?.evento) {
          toast('ok', `🔔 ${String(msg.evento)} · ${new Date(msg?.fecha || Date.now()).toLocaleString()}`);
        }
      } catch { }
      cargarTodo();
    };
    return () => ws.close();
  }, [token, usuario?.rol]);

  const tieneCapacidad = (codigo: string) => Boolean(usuario?.capacidades?.includes(codigo));

  const productosRevendedor = useMemo(() => {
    const q = buscarProducto.toLowerCase().trim();
    if (!q) return productos.slice(0, 120);
    return productos.filter((p) => `${p.codigo} ${p.nombre} ${p.marca ?? ''}`.toLowerCase().includes(q)).slice(0, 120);
  }, [buscarProducto, productos]);

  const clientesRev = useMemo(() => {
    const q = revClienteBuscar.toLowerCase().trim();
    if (!q) return clientes.slice(0, 50);
    return clientes.filter((c) => `${c.codigo} ${c.nombre} ${c.telefono_1 ?? ''}`.toLowerCase().includes(q)).slice(0, 50);
  }, [revClienteBuscar, clientes]);

  const hoyISO = new Date().toISOString().slice(0, 10);

  function dentroPeriodo(fechaIso: string | undefined, f: any) {
    if (!fechaIso) return false;
    const d = String(fechaIso).slice(0, 10);
    if (f.modo === 'hoy') return d === hoyISO;
    if (f.modo === 'dia') return !f.fecha || d === f.fecha;
    if (f.modo === 'mes') return !f.mes || d.startsWith(f.mes);
    if (f.modo === 'rango') {
      if (f.desde && d < f.desde) return false;
      if (f.hasta && d > f.hasta) return false;
      return true;
    }
    return true;
  }

  function precioRevNegocio1(p: any) {
    return Number(p.precio_negocio_1 ?? p.precio_negocio1 ?? p.precio_business_1 ?? p.precio1 ?? p.precio ?? 0);
  }

  function precioRevNegocio2(p: any) {
    return Number(p.precio_negocio_2 ?? p.precio_negocio2 ?? p.precio_business_2 ?? p.precio2 ?? p.precio ?? 0);
  }

  function usaPrecioNegocio2(productoId: string) {
    return Boolean(revPrecioBiz2Activos[productoId]);
  }

  function precioRevActual(p: any) {
    return usaPrecioNegocio2(String(p.id)) ? precioRevNegocio2(p) : precioRevNegocio1(p);
  }

  function togglePrecioRevendedor(productoId: string) {
    setRevPrecioBiz2Activos((prev) => ({ ...prev, [productoId]: !prev[productoId] }));
  }

  function abrirModalCantidadRevendedor(p: any) {
    setRevProductoInfoCard(p);
    setModalCantidadRevProducto(p);
    setCantidadRevProductoSeleccionada('1');
  }

  function confirmarAgregarCantidadRevendedor() {
    if (!modalCantidadRevProducto) return;
    const qty = Math.max(1, Number(cantidadRevProductoSeleccionada || 1));
    const precio = precioRevActual(modalCantidadRevProducto);
    setRevCarrito((prev) => {
      const ex = prev.find((x: any) => x.producto_id === modalCantidadRevProducto.id);
      if (ex) return prev.map((x: any) => x.producto_id === modalCantidadRevProducto.id ? { ...x, cantidad: x.cantidad + qty, precio_unitario: precio } : x);
      return [...prev, { producto_id: modalCantidadRevProducto.id, descripcion: modalCantidadRevProducto.nombre, cantidad: qty, precio_unitario: precio, imagen_url: modalCantidadRevProducto.imagen_url }];
    });
    setModalCantidadRevProducto(null);
    setCantidadRevProductoSeleccionada('1');
  }

  async function crearOrdenRevendedor() {
    if (!revClienteId) return toast('error', 'Selecciona un cliente');
    if (!revCarrito.length) return toast('error', 'Agrega productos al pedido');
    await api('/orders', token, {
      method: 'POST',
      body: JSON.stringify({
        cliente_id: revClienteId,
        pago_registrado: revPagoRegistrado,
        items: revCarrito.map((i: any) => ({ producto_id: i.producto_id, cantidad: i.cantidad, precio_unitario: i.precio_unitario })),
      }),
    });
    toast('ok', 'Pedido creado y enviado a Órdenes');
    setRevCarrito([]);
    setRevPagoRegistrado(false);
    await cargarTodo();
  }

  async function cargarPickerView(orderId: string) {
    const items = await api<any[]>(`/orders/${orderId}/picker-view`, token).catch(() => []);
    setPickerItems(items);
  }

  async function cargarBultoItems(orderId: string, bundleId: string) {
    const items = await api<any[]>(`/orders/${orderId}/bundles/${bundleId}/items`, token).catch(() => []);
    setBultoItems(items);
  }

  async function cargarOrdenItemsPendientes(orderId: string) {
    const items = await api<any[]>(`/orders/${orderId}/items-pendientes`, token).catch(() => []);
    setOrdenItemsCache((prev) => ({ ...prev, [orderId]: items }));
    const qtys: Record<string, string> = {};
    items.forEach((it: any) => {
      const pendiente = Math.max(0, Number(it.cantidad_total) - Number(it.en_bultos_cerrados) - Number(it.en_bulto_abierto));
      qtys[it.id] = String(pendiente);
    });
    setBultoQtys((prev) => ({ ...prev, ...qtys }));
  }

  async function agregarItemABulto(orderId: string, orderItemId: string, cantidad: number) {
    if (!bundleActual) return;
    const r = await api<any>(`/orders/${orderId}/bundles/${bundleActual.id}/add-item`, token, {
      method: 'POST',
      body: JSON.stringify({ order_item_id: orderItemId, cantidad }),
    });
    setBultoItems(r.items || []);
    await cargarOrdenItemsPendientes(orderId);
  }

  async function quitarItemDeBulto(orderId: string, orderItemId: string) {
    if (!bundleActual) return;
    await api(`/orders/${orderId}/bundles/${bundleActual.id}/remove-item`, token, {
      method: 'POST',
      body: JSON.stringify({ order_item_id: orderItemId }),
    });
    setBultoItems((prev) => prev.filter((bi: any) => bi.order_item_id !== orderItemId));
    await cargarOrdenItemsPendientes(orderId);
  }

  useEffect(() => {
    if (buscarClienteFidelidad.length > 2 && !clienteFidelidadSeleccionado && !creaClienteFidelidadNuevo && modalFidelidad) {
      setCreaClienteFidelidadNuevo(true);
      setClienteFidelidadSeleccionado({
        codigo: autoCodigoCliente(clientes),
        nombre: buscarClienteFidelidad,
        cedula_rnc: '',
        representante: '',
        direccion: '',
        correo: '',
        fecha_nacimiento: '',
        telefono_1: '',
        telefono_2: '',
        limite_credito: 0,
        limite_tiempo_dias: 30,
        tipo_cliente: '',
        estatus_credito: 'cerrado',
        porcentaje_descuento: 0,
        tipo_comprobante_fiscal: 'consumidor_final',
        en_programa_fidelidad: true
      });
    }
  }, [buscarClienteFidelidad, clienteFidelidadSeleccionado, creaClienteFidelidadNuevo, modalFidelidad, clientes]);


  useEffect(() => {
    const portador = clientes.find((c) => String(c.nombre || '').toUpperCase() === 'PORTADOR' || String(c.codigo || '').toUpperCase() === 'CLI-0002');
    if (!clienteId && portador) setClienteId(portador.id);
    if (!clienteQuery) setClienteQuery('PORTADOR');
    if (!clienteNombreLibre) setClienteNombreLibre('PORTADOR');
  }, [clientes, clienteId, clienteQuery, clienteNombreLibre]);

  useEffect(() => {
    if (!token) return;
    api<any[]>(`/ncf/types`, token).then(setNcfTipos).catch(() => setNcfTipos([]));
  }, [token]);


  useEffect(() => {
    const map: Record<string, any> = {};
    for (const t of ncfTipos) {
      map[t.id] = {
        nombre: t.nombre,
        prefijo_fiscal: t.prefijo_fiscal,
        secuencia_inicial: Number(t.secuencia_inicial ?? 1),
        secuencia_actual: Number(t.secuencia_actual ?? 1),
        secuencia_final: Number(t.secuencia_final ?? 99999999),
        activo: Number(t.activo ?? 1),
        observaciones: t.observaciones ?? '',
      };
    }
    setNcfEdit(map);
  }, [ncfTipos]);

  useEffect(() => {
    if (!token || !tipoComprobante) return;
    api<any>(`/ventas/preview-ncf/${tipoComprobante}`, token).then((r) => setNcfPreview(r.ncf || '')).catch(() => setNcfPreview(''));
  }, [token, tipoComprobante]);


  useEffect(() => {
    if (!token || tipoComprobante === 'consumidor_final') return;
    const rnc = fiscalRnc.replace(/\D/g, '');
    if (!rnc.length) { setRncEstado('idle'); setRncMensaje(''); setFiscalEmpresa(''); return; }

    setRncEstado('consultando');
    setRncMensaje(rnc.length < 9 ? `Buscando RNC... (${rnc.length}/9)` : 'Buscando RNC en catálogo DGII...');

    if (rnc.length < 9) return;

    const t = setTimeout(async () => {
      const loadingHint = setTimeout(() => {
        setRncEstado('actualizando');
        setRncMensaje('Actualizando catálogo DGII para validar este RNC...');
      }, 900);
      try {
        const r = await api<any>(`/dgii/rnc/${rnc}`, token);
        clearTimeout(loadingHint);
        if (r.found) {
          const nombre = r.data.razonSocial || r.data.nombreComercial || '';
          setFiscalEmpresa(nombre);
          setRncEstado('encontrado');
          setRncMensaje(`Empresa: ${nombre || '-'} · RNC: ${r.data.rnc || rnc}`);
        } else {
          setFiscalEmpresa('');
          setRncEstado('no_encontrado');
          setRncMensaje(r.message || 'El RNC ingresado es incorrecto o no existe en el catálogo actual.');
        }
      } catch {
        clearTimeout(loadingHint);
        setFiscalEmpresa('');
        setRncEstado('no_encontrado');
        setRncMensaje('No se pudo validar el RNC en este momento.');
      }
    }, 450);
    return () => clearTimeout(t);
  }, [token, tipoComprobante, fiscalRnc]);

  useEffect(() => {
    if (tipoVenta === 'devolucion' && !modalDevolucion) {
      setModalDevolucion(true);
    }
  }, [tipoVenta, modalDevolucion]);

  useEffect(() => {
    if (!token || modulo !== 'reportes') return;
    const t = setInterval(() => { cargarTodo(); }, 15000);
    return () => clearInterval(t);
  }, [token, modulo]);

  useEffect(() => {
    const onPop = () => {
      if (!usuario) return;
      const mod = moduloDesdeRuta(window.location.pathname);
      if (mod && usuario.rol === 'administrador') setModulo(mod);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [usuario]);

  const productosFiltrados = useMemo(() => {
    const q = buscarProducto.toLowerCase().trim();
    if (!q) return productos;
    return productos.filter((p) => `${p.codigo} ${p.nombre} ${p.descripcion ?? ''} ${p.codigo_barras ?? ''}`.toLowerCase().includes(q));
  }, [buscarProducto, productos]);

  const clientesFiltradosPOS = useMemo(() => {
    const q = clienteQuery.toLowerCase().trim();
    if (!q) return clientes;
    return clientes.filter((c) =>
      c.nombre?.toLowerCase().includes(q) ||
      c.telefono_1?.toLowerCase().includes(q) ||
      c.telefono_2?.toLowerCase().includes(q) ||
      c.codigo?.toLowerCase().includes(q)
    );
  }, [clienteQuery, clientes]);

  const clienteSel = clientes.find((c) => c.id === clienteId);
  const subtotal = carrito.reduce((a, i) => a + Number(i.cantidad) * Number(i.precio_unitario), 0);
  const descuentoItems = carrito.reduce((a, i) => a + Number(i.descuento_monto ?? 0), 0);
  const descuentoGlobalMonto = descuentoGlobal > 0 ? (subtotal - descuentoItems) * (descuentoGlobal / 100) : 0;
  const descuentoTotal = descuentoItems + descuentoGlobalMonto;
  const total = subtotal - descuentoTotal;
  const itbisTotal = carrito.reduce((a, i) => { const base = Number(i.cantidad) * Number(i.precio_unitario) - Number(i.descuento_monto ?? 0); const tasa = Number(i.itbis_tasa ?? 0.18); return a + (base - base / (1 + tasa)); }, 0);

  function aplicarDescuentoGlobal(pct: number) {
    setDescuentoGlobal((prev) => prev === pct ? 0 : pct);
  }

  function agregarProducto(p: any) {
    setProductoInfoCard(p);
    setCarrito((prev) => {
      const x = prev.find((i) => i.producto_id === p.id);
      if (x) return prev.map((i) => i.producto_id === p.id ? { ...i, cantidad: i.cantidad + 1 } : i);
      return [...prev, { producto_id: p.id, codigo_producto: p.codigo, descripcion: p.nombre, medida: p.medida, cantidad: 1, precio_unitario: Number(p.precio), itbis_tasa: Number(p.itbis_tasa ?? 0), descuento_monto: 0, imagen_url: p.imagen_url }];
    });
  }

  function abrirModalCantidadProducto(p: any) {
    setProductoInfoCard(p);
    setModalCantidadProducto(p);
    setCantidadProductoSeleccionado('1');
  }

  function confirmarAgregarCantidadProducto() {
    if (!modalCantidadProducto) return;
    const qty = Math.max(1, Number(cantidadProductoSeleccionado || 1));
    setCarrito((prev) => {
      const x = prev.find((i) => i.producto_id === modalCantidadProducto.id);
      if (x) return prev.map((i) => i.producto_id === modalCantidadProducto.id ? { ...i, cantidad: i.cantidad + qty } : i);
      return [...prev, { producto_id: modalCantidadProducto.id, codigo_producto: modalCantidadProducto.codigo, descripcion: modalCantidadProducto.nombre, medida: modalCantidadProducto.medida, cantidad: qty, precio_unitario: Number(modalCantidadProducto.precio), itbis_tasa: Number(modalCantidadProducto.itbis_tasa ?? 0), descuento_monto: 0, imagen_url: modalCantidadProducto.imagen_url }];
    });
    setModalCantidadProducto(null);
    setCantidadProductoSeleccionado('1');
  }

  async function crearCliente() {
    const codigo = nuevoCliente.codigo || autoCodigoCliente(clientes);
    await api('/clientes', token, { method: 'POST', body: JSON.stringify({ ...nuevoCliente, codigo, estatus_credito: nuevoCliente.estatus_credito || 'cerrado' }) });
    toast('ok', 'Cliente creado');
    setNuevoCliente(NUEVOCLUB_BLANK);
    setModalCliente(false);
    await cargarTodo();
  }

  async function crearClienteRapido(nombre: string, telefono: string) {
    const codigo = autoCodigoCliente(clientes);
    const res = await api<any>('/clientes', token, { method: 'POST', body: JSON.stringify({ codigo, nombre, telefono_1: telefono, estatus_credito: 'cerrado', tipo_comprobante_fiscal: 'consumidor_final', limite_credito: 0 }) });
    toast('ok', `Cliente "${nombre}" registrado (${codigo})`);
    await cargarTodo();
    return res;
  }

  async function editarCliente() {
    if (!editandoCliente) return;
    await api(`/clientes/${editandoCliente.id}`, token, { method: 'PUT', body: JSON.stringify(editandoCliente) });
    toast('ok', 'Cliente actualizado');
    setEditandoCliente(null);
    await cargarTodo();
  }

  async function toggleCreditoCliente(c: any) {
    const nuevo = c.estatus_credito === 'abierto' ? 'cerrado' : 'abierto';
    let payload: any = { ...c, estatus_credito: nuevo };
    if (c.estatus_credito === 'abierto' && nuevo === 'cerrado' && usuario?.rol === 'administrador') {
      const noPaga = window.confirm('¿Motivo de cierre de crédito: "Este cliente NO paga"?\nAceptar = No paga | Cancelar = No hay ninguna');
      if (noPaga) {
        const detalle = window.prompt('Describe la causa del cierre de crédito (obligatorio):', '') || '';
        if (!detalle.trim()) {
          toast('error', 'Debes escribir una descripción cuando el motivo es "no paga"');
          return;
        }
        payload = { ...payload, cierre_credito_motivo: 'no_paga', cierre_credito_detalle: detalle.trim() };
      } else {
        payload = { ...payload, cierre_credito_motivo: 'sin_causa', cierre_credito_detalle: '' };
      }
    }
    await api(`/clientes/${c.id}`, token, { method: 'PUT', body: JSON.stringify(payload) });
    toast('ok', `Crédito ${nuevo} para ${c.nombre}`);
    await cargarTodo();
  }

  async function crearProducto() {
    let imgUrl = '';
    if (imagenAddFile) { imgUrl = await subirImagenProducto(imagenAddFile); setImagenAddFile(null); setImagenAddPreview(''); }
    await api('/productos', token, { method: 'POST', body: JSON.stringify({ ...nuevoProducto, imagen_url: imgUrl, itbis_tasa: Number(nuevoProducto.itbis_porcentaje || 0) / 100 }) });
    toast('ok', 'Producto creado');
    await cargarTodo();
  }

  async function crearCompra() { await api('/compras', token, { method: 'POST', body: JSON.stringify(nuevaCompra) }); toast('ok', 'Compra registrada'); setNuevaCompra({ suplidor_id: '', sucursal_id: sucursalId, numero_factura: '', numero_ncf: '', fecha_factura: '', fecha_vencimiento: '', condicion_compra: 'contado', estado_pago: 'pendiente', observaciones: '', items: [] }); await cargarTodo(); }
  async function crearUsuario() { await api('/usuarios', token, { method: 'POST', body: JSON.stringify(nuevoUsuario) }); toast('ok', 'Usuario creado'); await cargarTodo(); }

  async function guardarRangoNcf(ncfTypeId: string) {
    const data = ncfEdit[ncfTypeId];
    if (!data) return;
    const desde = Number(data.secuencia_inicial);
    const hasta = Number(data.secuencia_final);
    const actual = Number(data.secuencia_actual ?? data.secuencia_inicial);
    if (desde <= 0 || hasta < desde) {
      toast('error', 'Rango NCF inválido: verifica Desde/Hasta');
      return;
    }
    const payload = { ...data, secuencia_actual: Math.max(desde, actual) };
    await api(`/ncf/types/${ncfTypeId}`, token, { method: 'PUT', body: JSON.stringify(payload) });
    toast('ok', 'Rango NCF actualizado');
    const tipos = await api<any[]>('/ncf/types', token);
    setNcfTipos(tipos);
  }

  async function actualizarUsuario() {
    if (!editandoUsuario) return;
    await api(`/usuarios/${editandoUsuario.id}`, token, { method: 'PUT', body: JSON.stringify(editandoUsuario) });
    toast('ok', 'Usuario actualizado');
    setEditandoUsuario(null);
    await cargarTodo();
  }
  async function crearSucursal() { await api('/maestros/sucursales', token, { method: 'POST', body: JSON.stringify(nuevaSucursal) }); toast('ok', 'Sucursal creada'); await cargarTodo(); }
  async function crearCategoria() { await api('/maestros/categorias', token, { method: 'POST', body: JSON.stringify(nuevaCategoria) }); toast('ok', 'Categoría creada'); await cargarTodo(); }
  async function crearSuplidor() { await api('/maestros/suplidores', token, { method: 'POST', body: JSON.stringify(nuevoSuplidor) }); toast('ok', 'Suplidor creado'); await cargarTodo(); }
  async function editarSuplidor() {
    if (!editandoSuplidor) return;
    await api(`/maestros/suplidores/${editandoSuplidor.id}`, token, { method: 'PUT', body: JSON.stringify(editandoSuplidor) });
    toast('ok', 'Suplidor actualizado');
    setEditandoSuplidor(null);
    await cargarTodo();
  }
  async function eliminarSuplidor(id: string) {
    if (!confirm('¿Inactivar este suplidor?')) return;
    await api(`/maestros/suplidores/${id}`, token, { method: 'DELETE' });
    toast('ok', 'Suplidor eliminado');
    await cargarTodo();
  }

  async function crearCategoriaInline() {
    if (!nuevaCatInline.nombre) return;
    const r: any = await api('/maestros/categorias', token, { method: 'POST', body: JSON.stringify({ ...nuevaCatInline, estado: 'activa' }) });
    toast('ok', 'Categoría creada');
    setNuevaCatInline({ codigo: '', nombre: '' });
    setQuickAddCat(false);
    await cargarTodo();
    return r?.id;
  }

  async function crearSuplidorInline() {
    if (!nuevoSupInline.nombre_comercial) return;
    const r: any = await api('/maestros/suplidores', token, { method: 'POST', body: JSON.stringify({ ...nuevoSupInline, estado: 'activo' }) });
    toast('ok', 'Suplidor creado');
    setNuevoSupInline({ codigo: '', nombre_comercial: '', telefono: '' });
    setQuickAddSup(false);
    await cargarTodo();
    return r?.id;
  }

  async function subirImagenProducto(file: File): Promise<string> {
    const fd = new FormData();
    fd.append('imagen', file);
    const res = await fetch(`${API}/uploads/producto-imagen`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    if (!res.ok) throw new Error('Error al subir imagen');
    const data = await res.json();
    return data.url as string;
  }

  async function editarProductoGuardar() {
    if (!editandoProducto) return;
    let imgUrl = editandoProducto.imagen_url ?? '';
    if (imagenEditFile) {
      imgUrl = await subirImagenProducto(imagenEditFile);
      setImagenEditFile(null);
      setImagenEditPreview('');
    }
    await api(`/productos/${editandoProducto.id}`, token, { method: 'PUT', body: JSON.stringify({ ...editandoProducto, imagen_url: imgUrl, itbis_tasa: Number(editandoProducto.itbis_porcentaje || 0) / 100 }) });
    toast('ok', 'Producto actualizado');
    setEditandoProducto(null);
    await cargarTodo();
  }

  async function eliminarProducto(id: string) {
    if (!confirm('¿Desea inactivar este producto?')) return;
    await api(`/productos/${id}`, token, { method: 'DELETE' });
    toast('ok', 'Producto inactivado');
    await cargarTodo();
  }

  async function subirPorChunksYAnalizar(file: File) {
    const chunkSize = 5 * 1024 * 1024;
    const maxReintentos = 3;
    setSubiendoSql(true);
    setUploadProgreso(0);
    try {
      const init = await api<any>('/importador/upload/init', token, { method: 'POST', body: JSON.stringify({ nombre_archivo: file.name, size_bytes: file.size }) });
      const uploadId = init.upload_id as string;
      const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(file.size, start + chunkSize);
        const chunk = file.slice(start, end);
        const buf = await chunk.arrayBuffer();
        const bin = new Uint8Array(buf);
        let raw = '';
        for (let j = 0; j < bin.length; j++) raw += String.fromCharCode(bin[j]);
        const chunkBase64 = btoa(raw);
        let ultimoError: any = null;
        for (let intento = 0; intento < maxReintentos; intento++) {
          try {
            await api(`/importador/upload/${uploadId}/chunk`, token, { method: 'POST', body: JSON.stringify({ chunk_base64: chunkBase64, final: i === totalChunks - 1 }) });
            ultimoError = null;
            break;
          } catch (err: any) {
            ultimoError = err;
            await new Promise((r) => setTimeout(r, 250 * (intento + 1)));
          }
        }
        if (ultimoError) throw ultimoError;
        setUploadProgreso(Math.round(((i + 1) / totalChunks) * 100));
      }
      return api<any>(`/importador/upload/${uploadId}/analizar`, token, { method: 'POST' });
    } finally {
      setSubiendoSql(false);
    }
  }

  async function analizarSqlLegado() {
    let r: any;
    if (sqlFile) {
      r = await subirPorChunksYAnalizar(sqlFile);
    } else {
      r = await api<any>('/importador/analizar', token, { method: 'POST', body: JSON.stringify({ nombre_archivo: sqlNombre, contenido_sql: sqlContenido }) });
    }
    toast('ok', 'SQL legado analizado');
    setJobSeleccionado(r.job_id);
    await cargarTodo();
    await verPreviewJob(r.job_id);
  }

  async function verPreviewJob(jobId: string) {
    const p = await api<any>(`/importador/jobs/${jobId}/preview`, token);
    setImportPreview(p);
  }

  async function ejecutarImport(jobId: string, dryRun: boolean, modulos = ['all']) {
    const r = await api<any>(`/importador/jobs/${jobId}/importar`, token, { method: 'POST', body: JSON.stringify({ dry_run: dryRun, modulos, estrategia_relaciones: 'placeholder' }) });
    setResultadoImport(r);
    toast('ok', dryRun ? 'Dry run completado' : 'Importación completada');
    await cargarTodo();
    await verPreviewJob(jobId);
  }

  async function confirmarJob(jobId: string) {
    await api(`/importador/jobs/${jobId}/confirmar`, token, { method: 'POST' });
    toast('ok', 'Importación confirmada');
    await cargarTodo();
  }

  async function deshacerJob(jobId: string) {
    await api(`/importador/jobs/${jobId}/undo`, token, { method: 'POST' });
    toast('ok', 'Última importación deshecha');
    await cargarTodo();
    await verPreviewJob(jobId);
  }

  async function descargarLog(jobId: string) {
    const res = await fetch(`${API}/importador/jobs/${jobId}/logs`, { headers: { Authorization: `Bearer ${token}` } });
    const txt = await res.text();
    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `import-log-${jobId}.txt`; a.click();
    URL.revokeObjectURL(url);
  }

  function imprimirNC(nc: any) {
    const win = window.open('', '_blank', 'width=400,height=600');
    if (!win) return;
    const fecha = new Date(nc.fecha_creacion).toLocaleDateString('es-DO');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Nota de Crédito ${nc.numero}</title>
    <style>body{font-family:monospace;font-size:13px;margin:20px;}h2{text-align:center;}table{width:100%;border-collapse:collapse;}td{padding:4px;}hr{border:1px dashed #000;}.right{text-align:right;}.center{text-align:center;}.big{font-size:18px;font-weight:bold;}</style>
    </head><body>
    <h2>REPUESTOS CALCAÑO</h2>
    <div class="center"><span class="big">NOTA DE CRÉDITO</span></div>
    <hr/>
    <div><strong>No:</strong> ${nc.numero}</div>
    <div><strong>Cliente:</strong> ${nc.cliente_nombre || ''}</div>
    <div><strong>Fecha:</strong> ${fecha}</div>
    <div><strong>Estado:</strong> ${nc.estado?.toUpperCase()}</div>
    <hr/>
    <table>
      <tr><td>Monto original:</td><td class="right">RD$ ${Number(nc.monto_original).toFixed(2)}</td></tr>
      <tr><td><strong>Saldo disponible:</strong></td><td class="right"><strong>RD$ ${Number(nc.monto_restante).toFixed(2)}</strong></td></tr>
    </table>
    <hr/>
    <div class="center">Este documento es válido como crédito en compras futuras.<br/>Presente el código: <strong>${nc.numero}</strong></div>
    </body></html>`);
    win.document.close();
    win.print();
  }



  async function esperarRecursosImpresion(win: Window) {
    const imgs = Array.from(win.document.images ?? []);
    await Promise.all(imgs.map((img) => new Promise<void>((resolve) => {
      if (img.complete) return resolve();
      img.onload = () => resolve();
      img.onerror = () => resolve();
    })));
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  async function imprimirFacturaVenta(ventaId: string, metodoPago: string, pagoCliente: number, devuelta: number, preopened?: Window | null) {
    const data = await api<any>(`/ventas/${ventaId}`, token);
    const venta = data.venta;
    const detalle = data.detalle ?? [];
    const clienteNombre = venta?.cliente_nombre || clienteNombreLibre || 'PORTADOR';
    const clienteRnc = venta?.cliente_documento || venta?.cliente_cedula_rnc || '';
    const fechaImp = new Date();
    const fechaVal = new Date(fechaImp);
    fechaVal.setFullYear(fechaVal.getFullYear() + 1);

    const puntosCliente = (clientesFidelidad.find((f: any) => f.id === venta?.cliente_id)?.puntos_disponibles ?? 0);
    const subtotal = Number(venta?.subtotal ?? 0);
    const descuento = Number(venta?.descuento_total ?? 0);
    const itbis = Number(venta?.itbis_total ?? 0);
    const total = Number(venta?.total ?? 0);

    // SVG inline para evitar descarga de red en QZ Tray
    const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="110" viewBox="0 0 1200 600">
      <ellipse cx="600" cy="300" rx="580" ry="270" fill="#0a1f7a" stroke="#cc0000" stroke-width="28"/>
      <circle cx="600" cy="120" r="75" fill="#ffffff"/>
      <text x="600" y="148" text-anchor="middle" font-size="82" font-family="Arial" font-weight="900" fill="#cc0000">RC</text>
      <text x="600" y="305" text-anchor="middle" font-size="122" font-family="Georgia" font-weight="900" fill="#ffffff">REPUESTOS</text>
      <text x="600" y="425" text-anchor="middle" font-size="135" font-family="Arial" font-weight="900" fill="#ffffff">CALCAÑO</text>
    </svg>`;

    const htmlFactura = `<!DOCTYPE html><html><head><meta charset="UTF-8" /><title>Factura ${venta?.numero_interno || ''}</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        * { font-family: Arial, sans-serif; font-weight: 900; color: #000; box-sizing: border-box; }
        html, body { width: 72mm; margin: 0; padding: 0; }
        body { padding: 2mm; font-size: 12px; }
        .center { text-align: center; }
        .line { border-top: 2px solid #000; margin: 5px 0; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        td { padding: 3px 1px; text-align: left; font-weight: 900; }
        .right { text-align: right; }
        .tot td { border-top: 1px solid #000; padding: 3px 1px; font-weight: 900; }
        .tot .total-row td { font-size: 16px; border-top: 3px solid #000; padding-top: 5px; font-weight: 900; }
      </style>
    </head><body>
      <div class="center">${logoSvg}</div>
      <div class="center" style="font-size:12px; font-weight:900; margin-top:3px;">IMPORTADORA REPUESTOS CALCAÑO</div>
      <div class="line"></div>
      <div style="font-size:12px; font-weight:900;">FACTURA#: ${venta?.numero_interno || ''} | ${metodoPago.toUpperCase()}</div>
      <div style="font-size:12px; font-weight:900;">NCF: ${venta?.ncf || '-'}</div>
      <div style="font-size:12px; font-weight:900;">TRANSACCIÓN: ${String(venta?.tipo_comprobante || 'consumidor_final').replaceAll('_',' ').toUpperCase()}</div>
      <div style="font-size:12px; font-weight:900;">FECHA: ${fechaImp.toLocaleDateString('es-DO')} ${fechaImp.toLocaleTimeString('es-DO')}</div>
      <div style="font-size:12px; font-weight:900;">VÁLIDA HASTA: ${fechaVal.toLocaleDateString('es-DO')}</div>
      <div class="line"></div>
      <div style="font-size:12px; font-weight:900;">CLIENTE: ${clienteNombre}</div>
      <div style="font-size:12px; font-weight:900;">RNC: ${clienteRnc || '-'}</div>
      <div class="line"></div>
      <table>
        <thead><tr><td style="font-size:12px;font-weight:900;">DESCRIPCIÓN</td><td class="right" style="font-size:12px;font-weight:900;white-space:nowrap;">CANT×P.UNIT</td><td class="right" style="font-size:12px;font-weight:900;">TOTAL</td></tr></thead>
        <tbody>
          ${detalle.map((d: any) => {
            const cantidad = Number(d.cantidad || 0);
            const totalLinea = Number(d.subtotal_linea || 0);
            const itbisLinea = Number(d.itbis_monto || 0);
            const totalConItbis = totalLinea + itbisLinea;
            return `<tr style="border-top:1px solid #000;"><td style="font-size:12px;font-weight:900;padding-top:3px;">${d.descripcion}</td><td class="right" style="white-space:nowrap;font-size:12px;font-weight:900;">${cantidad.toFixed(0)}×${money(Number(d.precio_unitario))}</td><td class="right" style="font-size:12px;font-weight:900;">${money(totalConItbis)}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
      <div class="line"></div>
      <table class="tot">
        <tr><td>SUB TOTAL</td><td class="right">${money(subtotal)}</td></tr>
        ${descuento > 0 ? `<tr><td>DESCUENTO</td><td class="right">-${money(descuento)}</td></tr>` : ''}
        <tr><td>ITBIS (18%)</td><td class="right">${money(itbis)}</td></tr>
        <tr class="total-row"><td>TOTAL</td><td class="right">${money(total)}</td></tr>
        <tr><td>PAGO</td><td class="right">${money(Number(pagoCliente))}</td></tr>
        <tr><td>DEVUELTA</td><td class="right">${money(Number(devuelta))}</td></tr>
      </table>
      <div class="line"></div>
      <div class="center" style="font-size:13px; font-weight:900;">*** GRACIAS POR SU COMPRA ***</div>
      ${Number(puntosCliente) > 0 ? `<div class="center" style="font-size:12px;font-weight:900;">PUNTOS ACUMULADOS: ${Number(puntosCliente).toLocaleString('es-DO')}</div>` : ''}
      <div style="height:10mm;"></div>
    </body></html>`;

    // Intentar imprimir por QZ Tray primero
    if (qzIsConnected() && qzPrinterFactura) {
      try {
        if (preopened) preopened.close();
        await qzPrintHtml(qzPrinterFactura, htmlFactura, { paperWidth: 80 });
        return;
      } catch (e) {
        console.warn('QZ print falló, usando ventana:', e);
      }
    }

    // Fallback: ventana del navegador
    const w = preopened ?? window.open('', '_blank', 'width=420,height=900');
    if (!w) return;
    w.document.write(htmlFactura);
    w.document.close();
    await esperarRecursosImpresion(w);
    w.focus();
    w.print();
  }

  function buildEtiquetaHtml(etiqueta: any): string {
    const irc_svg = `<svg xmlns="http://www.w3.org/2000/svg" width="110" height="80" viewBox="0 0 110 80">
      <g transform="translate(5,5)">
        <circle cx="32" cy="35" r="28" fill="none" stroke="#0a2d6e" stroke-width="6"/>
        <circle cx="32" cy="35" r="17" fill="none" stroke="#0a2d6e" stroke-width="3.5"/>
        <text x="32" y="42" text-anchor="middle" font-size="16" font-family="Arial" font-weight="900" fill="#b91c1c">@</text>
        ${[0,45,90,135,180,225,270,315].map((a:number)=>`<rect x="28" y="3" width="8" height="11" rx="2" fill="#0a2d6e" transform="rotate(${a} 32 35)"/>`).join('')}
      </g>
      <text x="78" y="46" text-anchor="middle" font-size="34" font-family="Arial" font-weight="900"><tspan fill="#0a2d6e">I</tspan><tspan fill="#b91c1c">R</tspan><tspan fill="#0a2d6e">C</tspan></text>
    </svg>`;
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
      <title>Etiqueta Bulto ${etiqueta?.bulto ?? ''}</title>
      <style>
        @page { size: 4in 6in; margin: 8mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; color: #111; background: #fff; padding: 10px; }
        .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
        .company { font-size: 14px; font-weight: 900; text-align: center; margin-bottom: 6px; }
        .info-line { font-size: 13px; margin: 5px 0; }
        .info-line.bold { font-weight: 900; font-size: 14px; }
        .divider { border-top: 2px solid #333; margin: 10px 0; }
        .detail-line { font-size: 11px; margin: 4px 0; }
        .bulto-box { text-align: center; margin-top: 16px; border-top: 2px solid #111; padding-top: 10px; }
        .bulto-num { font-size: 48px; font-weight: 900; letter-spacing: 2px; }
      </style>
    </head><body>
      <div class="company">IMPORTADORA REPUESTOS CALCAÑO SRL</div>
      <div class="top">
        <div>
          <div class="info-line">${etiqueta?.fecha ?? '-'}</div>
          <div class="info-line bold">CODIGO: ${etiqueta?.cliente_codigo ?? '-'}</div>
          <div class="info-line bold">CLIENTE: ${(etiqueta?.cliente_nombre ?? '-').toUpperCase()}</div>
        </div>
        <div>${irc_svg}</div>
      </div>
      <div class="divider"></div>
      <div class="detail-line"><strong>DIRECCION:</strong> ${(etiqueta?.direccion ?? '-').toUpperCase()}</div>
      <div class="detail-line"><strong>CIUDAD:</strong> ${(etiqueta?.ciudad ?? '').toUpperCase() || '-'}</div>
      <div class="detail-line"><strong>PEDIDO:</strong> ${etiqueta?.numero_orden ?? '-'}</div>
      <div class="bulto-box">
        <div style="font-size:16px;font-weight:700">BULTO:</div>
        <div class="bulto-num">${etiqueta?.bulto ?? '-'}</div>
      </div>
    </body></html>`;
  }

  async function imprimirEtiquetaBulto(etiqueta: any) {
    const html = buildEtiquetaHtml(etiqueta);
    if (qzIsConnected() && qzPrinterEtiqueta) {
      try {
        await qzPrintHtml(qzPrinterEtiqueta, html, { paperWidth: 101.6, paperHeight: 152.4 });
        return;
      } catch (e: any) {
        toast('error', `QZ etiqueta: ${e.message}. Imprimiendo en navegador...`);
      }
    }
    const w = window.open('', '_blank', 'width=500,height=680');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  async function imprimirFacturaOrdenFinal(orderId: string) {
    const data = await api<any>(`/orders/${orderId}/final-invoice`, token);
    const html = data.preview_html || '<html><body><p>No hay vista previa.</p></body></html>';
    if (qzIsConnected() && qzPrinterCarta) {
      try {
        await qzPrintHtml(qzPrinterCarta, html, { paperWidth: 215.9, paperHeight: 279.4 });
        return;
      } catch (e: any) {
        toast('error', `QZ carta: ${e.message}. Imprimiendo en navegador...`);
      }
    }
    const w = window.open('', '_blank', 'width=1024,height=768');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    await esperarRecursosImpresion(w);
    w.focus();
    w.print();
  }

  async function conectarQZ() {
    setQzStatus('conectando');
    try {
      await qzConnect();
      const printers = await qzGetPrinters();
      setQzPrinters(printers);
      setQzStatus('conectado');
      toast('ok', `QZ Tray conectado — ${printers.length} impresora(s) encontrada(s)`);
    } catch (e: any) {
      setQzStatus('error');
      toast('error', `No se pudo conectar a QZ Tray: ${e.message}`);
    }
  }

  async function enviarVenta() {
    if (!sucursalId || !vendedorId) return toast('error', 'Sucursal y vendedor son obligatorios');
    if (formaPago === 'nota_credito' && !ncEncontrada) {
      toast('error', 'Selecciona una Nota de Crédito válida');
      setModalAplicarNC(true);
      return;
    }
    const carritoFinal = carrito.map((i) => {
      const descItem = Number(i.descuento_monto ?? 0);
      const base = Number(i.cantidad) * Number(i.precio_unitario);
      const descGlob = descuentoGlobal > 0 ? base * (descuentoGlobal / 100) : 0;
      return { ...i, descuento_monto: descItem + descGlob };
    });
    const formaPagoFinal = usuario.rol === 'vendedor' ? 'pendiente' : formaPago;
    if (tipoVenta === 'credito') {
      const cSel = clientes.find((c: any) => c.id === clienteId);
      if (!cSel) return toast('error', 'Debes seleccionar un cliente para vender a crédito');
      if (String(cSel.estatus_credito || '') !== 'abierto') return toast('error', 'Este cliente no está habilitado para crédito');
      if (Number(cSel.limite_credito || 0) <= 0) return toast('error', 'Este cliente no tiene límite de crédito disponible');
    }
    if (tipoVenta === 'credito' && clienteId) {
      const clienteCxC = cxc.filter((x: any) => x.cliente_id === clienteId && Number(x.balance_pendiente) > 0);
      const maxAtraso = clienteCxC.reduce((m: number, x: any) => Math.max(m, Math.max(0, -Number(x.dias_restantes ?? 0))), 0);
      const score = scorePorAtraso(maxAtraso);
      if (score.grado !== 'A') {
        const limiteBase = Number((clientes.find((cl: any) => cl.id === clienteId)?.limite_credito) ?? 0);
        const limiteAjustado = limiteBase * score.factor;
        const ok = window.confirm(`⚠️ Este cliente está en grado ${score.grado} por atrasos (${maxAtraso} días).\nLímite ajustado: RD$ ${money(limiteAjustado)}.\n\n¿Desea continuar con la venta a crédito?`);
        if (!ok) return;
      }
    }
    if (tipoComprobante !== 'consumidor_final' && !fiscalRnc.trim()) { toast('error', 'RNC obligatorio para comprobante fiscal'); return; }
    if (tipoComprobante !== 'consumidor_final' && rncEstado === 'no_encontrado') { toast('error', 'El RNC ingresado es incorrecto o no existe en el catálogo actual.'); return; }
    if (tipoComprobante !== 'consumidor_final' && (rncEstado === 'consultando' || rncEstado === 'actualizando')) { toast('error', 'Espere la validación del RNC antes de facturar.'); return; }
    const payload = { cliente_id: clienteId || null, cliente_nombre_libre: clienteNombreLibre?.trim() || 'PORTADOR', fiscal_rnc: fiscalRnc.trim() || null, fiscal_empresa: fiscalEmpresa.trim() || null, sucursal_id: sucursalId, vendedor_id: vendedorId, tipo_venta: tipoVenta, forma_pago: formaPagoFinal, items: carritoFinal, tipo_comprobante: tipoComprobante, nota_credito_codigo: ncEncontrada?.numero };
    const v = await api<any>('/ventas', token, { method: 'POST', body: JSON.stringify(payload) });
    if (tipoVenta === 'contado') {
      if (usuario.rol === 'cajero') {
        await api(`/ventas/${v.id}/preparar-cobro-directo`, token, { method: 'POST' });
        const ventaLista = await api<any>(`/ventas/${v.id}`, token);
        setCajaCobrarModal(ventaLista.venta);
      } else {
        await api(`/ventas/${v.id}/enviar-cajero`, token, { method: 'POST' });
      }
    }

    if (formaPago === 'nota_credito' && ncEncontrada) {
      const totalFinal = carritoFinal.reduce((a: number, i: any) => {
        const base = Number(i.cantidad) * Number(i.precio_unitario);
        const desc = Number(i.descuento_monto ?? 0);
        return a + (base - desc);
      }, 0);
      const resultado = await api<any>('/notas-credito/aplicar', token, {
        method: 'POST',
        body: JSON.stringify({ codigo_nc: ncEncontrada.numero, total_compra: totalFinal, cliente_id: clienteId }),
      }).catch(() => null);
      if (resultado) {
        if (resultado.resultado === 'insuficiente') {
          setModalNcDiferencia({ diferencia: resultado.diferencia_pagar, monto_nc: resultado.monto_aplicado, venta_id: v.id });
        } else if (resultado.nueva_nc) {
          toast('ok', `✅ Venta registrada. Nueva NC emitida: ${resultado.nueva_nc.numero} con saldo RD$ ${Number(resultado.saldo_restante).toFixed(2)}`);
          setTimeout(() => imprimirNC(resultado.nueva_nc), 500);
        } else {
          toast('ok', '✅ Nota de Crédito utilizada completamente');
        }
        setNcEncontrada(null);
        await cargarTodo();
      }
    } else {
      toast('ok', tipoVenta === 'contado' ? 'Venta enviada a caja' : 'Venta a crédito registrada');
    }
    setCarrito([]); setDescuentoGlobal(0); setClienteQuery('PORTADOR'); setClienteNombreLibre('PORTADOR'); setFormaPago('efectivo'); setTipoComprobante('consumidor_final'); await cargarTodo();
  }

  async function tomarVentaCaja(id: string) {
    await api(`/ventas/${id}/tomar-en-caja`, token, { method: 'POST' });
    const checks = await api<any[]>(`/ventas/${id}/caja-checklist`, token);
    setCajaChecklistModal({ venta_id: id, items: checks });
    toast('ok', 'Venta tomada en revisión de caja');
    await cargarTodo();
  }

  function cobrarVentaCaja(v: any) {
    setCajaCobrarModal(v);
    setCajaTipoPago('efectivo');
    setCajaMontoRecibido('');
    setCajaMixtoEfectivo(Number(v.total ?? 0).toFixed(2));
    setCajaMixtoOtroTipo('tarjeta');
  }


  async function confirmarItemCaja(ventaId: string, checkId: string) {
    const r = await api<any>(`/ventas/${ventaId}/caja-checklist/${checkId}`, token, { method: 'POST' });
    const checks = await api<any[]>(`/ventas/${ventaId}/caja-checklist`, token);
    setCajaChecklistModal((m: any) => ({ ...(m || {}), items: checks, pendientes: r.pendientes }));
    if (r.pendientes === 0) {
      toast('ok', 'Todos los productos fueron confirmados. Lista para cobro.');
      setCajaChecklistModal(null);
      await cargarTodo();
    }
  }

  async function cobrarCuentaCxC(cuenta: any) {
    const totalPendiente = Number(cuenta.balance_pendiente ?? 0);
    if (totalPendiente <= 0) return;
    setCxcCobroModal(cuenta);
    setCxcCobroMonto(totalPendiente.toFixed(2));
  }

  async function confirmarCobroCxC() {
    const cuenta = cxcCobroModal;
    if (!cuenta) return;
    const totalPendiente = Number(cuenta.balance_pendiente ?? 0);
    const total = Number(cxcCobroMonto);
    if (!Number.isFinite(total) || total <= 0 || total - totalPendiente > 0.0001) return toast('error', 'Monto inválido');
    await api(`/cxc/${cuenta.id}/cobrar`, token, {
      method: 'POST',
      body: JSON.stringify({
        tipo_pago: 'efectivo',
        monto_efectivo: total,
        monto_tarjeta: 0,
        monto_transferencia: 0,
        monto_recibido: total,
      }),
    });
    toast('ok', total < totalPendiente ? `Abono aplicado a ${cuenta.numero_interno}` : `Cobro aplicado a ${cuenta.numero_interno}`);
    setCxcCobroModal(null);
    setCxcCobroMonto('');
    await cargarTodo();
  }

  function exportarReportePdf() {
    if (!reporteActivo || !reportes[reporteActivo]) return;
    const titulo = REPORTE_LABELS[reporteActivo] ?? reporteActivo;
    const rows = reportes[reporteActivo];
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>${titulo}</title><style>
      body{font-family:Arial,sans-serif;padding:24px;color:#0f172a} h1{margin:0 0 6px} p{color:#475569}
      table{width:100%;border-collapse:collapse;margin-top:14px} th,td{border:1px solid #cbd5e1;padding:8px;font-size:12px;text-align:left}
      th{background:#e2e8f0} tr:nth-child(even){background:#f8fafc}
    </style></head><body>`);
    w.document.write(`<h1>${titulo}</h1><p>Generado: ${new Date().toLocaleString()}</p>`);
    if (rows.length > 0) {
      const cols = Object.keys(rows[0]);
      w.document.write('<table><thead><tr>' + cols.map((c) => `<th>${c}</th>`).join('') + '</tr></thead><tbody>');
      rows.forEach((r: any) => w!.document.write('<tr>' + cols.map((c) => `<td>${r[c] ?? ''}</td>`).join('') + '</tr>'));
      w.document.write('</tbody></table>');
    }
    w.document.write('</body></html>');
    w.document.close();
    w.focus();
    w.print();
  }

  function cerrarSesion() {
    localStorage.removeItem('pos_token');
    localStorage.removeItem('pos_usuario');
    localStorage.removeItem('pos_modulo');
    setToken('');
    setUsuario(null);
    setModulo('pos');
  }

  if (!usuario) return <Login onSuccess={(t, u) => {
    setToken(t);
    setUsuario(u);
    localStorage.setItem('pos_token', t);
    localStorage.setItem('pos_usuario', JSON.stringify(u));
    const modRuta = moduloDesdeRuta(window.location.pathname);
    const modInicial = u.rol === 'administrador' ? (modRuta ?? 'admin-dashboard') : (u.rol === 'revendedor' ? 'revendedor' : 'pos');
    setModulo(modInicial);
    localStorage.setItem('pos_modulo', modInicial);
    setVendedorId(u.id);
    if (u.sucursal_id) setSucursalId(u.sucursal_id);
  }} />;

  function cambiarModuloConRuta(key: string) {
    const permitidos = new Set(menu.map((m) => m.key));
    if (!permitidos.has(key) && key !== 'pos') return;
    setModulo(key);
    localStorage.setItem('pos_modulo', key);
    const ruta = rutaDesdeModulo(key, usuario.rol);
    window.history.pushState({}, '', ruta);
    if (key === 'historial-ventas' || key === 'devoluciones') setModalConfigReporte(key);
  }

  const menuBase = menuPorRol[usuario.rol] ?? [];
  const menu = [...menuBase];
  if ((usuario.rol === 'vendedor' || usuario.rol === 'administrador') && tieneCapacidad('can_verify') && !menu.some((m) => m.key === 'pendiente-verificar')) {
    menu.push({ key: 'pendiente-verificar', label: 'Pendiente verificar', icono: '✅', acento: 'verde' });
  }
  const kpiCards = [{ titulo: 'Pendientes', valor: String(kpis.ventas_pendientes ?? 0), subtitulo: 'Ventas en cola', tono: 'azul' as const }, { titulo: 'Caja esperada', valor: `RD$ ${Number(kpis.caja_esperada ?? 0).toFixed(2)}`, subtitulo: 'Efectivo proyectado', tono: 'verde' as const }, { titulo: 'Crédito', valor: `RD$ ${Number(kpis.ventas_credito ?? 0).toFixed(2)}`, subtitulo: 'Ventas crédito', tono: 'rojo' as const }, { titulo: 'Cobros', valor: `${Number(kpis.cobros_cantidad ?? 0)}`, subtitulo: `RD$ ${Number(kpis.cobros_total ?? 0).toFixed(2)}`, tono: 'gris' as const }, { titulo: 'Beneficio', valor: `RD$ ${Number(kpis.beneficio_neto ?? 0).toFixed(2)}`, subtitulo: 'Ganancia neta', tono: 'azul' as const }];
  const historialBase = usuario.rol === 'administrador' ? ventasAll : historialVentas;
  const historialFiltrado = historialBase.filter((v: any) =>
    dentroPeriodo(v.fecha_creacion, historialFiltro)
    && (!historialFiltro.sucursal_id || v.sucursal_id === historialFiltro.sucursal_id)
    && (!historialFiltro.empleado_id || v.vendedor_id === historialFiltro.empleado_id)
  );
  const devolucionesFiltradas = notasCredito.filter((n: any) =>
    dentroPeriodo(n.fecha_creacion, devolFiltro)
    && (!devolFiltro.sucursal_id || n.venta_sucursal_id === devolFiltro.sucursal_id)
    && (!devolFiltro.empleado_id || n.vendedor_id === devolFiltro.empleado_id)
  );
  const porVencerRev = cxc.filter((x: any) => {
    if (Number(x.balance_pendiente ?? 0) <= 0 || !x.fecha_vencimiento) return false;
    const diff = Math.ceil((new Date(String(x.fecha_vencimiento)).getTime() - Date.now()) / 86400000);
    return diff >= 0 && diff <= 10;
  });
  const cxcFiltrado = cxc.filter((x: any) => {
    const q = cxcBuscarCliente.toLowerCase().trim();
    if (!q) return true;
    const cl = clientes.find((c: any) => c.id === x.cliente_id) as any;
    return `${x.cliente_nombre ?? ''} ${cl?.codigo ?? ''} ${cl?.telefono_1 ?? ''} ${cl?.telefono_2 ?? ''}`.toLowerCase().includes(q);
  });

  const imgSrc = (url: string) => url ? (url.startsWith('http') ? url : url) : '';

  const formProductoFields = (data: any, onChange: (k: string, v: any) => void) => (
    <div className="quick-form" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
      <div><label>Código *</label><input placeholder="Ej: P-001" value={data.codigo || ''} onChange={(e) => onChange('codigo', e.target.value)} /></div>
      <div><label>Descripción / Nombre *</label><input placeholder="Nombre del producto" value={data.nombre || ''} onChange={(e) => onChange('nombre', e.target.value)} /></div>
      <div><label>Tipo</label><input placeholder="Repuesto, accesorio, líquido..." value={data.tipo || ''} onChange={(e) => onChange('tipo', e.target.value)} /></div>
      <div><label>Marca</label><input placeholder="Ej: NGK, Bosch, ACDelco" value={data.marca || ''} onChange={(e) => onChange('marca', e.target.value)} /></div>
      <div><label>Medida / Unidad</label><input placeholder="UND, KG, M, L..." value={data.medida || ''} onChange={(e) => onChange('medida', e.target.value)} /></div>
      <div><label>Ubicación en almacén</label><input placeholder="Ej: Estante A-3, Pasillo 2" value={data.ubicacion || ''} onChange={(e) => onChange('ubicacion', e.target.value)} /></div>
      <div><label>Costo de compra (RD$)</label><input type="number" placeholder="0.00" value={data.costo || 0} onChange={(e) => onChange('costo', Number(e.target.value))} /></div>
      <div><label>Precio de venta (RD$) *</label><input type="number" placeholder="0.00" value={data.precio || 0} onChange={(e) => onChange('precio', Number(e.target.value))} /></div>
      <div><label>Precio negocio #1 (RD$)</label><input type="number" placeholder="0.00" value={data.precio_negocio_1 || 0} onChange={(e) => onChange('precio_negocio_1', Number(e.target.value))} /></div>
      <div><label>Precio negocio #2 (RD$)</label><input type="number" placeholder="0.00" value={data.precio_negocio_2 || 0} onChange={(e) => onChange('precio_negocio_2', Number(e.target.value))} /></div>
      <div><label>% ITBIS (0 si exento)</label><input type="number" placeholder="18" value={data.itbis_porcentaje ?? 18} onChange={(e) => onChange('itbis_porcentaje', Number(e.target.value))} /></div>
      <div><label>Código de barras</label><input placeholder="Ej: 7896543210123" value={data.codigo_barras || ''} onChange={(e) => onChange('codigo_barras', e.target.value)} /></div>
      <div><label>Existencia mínima</label><input type="number" placeholder="Cantidad mínima para alerta" value={data.existencia_minima || 0} onChange={(e) => onChange('existencia_minima', Number(e.target.value))} /></div>
      <div><label>Referencia / Número OEM</label><input placeholder="Ej: REF-12345" value={data.referencia || ''} onChange={(e) => onChange('referencia', e.target.value)} /></div>
      <div>
        <div className="field-with-add">
          <label>Categoría</label>
          <button className="btn-inline-add" onClick={() => setQuickAddCat(!quickAddCat)} title="Agregar categoría">+ Nueva</button>
        </div>
        <select value={data.categoria || ''} onChange={(e) => onChange('categoria', e.target.value)}>
          <option value="">Sin categoría</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        {quickAddCat && (
          <div className="quick-add-inline">
            <input placeholder="Código (ej: MOT)" value={nuevaCatInline.codigo} onChange={(e) => setNuevaCatInline((s) => ({ ...s, codigo: e.target.value }))} />
            <input placeholder="Nombre de categoría *" value={nuevaCatInline.nombre} onChange={(e) => setNuevaCatInline((s) => ({ ...s, nombre: e.target.value }))} />
            <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => crearCategoriaInline().catch((e) => toast('error', e.message))}>Crear</button>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => setQuickAddCat(false)}>✕</button>
          </div>
        )}
      </div>
      <div>
        <div className="field-with-add">
          <label>Suplidor principal</label>
          <button className="btn-inline-add" onClick={() => setQuickAddSup(!quickAddSup)} title="Agregar suplidor">+ Nuevo</button>
        </div>
        <select value={data.suplidor_principal_id || ''} onChange={(e) => onChange('suplidor_principal_id', e.target.value)}>
          <option value="">Sin suplidor</option>
          {suplidores.map((s) => <option key={s.id} value={s.id}>{s.nombre_comercial}</option>)}
        </select>
        {quickAddSup && (
          <div className="quick-add-inline">
            <input placeholder="Código (ej: SUP-006)" value={nuevoSupInline.codigo} onChange={(e) => setNuevoSupInline((s) => ({ ...s, codigo: e.target.value }))} />
            <input placeholder="Nombre comercial *" value={nuevoSupInline.nombre_comercial} onChange={(e) => setNuevoSupInline((s) => ({ ...s, nombre_comercial: e.target.value }))} />
            <input placeholder="Teléfono" value={nuevoSupInline.telefono} onChange={(e) => setNuevoSupInline((s) => ({ ...s, telefono: e.target.value }))} />
            <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => crearSuplidorInline().catch((e) => toast('error', e.message))}>Crear</button>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => setQuickAddSup(false)}>✕</button>
          </div>
        )}
      </div>
      <div><label>Uso / Notas</label><input placeholder="Notas adicionales del producto" value={data.uso_notas || ''} onChange={(e) => onChange('uso_notas', e.target.value)} /></div>
    </div>
  );

  const qzDot = { desconectado: '#94a3b8', conectando: '#f59e0b', conectado: '#22c55e', error: '#ef4444' }[qzStatus];
  const qzLabel = { desconectado: 'QZ desconectado', conectando: 'Conectando...', conectado: 'QZ conectado', error: 'QZ error' }[qzStatus];

  return <>
    {/* ─── Panel flotante QZ ─── */}
    {qzPanel && (
      <div onClick={() => setQzPanel(false)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' }}>
        <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', padding: 24, margin: '60px 16px 0', width: 340, maxWidth: '95vw' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, color: '#1e3a8a', margin: 0 }}>🖨️ Impresión QZ Tray</h3>
            <button onClick={() => setQzPanel(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '8px 12px', background: '#f8fafc', borderRadius: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: qzDot, display: 'inline-block', flexShrink: 0 }}/>
            <span style={{ fontSize: 13 }}>{qzLabel}</span>
            {qzStatus !== 'conectado' && (
              <button className="btn btn-primary" style={{ marginLeft: 'auto', padding: '5px 14px', fontSize: 12 }}
                onClick={conectarQZ} disabled={qzStatus === 'conectando'}>
                {qzStatus === 'conectando' ? 'Conectando...' : 'Conectar'}
              </button>
            )}
          </div>

          {qzStatus === 'conectado' && (
            <>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>🏷️ Impresora de etiquetas (4×6 in)</label>
                <select value={qzPrinterEtiqueta} onChange={(e) => { setQzPrinterEtiqueta(e.target.value); localStorage.setItem('qz_printer_etiqueta', e.target.value); }} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}>
                  <option value="">— Sin seleccionar —</option>
                  {qzPrinters.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>🧾 Impresora térmica (80mm) — Recibos POS</label>
                <select value={qzPrinterFactura} onChange={(e) => { setQzPrinterFactura(e.target.value); localStorage.setItem('qz_printer_factura', e.target.value); }} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}>
                  <option value="">— Sin seleccionar —</option>
                  {qzPrinters.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>📄 Impresora carta (8½×11) — Facturas pedidos</label>
                <select value={qzPrinterCarta} onChange={(e) => { setQzPrinterCarta(e.target.value); localStorage.setItem('qz_printer_carta', e.target.value); }} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}>
                  <option value="">— Sin seleccionar (usa diálogo del navegador) —</option>
                  {qzPrinters.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </>
          )}

          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <a href="/api/qz/cert/download" download style={{ textAlign: 'center', fontSize: 12, color: '#3b82f6', textDecoration: 'none', padding: '6px 0', border: '1px solid #bfdbfe', borderRadius: 6 }}>
              ⬇ Descargar certificado (.crt)
            </a>
            <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', margin: 0 }}>
              Instala el .crt en QZ Tray → Site Manager → Add una sola vez.
            </p>
          </div>
        </div>
      </div>
    )}

    <Layout usuario={usuario} moduloActivo={modulo} onCambiarModulo={cambiarModuloConRuta} onCerrarSesion={cerrarSesion} menu={menu} tituloModulo={menu.find((m) => m.key === modulo)?.label ?? 'POS'} esDashboard={modulo === 'admin-dashboard'} kpis={modulo === 'admin-dashboard' && usuario.rol === 'administrador' ? kpiCards : []} ocultarSidebar={usuario.rol === 'revendedor'}
      topbarExtra={
        <button onClick={() => setQzPanel(true)} title={qzLabel} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13 }}>
          🖨️ <span style={{ width: 8, height: 8, borderRadius: '50%', background: qzDot, display: 'inline-block' }}/>
        </button>
      }>

      {modulo === 'pos' && <div className="panel-grid">
        <article className="panel-card span-8">
          <h3>Punto de venta</h3>
          <div className="pos-topbar">
            <div className="pos-field">
              <label>Tipo</label>
              <select value={tipoVenta} onChange={(e) => setTipoVenta(e.target.value as any)}>
                <option value="contado">Contado</option>
                <option value="credito">Crédito</option>
                <option value="devolucion">Devolución</option>
              </select>
            </div>
            <div className="pos-field">
              <label>Vendedor</label>
              <select value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}>
                <option value="">Seleccionar...</option>
                {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre_completo}</option>)}
              </select>
            </div>
            <div className="pos-field pos-cliente" style={{ flex: 2 }}>
              <label>Cliente — buscar por nombre o teléfono</label>
              <div style={{ position: 'relative', display: 'flex', gap: 6 }}>
                <input
                  list="clientes-options"
                  placeholder="Ej: Juan Pérez o 809-555-..."
                  value={clienteQuery}
                  style={{ flex: 1 }}
                  onChange={(e) => {
                    const val = e.target.value;
                    setClienteQuery(val);
                    const match = clientes.find((c) =>
                      `${c.codigo} - ${c.nombre}` === val ||
                      c.nombre?.toLowerCase() === val.toLowerCase() ||
                      c.telefono_1 === val
                    );
                    setClienteId(match?.id ?? '');
                  }}
                />
                <datalist id="clientes-options">
                  {clientesFiltradosPOS.slice(0, 40).map((c) => (
                    <option key={c.id} value={`${c.codigo} - ${c.nombre}`}>{c.telefono_1 ? `Tel: ${c.telefono_1}` : ''}</option>
                  ))}
                </datalist>
                <button className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 12, whiteSpace: 'nowrap' }} onClick={() => { setPosClienteNuevoModal(true); setPosNuevoClienteNombre(''); }}>+ Nuevo</button>
                {usuario.puede_agregar_fidelidad ? (
                  <button className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 12, whiteSpace: 'nowrap', color: 'var(--amarillo-600, #b45309)', borderColor: 'var(--amarillo-600, #b45309)' }} onClick={() => { setNuevoCliente({ ...NUEVOCLUB_BLANK, codigo: autoCodigoCliente(clientes), en_programa_fidelidad: true }); setModalCliente(true); cambiarModuloConRuta('clientes'); }}>⭐ Fidelidad</button>
                ) : null}
              </div>
            </div>
            {usuario.rol !== 'vendedor' && <div className="pos-field">
              <label>Forma de pago</label>
              <select value={formaPago} onChange={(e) => {
                const v = e.target.value;
                setFormaPago(v);
                if (v === 'nota_credito') {
                  setCodigoNC('');
                  setNcEncontrada(null);
                  setModalAplicarNC(true);
                }
                if (v === 'devolucion') {
                  setTipoVenta('devolucion');
                  setModalDevolucion(true);
                  setFormaPago('efectivo');
                }
              }}>
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="transferencia">Transferencia</option>
                <option value="mixto">Mixto</option>
                <option value="nota_credito">📄 Nota de Crédito</option>
                <option value="devolucion">↩️ Devolución</option>
              </select>
            </div>}
            <div>
              <label>Tipo de comprobante</label>
              <select value={tipoComprobante} onChange={(e) => setTipoComprobante(e.target.value)}>
                {ncfTipos.map((t) => <option key={t.id} value={t.codigo}>{t.nombre}</option>)}
                {ncfTipos.length === 0 && <option value="consumidor_final">Consumidor Final</option>}
              </select>
            </div>
            {tipoComprobante !== 'consumidor_final' && (
              <>
                <div>
                  <label>RNC</label>
                  <input value={fiscalRnc} onChange={(e) => setFiscalRnc(e.target.value)} placeholder="RNC" />
                </div>
                <div>
                  <label>Empresa (autocompletado)</label>
                  <input value={fiscalEmpresa} readOnly placeholder="Se completa automáticamente con DGII" />
                </div>
                <div style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 700 }}>
                  {rncEstado === 'consultando' && rncMensaje}
                  {rncEstado === 'actualizando' && (rncMensaje || 'Actualizando catálogo DGII para validar este RNC...')}
                  {rncEstado === 'encontrado' && `✅ ${rncMensaje}`}
                  {rncEstado === 'no_encontrado' && `⚠️ ${rncMensaje}`}
                </div>
              </>
            )}
          </div>

          {clienteSel && (
            <div className="cliente-info-bar">
              <strong>{clienteSel.nombre}</strong>
              <span>Cédula/RNC: {clienteSel.cedula_rnc || '-'}</span>
              <span>Tel: {clienteSel.telefono_1 || '-'}</span>
              <span style={{ color: clienteSel.estatus_credito === 'abierto' ? 'var(--success)' : 'var(--muted)' }}>
                Crédito: {clienteSel.estatus_credito === 'abierto' ? '✓ Abierto' : '✗ Cerrado'} / RD$ {Number(clienteSel.limite_credito || 0).toFixed(2)}
              </span>
              {clienteSel.en_programa_fidelidad ? (
                <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 700, border: '1px solid #fde68a' }}>
                  ⭐ Miembro Fidelidad — {(clientesFidelidad.find((f: any) => f.id === clienteSel.id)?.puntos_disponibles ?? 0).toLocaleString()} pts disponibles
                </span>
              ) : null}
            </div>
          )}

          <input className="pos-buscar" placeholder="🔍 Buscar producto por código, nombre o código de barras..." value={buscarProducto} onChange={(e) => setBuscarProducto(e.target.value)} />

          {productoInfoCard && (
            <div className="producto-info-card">
              <button className="btn-close-info" onClick={() => setProductoInfoCard(null)}>✕</button>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {productoInfoCard.imagen_url
                  ? <img src={imgSrc(productoInfoCard.imagen_url)} alt={productoInfoCard.nombre} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid #e0e0e0' }} />
                  : <div style={{ width: 64, height: 64, background: '#f0f0f0', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#999', textAlign: 'center' }}>Sin imagen</div>}
                <div>
                  <strong>{productoInfoCard.nombre}</strong>
                  <div className="producto-info-detalles" style={{ marginTop: 4 }}>
                    <span>📍 Ubicación: <strong>{productoInfoCard.ubicacion || 'Sin ubicación'}</strong></span>
                    <span>📦 Existencia: <strong>{Number(productoInfoCard.existencia || 0).toFixed(2)}</strong></span>
                    <span>💰 Precio: <strong>RD$ {money(Number(productoInfoCard.precio))}</strong></span>
                    <span>📐 Medida: <strong>{productoInfoCard.medida || 'UND'}</strong></span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="product-grid">
            {productosFiltrados.slice(0, 18).map((p) => (
              <button
                key={p.id}
                className="product-pill"
                onClick={() => setProductoInfoCard(p)}
                onDoubleClick={() => abrirModalCantidadProducto(p)}
                title="1 clic: ver datos · 2 clics: agregar con cantidad"
              >
                {p.imagen_url
                  ? <img src={imgSrc(p.imagen_url)} alt={p.nombre} style={{ width: '100%', height: 56, objectFit: 'cover', borderRadius: 6, marginBottom: 4 }} />
                  : <div style={{ width: '100%', height: 56, background: '#f0f0f0', borderRadius: 6, marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#999' }}>Sin imagen</div>}
                <strong style={{ fontSize: 11 }}>{p.codigo}</strong>
                <span style={{ fontSize: 12, lineHeight: 1.2 }}>{p.nombre}</span>
                <small>Stock: {Number(p.existencia || 0).toFixed(0)} · RD$ {money(Number(p.precio))}</small>
              </button>
            ))}
          </div>

        </article>

        <article className="panel-card span-4">
          <div style={{ marginBottom: 8, padding: '8px 10px', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8 }}><strong>NCF:</strong> {ncfPreview || '—'}</div>
          <h3>🛒 Resumen de compra</h3>
          
          {carrito.length > 0 && (
            <div style={{ marginBottom: 14, borderBottom: '1px solid #edf0f6', paddingBottom: 12 }}>
              <div style={{ overflowY: 'auto', maxHeight: 160, marginBottom: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <tbody>
                    {carrito.map((i, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 4px', width: '32px' }}>
                          {i.imagen_url
                            ? <img src={imgSrc(i.imagen_url)} alt={i.descripcion} style={{ width: 24, height: 24, objectFit: 'cover', borderRadius: 3 }} />
                            : <div style={{ width: 24, height: 24, background: '#f0f0f0', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#999' }}>S/I</div>}
                        </td>
                        <td style={{ padding: '6px 4px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70px' }}>{i.descripcion}</td>
                        <td style={{ padding: '6px 4px', textAlign: 'center', minWidth: '30px' }}>{i.cantidad}</td>
                        <td style={{ padding: '6px 4px', textAlign: 'right', minWidth: '50px', fontWeight: 700 }}>RD$ {(Number(i.cantidad) * Number(i.precio_unitario)).toFixed(2)}</td>
                        <td style={{ padding: '6px 4px', textAlign: 'center', minWidth: '24px' }}><button className="btn btn-ghost" style={{ padding: '2px 4px', fontSize: 10 }} onClick={() => setCarrito((c) => c.filter((_, j) => j !== idx))}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {usuario.rol === 'al_por_mayor' && (
                <div style={{ fontSize: 11, color: 'var(--muted)', padding: '6px 0', borderTop: '1px solid #f1f5f9', marginTop: 6, paddingTop: 6 }}>
                  📝 Al por mayor: puedes editar precios y descuentos haciendo clic en la tabla superior
                </div>
              )}
            </div>
          )}
          
          {carrito.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px 10px', color: 'var(--muted)', fontSize: 13 }}>
              El carrito está vacío — selecciona productos arriba
            </div>
          )}
          <div className="money-line"><span>Subtotal</span><strong>RD$ {subtotal.toFixed(2)}</strong></div>
          <div className="money-line"><span>ITBIS</span><strong>RD$ {itbisTotal.toFixed(2)}</strong></div>
          <div className="money-line"><span>Descuento</span><strong style={{ color: descuentoTotal > 0 ? 'var(--success)' : undefined }}>- RD$ {descuentoTotal.toFixed(2)}</strong></div>
          <div className="money-line total"><span>Total</span><strong>RD$ {total.toFixed(2)}</strong></div>
          {formaPago === 'nota_credito' && ncEncontrada && (() => {
            const montoNC = Math.min(Number(ncEncontrada.monto_restante), total);
            const pendiente = Math.max(0, total - montoNC);
            return (
              <>
                <div className="money-line" style={{ borderTop: '1px dashed #86efac', paddingTop: 6, marginTop: 2 }}>
                  <span style={{ color: '#15803d' }}>📄 NC {ncEncontrada.numero}</span>
                  <strong style={{ color: '#15803d' }}>- RD$ {montoNC.toFixed(2)}</strong>
                </div>
                <div className="money-line" style={{ fontWeight: 700 }}>
                  <span>{pendiente > 0 ? 'Pendiente a pagar' : '✅ Cubierto por NC'}</span>
                  <strong style={{ color: pendiente > 0 ? '#dc2626' : '#15803d', fontSize: 16 }}>
                    RD$ {pendiente.toFixed(2)}
                  </strong>
                </div>
              </>
            );
          })()}
          <div className="money-line"><span>Balance pendiente</span><strong>RD$ {tipoVenta === 'credito' ? total.toFixed(2) : '0.00'}</strong></div>
          <div className="money-line"><span>Estado</span><strong>{tipoVenta === 'credito' ? 'Crédito' : 'Contado'}</strong></div>

          {usuario.rol === 'cajero' && (formaPago === 'efectivo' || formaPago === 'mixto') && tipoVenta === 'contado' && (() => {
            const totalCobrar = formaPago === 'nota_credito' && ncEncontrada
              ? Math.max(0, total - Math.min(Number(ncEncontrada.monto_restante), total))
              : total;
            const recibNum = parseFloat(montoRecibido) || 0;
            const vuelto = recibNum > 0 ? Math.max(0, recibNum - totalCobrar) : 0;
            return (
              <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: 10, marginTop: 6 }}>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--muted)' }}>
                  💵 Monto recibido en efectivo:
                </label>
                <input
                  type="number"
                  min="0"
                  step="50"
                  placeholder={`Mín. ${totalCobrar.toFixed(2)}`}
                  value={montoRecibido}
                  onChange={(e) => setMontoRecibido(e.target.value)}
                  style={{ width: '100%', fontSize: 16, fontWeight: 700, textAlign: 'right', padding: '6px 8px' }}
                />
                {vuelto > 0 && (
                  <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, padding: '6px 12px', marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>💵 Vuelto:</span>
                    <strong style={{ color: '#15803d', fontSize: 18 }}>RD$ {vuelto.toFixed(2)}</strong>
                  </div>
                )}
                {recibNum > 0 && recibNum < totalCobrar && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '6px 10px', marginTop: 6, color: '#dc2626', fontSize: 12 }}>
                    ⚠️ Monto insuficiente — faltan RD$ {(totalCobrar - recibNum).toFixed(2)}
                  </div>
                )}
              </div>
            );
          })()}

          <div style={{ marginTop: 12, marginBottom: 4 }}>
            <small style={{ color: 'var(--muted)' }}>Descuento rápido:</small>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button className={`btn ${descuentoGlobal === 5 ? 'btn-primary' : 'btn-ghost'}`} style={{ flex: 1 }} onClick={() => aplicarDescuentoGlobal(5)}>5%</button>
              <button className={`btn ${descuentoGlobal === 8 ? 'btn-primary' : 'btn-ghost'}`} style={{ flex: 1 }} onClick={() => aplicarDescuentoGlobal(8)}>8%</button>
              {descuentoGlobal > 0 && <button className="btn btn-ghost" style={{ flex: 1, color: 'var(--rojo-600)' }} onClick={() => setDescuentoGlobal(0)}>Quitar</button>}
            </div>
          </div>

          <button className="btn btn-primary" style={{ marginTop: 16, width: '100%' }} onClick={() => enviarVenta().catch((e) => toast('error', e.message))}>
            {usuario.rol === 'vendedor' ? '📤 Enviar a Caja' : '✅ Registrar Venta'}
          </button>
          {carrito.length > 0 && (
            <button className="btn btn-ghost" style={{ marginTop: 8, width: '100%' }} onClick={() => { setCarrito([]); setProductoInfoCard(null); setDescuentoGlobal(0); }}>
              🗑 Vaciar carrito
            </button>
          )}
        </article>
      </div>}

      {modalCantidadProducto && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setModalCantidadProducto(null); }}>
          <div className="modal-card" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>Agregar producto al pedido</h3>
              <button className="btn btn-ghost" onClick={() => setModalCantidadProducto(null)}>✕</button>
            </div>
            <div style={{ marginBottom: 10 }}>
              <strong>{modalCantidadProducto.nombre}</strong>
              <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 13 }}>
                📍 {modalCantidadProducto.ubicacion || 'Sin ubicación'} · 💰 RD$ {Number(modalCantidadProducto.precio || 0).toFixed(2)}
              </div>
            </div>
            <div>
              <label>Cantidad vendida</label>
              <input
                autoFocus
                type="number"
                min={1}
                value={cantidadProductoSeleccionado}
                onChange={(e) => setCantidadProductoSeleccionado(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmarAgregarCantidadProducto(); }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setModalCantidadProducto(null)}>Cancelar</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={confirmarAgregarCantidadProducto}>Agregar</button>
            </div>
          </div>
        </div>
      )}

      {posClienteNuevoModal && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setPosClienteNuevoModal(false); }}>
          <div className="modal-card" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>Registrar nuevo cliente</h3>
              <button className="btn btn-ghost" onClick={() => setPosClienteNuevoModal(false)}>✕</button>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>El cliente se registrará con crédito cerrado. El administrador puede habilitarlo desde el menú Clientes.</p>
            <div className="quick-form" style={{ gridTemplateColumns: '1fr' }}>
              <div>
                <label>Teléfono *</label>
                <input placeholder="Ej: 809-555-0001" value={clienteQuery} onChange={(e) => setClienteQuery(e.target.value)} />
              </div>
              <div>
                <label>Nombre completo *</label>
                <input placeholder="Ej: Juan Pérez" value={posNuevoClienteNombre} onChange={(e) => setPosNuevoClienteNombre(e.target.value)} />
              </div>
            </div>
            <button className="btn btn-primary" style={{ marginTop: 12, width: '100%' }} onClick={async () => {
              if (!posNuevoClienteNombre.trim() || !clienteQuery.trim()) { toast('error', 'Nombre y teléfono son obligatorios'); return; }
              const c = await crearClienteRapido(posNuevoClienteNombre.trim(), clienteQuery.trim()).catch((e) => { toast('error', e.message); return null; });
              if (c) {
                await cargarTodo();
                setClienteId(c.id ?? '');
                setPosClienteNuevoModal(false);
              }
            }}>Registrar y seleccionar</button>
          </div>
        </div>
      )}

      {modalFidelidad && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setModalFidelidad(false); }}>
          <div className="modal-card modal-card-wide">
            <div className="modal-header">
              <h3>⭐ Programa de Fidelidad — Registrar / Actualizar Cliente</h3>
              <button className="btn btn-ghost" onClick={() => setModalFidelidad(false)}>✕</button>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>
              Busca el cliente por nombre, código o teléfono. Si ya está registrado, sus datos se autocompletarán para que puedas actualizarlos. Si no existe, se creará nuevo.
            </p>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Buscar cliente</label>
              <input
                list="fid-clientes-options"
                placeholder="Nombre, código o teléfono..."
                value={buscarClienteFidelidad}
                style={{ width: '100%' }}
                onChange={(e) => {
                  const val = e.target.value;
                  setBuscarClienteFidelidad(val);
                  const match = clientes.find((c: any) =>
                    `${c.codigo} - ${c.nombre}` === val ||
                    c.nombre?.toLowerCase() === val.toLowerCase() ||
                    c.telefono_1 === val
                  );
                  if (match) setClienteFidelidadSeleccionado({ ...match, en_programa_fidelidad: true });
                  else setClienteFidelidadSeleccionado(null);
                }}
              />
              <datalist id="fid-clientes-options">
                {clientes.slice(0, 80).map((c: any) => (
                  <option key={c.id} value={`${c.codigo} - ${c.nombre}`}>{c.telefono_1 || ''}</option>
                ))}
              </datalist>
            </div>
            {clienteFidelidadSeleccionado && (
              <div>
                <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
                  <strong>⭐ Cliente encontrado — completa o actualiza los datos para inscribirlo:</strong>
                </div>
                <div className="quick-form" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
                  <div><label>Código</label><input value={clienteFidelidadSeleccionado.codigo || ''} onChange={(e) => setClienteFidelidadSeleccionado((s: any) => ({ ...s, codigo: e.target.value }))} /></div>
                  <div><label>Nombre completo *</label><input value={clienteFidelidadSeleccionado.nombre || ''} onChange={(e) => setClienteFidelidadSeleccionado((s: any) => ({ ...s, nombre: e.target.value }))} /></div>
                  <div><label>Cédula / RNC</label><input value={clienteFidelidadSeleccionado.cedula_rnc || ''} onChange={(e) => setClienteFidelidadSeleccionado((s: any) => ({ ...s, cedula_rnc: e.target.value }))} /></div>
                  <div><label>Teléfono principal</label><input value={clienteFidelidadSeleccionado.telefono_1 || ''} onChange={(e) => setClienteFidelidadSeleccionado((s: any) => ({ ...s, telefono_1: e.target.value }))} /></div>
                  <div><label>Teléfono secundario</label><input value={clienteFidelidadSeleccionado.telefono_2 || ''} onChange={(e) => setClienteFidelidadSeleccionado((s: any) => ({ ...s, telefono_2: e.target.value }))} /></div>
                  <div><label>Correo electrónico</label><input value={clienteFidelidadSeleccionado.correo || ''} onChange={(e) => setClienteFidelidadSeleccionado((s: any) => ({ ...s, correo: e.target.value }))} /></div>
                  <div><label>Dirección</label><input value={clienteFidelidadSeleccionado.direccion || ''} onChange={(e) => setClienteFidelidadSeleccionado((s: any) => ({ ...s, direccion: e.target.value }))} /></div>
                  <div><label>Fecha de nacimiento</label><input type="date" value={clienteFidelidadSeleccionado.fecha_nacimiento || ''} onChange={(e) => setClienteFidelidadSeleccionado((s: any) => ({ ...s, fecha_nacimiento: e.target.value }))} /></div>
                  <div><label>Tipo de cliente</label><input placeholder="Ej: Taller, Persona, Comerciante" value={clienteFidelidadSeleccionado.tipo_cliente || ''} onChange={(e) => setClienteFidelidadSeleccionado((s: any) => ({ ...s, tipo_cliente: e.target.value }))} /></div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', borderRadius: 8, padding: '10px 14px', border: '1px solid #fde68a', marginTop: 12 }}>
                  <input type="checkbox" id="fid-modal-check" checked={true} readOnly style={{ width: 18, height: 18, accentColor: '#d97706' }} />
                  <label htmlFor="fid-modal-check" style={{ fontWeight: 600, color: '#92400e', margin: 0 }}>⭐ Este cliente quedará inscrito en el programa de Fidelidad</label>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button className="btn btn-primary" onClick={async () => {
                    try {
                      await api(`/clientes/${clienteFidelidadSeleccionado.id}`, token, { method: 'PUT', body: JSON.stringify({ ...clienteFidelidadSeleccionado, en_programa_fidelidad: true }) });
                      await cargarTodo();
                      toast('ok', `✅ ${clienteFidelidadSeleccionado.nombre} inscrito en Fidelidad`);
                      setModalFidelidad(false);
                    } catch (e: any) { toast('error', e.message); }
                  }}>⭐ Guardar e inscribir en Fidelidad</button>
                  <button className="btn btn-ghost" onClick={() => setModalFidelidad(false)}>Cancelar</button>
                </div>
              </div>
            )}
            {!clienteFidelidadSeleccionado && buscarClienteFidelidad.length > 2 && !creaClienteFidelidadNuevo && (
              <div style={{ textAlign: 'center', padding: 20 }}>
                <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>✨ Cliente no encontrado — creando formulario nuevo...</p>
              </div>
            )}
            
            {creaClienteFidelidadNuevo && clienteFidelidadSeleccionado && (
              <div>
                <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
                  <strong>✨ Nuevo cliente — completa los datos y guarda:</strong>
                </div>
                <div className="quick-form" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
                  <div><label>Código (auto-generado)</label><input readOnly value={clienteFidelidadSeleccionado.codigo || ''} style={{ background: '#f5f5f5', cursor: 'not-allowed' }} /></div>
                  <div><label>Nombre completo *</label><input value={clienteFidelidadSeleccionado.nombre || ''} onChange={(e) => setClienteFidelidadSeleccionado((s: any) => ({ ...s, nombre: e.target.value }))} /></div>
                  <div><label>Cédula / RNC</label><input value={clienteFidelidadSeleccionado.cedula_rnc || ''} onChange={(e) => setClienteFidelidadSeleccionado((s: any) => ({ ...s, cedula_rnc: e.target.value }))} /></div>
                  <div><label>Teléfono principal</label><input value={clienteFidelidadSeleccionado.telefono_1 || ''} onChange={(e) => setClienteFidelidadSeleccionado((s: any) => ({ ...s, telefono_1: e.target.value }))} /></div>
                  <div><label>Teléfono secundario</label><input value={clienteFidelidadSeleccionado.telefono_2 || ''} onChange={(e) => setClienteFidelidadSeleccionado((s: any) => ({ ...s, telefono_2: e.target.value }))} /></div>
                  <div><label>Correo electrónico</label><input value={clienteFidelidadSeleccionado.correo || ''} onChange={(e) => setClienteFidelidadSeleccionado((s: any) => ({ ...s, correo: e.target.value }))} /></div>
                  <div><label>Representante / Contacto</label><input value={clienteFidelidadSeleccionado.representante || ''} onChange={(e) => setClienteFidelidadSeleccionado((s: any) => ({ ...s, representante: e.target.value }))} /></div>
                  <div><label>Dirección</label><input value={clienteFidelidadSeleccionado.direccion || ''} onChange={(e) => setClienteFidelidadSeleccionado((s: any) => ({ ...s, direccion: e.target.value }))} /></div>
                  <div><label>Fecha de nacimiento</label><input type="date" value={clienteFidelidadSeleccionado.fecha_nacimiento || ''} onChange={(e) => setClienteFidelidadSeleccionado((s: any) => ({ ...s, fecha_nacimiento: e.target.value }))} /></div>
                  <div><label>Tipo de cliente</label><input placeholder="Ej: Taller, Persona, Comerciante" value={clienteFidelidadSeleccionado.tipo_cliente || ''} onChange={(e) => setClienteFidelidadSeleccionado((s: any) => ({ ...s, tipo_cliente: e.target.value }))} /></div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', borderRadius: 8, padding: '10px 14px', border: '1px solid #fde68a', marginTop: 12 }}>
                  <input type="checkbox" id="fid-nuevo-check" checked={true} readOnly style={{ width: 18, height: 18, accentColor: '#d97706' }} />
                  <label htmlFor="fid-nuevo-check" style={{ fontWeight: 600, color: '#92400e', margin: 0 }}>⭐ Se registrará en Fidelidad automáticamente</label>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button className="btn btn-primary" onClick={async () => {
                    try {
                      if (!clienteFidelidadSeleccionado.nombre?.trim()) {
                        toast('error', 'El nombre es obligatorio');
                        return;
                      }
                      await api('/clientes', token, { method: 'POST', body: JSON.stringify({ ...clienteFidelidadSeleccionado, codigo: clienteFidelidadSeleccionado.codigo || autoCodigoCliente(clientes), estatus_credito: 'cerrado', en_programa_fidelidad: true, tipo_comprobante_fiscal: 'consumidor_final' }) });
                      await cargarTodo();
                      toast('ok', `✅ ${clienteFidelidadSeleccionado.nombre} creado e inscrito en Fidelidad`);
                      setModalFidelidad(false);
                      setCreaClienteFidelidadNuevo(false);
                    } catch (e: any) { toast('error', e.message); }
                  }}>✅ Crear y registrar en Fidelidad</button>
                  <button className="btn btn-ghost" onClick={() => { setCreaClienteFidelidadNuevo(false); setClienteFidelidadSeleccionado(null); }}>← Volver</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {modalDevolucion && !ncCreada && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) { setModalDevolucion(false); setTipoVenta('contado'); } }}>
          <div className="modal-card modal-card-wide">
            <div className="modal-header">
              <h3>📄 Devolución de venta</h3>
              <button className="btn btn-ghost" onClick={() => { setModalDevolucion(false); setTipoVenta('contado'); }}>✕</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Buscar venta original (número o cliente)</label>
              <input
                placeholder="Ej: V-1774..., nombre del cliente..."
                value={ventaDevolucionBuscar}
                style={{ width: '100%' }}
                onChange={async (e) => {
                  const val = e.target.value;
                  setVentaDevolucionBuscar(val);
                  if (val.trim().length > 1) {
                    const ventas = historialVentas.filter((v: any) =>
                      String(v.numero_interno).toLowerCase().includes(val.toLowerCase()) ||
                      (v.cliente_nombre && v.cliente_nombre.toLowerCase().includes(val.toLowerCase()))
                    );
                    if (ventas.length > 0) {
                      const venta = ventas[0];
                      setVentaDevolucionSeleccionada(venta);
                      const resDetalle = await api<any>(`/ventas/${venta.id}`, token).catch(() => ({ detalle: [] }));
                      setItemsDevolucionSeleccionados((resDetalle?.detalle || []).map((d: any) => ({ ...d, cantidad_devolver: 0 })));
                    } else {
                      setVentaDevolucionSeleccionada(null);
                      setItemsDevolucionSeleccionados([]);
                    }
                  }
                }}
              />
            </div>

            {ventaDevolucionSeleccionada && (
              <div>
                <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: 14 }}>
                    📋 {ventaDevolucionSeleccionada.numero_interno} — <strong>{ventaDevolucionSeleccionada.cliente_nombre || 'S/Cliente'}</strong>
                  </h4>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Total original: RD$ {Number(ventaDevolucionSeleccionada.total).toFixed(2)}</span>
                </div>

                <table className="table-premium" style={{ marginBottom: 12 }}>
                  <thead>
                    <tr><th>Código</th><th>Producto</th><th>Cant. facturada</th><th>Precio</th><th>Cant. a devolver</th></tr>
                  </thead>
                  <tbody>
                    {itemsDevolucionSeleccionados.map((item: any, idx: number) => (
                      <tr key={idx}>
                        <td><strong>{item.codigo_producto}</strong></td>
                        <td>{item.descripcion}</td>
                        <td style={{ textAlign: 'center' }}>{item.cantidad}</td>
                        <td>RD$ {Number(item.precio_unitario).toFixed(2)}</td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max={item.cantidad}
                            value={item.cantidad_devolver || 0}
                            onChange={(e) => {
                              const newItems = [...itemsDevolucionSeleccionados];
                              newItems[idx].cantidad_devolver = Math.min(Number(e.target.value), item.cantidad);
                              setItemsDevolucionSeleccionados(newItems);
                            }}
                            style={{ width: 70, padding: '4px 6px', textAlign: 'center' }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {(() => {
                  const montoNC = itemsDevolucionSeleccionados.filter((i: any) => i.cantidad_devolver > 0).reduce((acc: number, i: any) => {
                    const base = Number(i.cantidad_devolver) * Number(i.precio_unitario);
                    return acc + base + base * Number(i.itbis_tasa ?? 0.18);
                  }, 0);
                  return montoNC > 0 ? (
                    <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
                      💳 <strong>Nota de Crédito a emitir: RD$ {montoNC.toFixed(2)}</strong>
                    </div>
                  ) : null;
                })()}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" onClick={async () => {
                    const itemsConDevolucion = itemsDevolucionSeleccionados.filter((i: any) => i.cantidad_devolver > 0);
                    if (itemsConDevolucion.length === 0) {
                      toast('error', 'Ingresa al menos 1 unidad para devolver');
                      return;
                    }
                    try {
                      const payload = {
                        venta_id: ventaDevolucionSeleccionada.id,
                        items_devolucion: itemsConDevolucion.map((i: any) => ({
                          producto_id: i.producto_id,
                          codigo_producto: i.codigo_producto,
                          descripcion: i.descripcion,
                          cantidad: i.cantidad_devolver,
                          precio_unitario: i.precio_unitario,
                          itbis_tasa: i.itbis_tasa ?? 0.18,
                        })),
                      };
                      const nc = await api<any>('/notas-credito/generar', token, { method: 'POST', body: JSON.stringify(payload) });
                      const ncConNombre = { ...nc, cliente_nombre: ventaDevolucionSeleccionada.cliente_nombre };
                      setNcCreada(ncConNombre);
                      await cargarTodo();
                    } catch (e: any) {
                      toast('error', e.message);
                    }
                  }}>📄 Generar Nota de Crédito</button>
                  <button className="btn btn-ghost" onClick={() => { setVentaDevolucionSeleccionada(null); setItemsDevolucionSeleccionados([]); setVentaDevolucionBuscar(''); }}>Limpiar</button>
                </div>
              </div>
            )}

            {!ventaDevolucionSeleccionada && ventaDevolucionBuscar.length > 1 && (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)', fontSize: 13 }}>
                No se encontró ninguna venta. Verifica el número o nombre del cliente.
              </div>
            )}
          </div>
        </div>
      )}

      {ncCreada && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: 440, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
            <h3 style={{ color: '#059669', marginBottom: 4 }}>Devolución registrada</h3>
            <p style={{ color: 'var(--muted)', marginBottom: 16, fontSize: 13 }}>Los productos han vuelto al inventario y se ha emitido la siguiente Nota de Crédito:</p>
            <div style={{ background: '#f0fdf4', border: '2px solid #86efac', borderRadius: 12, padding: '16px 24px', marginBottom: 16 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#15803d', letterSpacing: 2 }}>{ncCreada.numero}</div>
              <div style={{ fontSize: 14, color: '#166534', marginTop: 4 }}>Cliente: <strong>{ncCreada.cliente_nombre}</strong></div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#15803d', marginTop: 8 }}>RD$ {Number(ncCreada.monto_original).toFixed(2)}</div>
              <div style={{ fontSize: 11, color: '#166534', marginTop: 4 }}>Válida para futuras compras</div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => imprimirNC(ncCreada)}>🖨️ Imprimir NC</button>
              <button className="btn btn-ghost" onClick={() => {
                setNcCreada(null);
                setModalDevolucion(false);
                setTipoVenta('contado');
                setVentaDevolucionBuscar('');
                setVentaDevolucionSeleccionada(null);
                setItemsDevolucionSeleccionados([]);
              }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {modalAplicarNC && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) { setModalAplicarNC(false); if (formaPago === 'nota_credito') setFormaPago('efectivo'); } }}>
          <div className="modal-card" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3>📄 Pagar con Nota de Crédito</h3>
              <button className="btn btn-ghost" onClick={() => { setModalAplicarNC(false); if (formaPago === 'nota_credito' && !ncEncontrada) setFormaPago('efectivo'); }}>✕</button>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 14 }}>Ingresa el código de la Nota de Crédito del cliente.</p>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Código de Nota de Crédito</label>
              <input
                placeholder="Ej: NC-0001"
                value={codigoNC}
                style={{ width: '100%', textTransform: 'uppercase', fontWeight: 700, fontSize: 16, letterSpacing: 2 }}
                onChange={async (e) => {
                  const v = e.target.value.toUpperCase();
                  setCodigoNC(v);
                  setNcEncontrada(null);
                  if (v.length >= 4) {
                    const nc = await api<any>(`/notas-credito/codigo/${v}`, token).catch(() => null);
                    if (nc && nc.estado === 'activo') {
                      setNcEncontrada(nc);
                    }
                  }
                }}
              />
            </div>
            {ncEncontrada && (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, color: '#15803d', fontSize: 15 }}>✅ {ncEncontrada.numero} — Válida</div>
                <div style={{ fontSize: 13, color: '#166534' }}>Cliente: {ncEncontrada.cliente_nombre}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#15803d', marginTop: 4 }}>Saldo disponible: RD$ {Number(ncEncontrada.monto_restante).toFixed(2)}</div>
              </div>
            )}
            {codigoNC.length >= 4 && !ncEncontrada && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 12, color: '#dc2626', fontSize: 13 }}>
                ✗ Nota de Crédito no encontrada o ya utilizada
              </div>
            )}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 4, fontSize: 13 }}>Notas de Crédito activas de clientes:</label>
              <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                {notasCredito.filter((nc: any) => nc.estado === 'activo').slice(0, 20).map((nc: any) => (
                  <div key={nc.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', background: ncEncontrada?.id === nc.id ? '#f0fdf4' : 'white' }}
                    onClick={() => { setCodigoNC(nc.numero); setNcEncontrada(nc); }}>
                    <div>
                      <strong style={{ fontSize: 13 }}>{nc.numero}</strong>
                      <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 8 }}>{nc.cliente_nombre}</span>
                    </div>
                    <strong style={{ color: '#15803d', fontSize: 13 }}>RD$ {Number(nc.monto_restante).toFixed(2)}</strong>
                  </div>
                ))}
                {notasCredito.filter((nc: any) => nc.estado === 'activo').length === 0 && (
                  <div style={{ padding: '12px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No hay notas de crédito activas</div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" disabled={!ncEncontrada} onClick={() => {
                if (!ncEncontrada) { toast('error', 'Selecciona una NC válida'); return; }
                if (clienteId && ncEncontrada.cliente_id !== clienteId) {
                  toast('error', 'Esta NC pertenece a otro cliente');
                  return;
                }
                setModalAplicarNC(false);
                toast('ok', `NC ${ncEncontrada.numero} seleccionada — RD$ ${Number(ncEncontrada.monto_restante).toFixed(2)} disponibles`);
              }}>✓ Usar esta NC</button>
              <button className="btn btn-ghost" onClick={() => { setModalAplicarNC(false); setNcEncontrada(null); setFormaPago('efectivo'); }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}


      {cajaChecklistModal && (
        <div className="modal-overlay" onClick={() => setCajaChecklistModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760 }}>
            <h3>✅ Validación física en caja</h3>
            <table className="table-premium">
              <thead><tr><th>Producto</th><th>Cantidad</th><th>P/U</th><th>Total</th><th>OK</th></tr></thead>
              <tbody>
                {cajaChecklistModal.items?.map((it: any) => (
                  <tr key={it.check_id}>
                    <td>{it.descripcion}</td>
                    <td>{it.cantidad}</td>
                    <td>RD$ {Number(it.precio_unitario).toFixed(2)}</td>
                    <td>RD$ {Number(it.subtotal_linea).toFixed(2)}</td>
                    <td>{it.confirmado ? '✔' : <button className="btn btn-primary" onClick={() => confirmarItemCaja(cajaChecklistModal.venta_id, it.check_id).catch((e) => toast('error', e.message))}>Confirmar</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {cajaCobrarModal && (() => {
        const ventaTotal = Number(cajaCobrarModal.total ?? 0);
        const recibNum = parseFloat(cajaMontoRecibido) || 0;
        const mixtoEfectivo = Math.max(0, Number(cajaMixtoEfectivo || 0));
        const mixtoOtroMonto = Math.max(0, ventaTotal - mixtoEfectivo);
        const efectivoEsperado = cajaTipoPago === 'mixto' ? mixtoEfectivo : ventaTotal;
        const vueltoCaja = (cajaTipoPago === 'efectivo' || cajaTipoPago === 'mixto') ? Math.max(0, recibNum - efectivoEsperado) : 0;
        return (
          <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setCajaCobrarModal(null); }}>
            <div className="modal-card" style={{ maxWidth: 420 }}>
              <div className="modal-header">
                <h3>💳 Cobrar venta {cajaCobrarModal.numero_interno}</h3>
                <button className="btn btn-ghost" onClick={() => setCajaCobrarModal(null)}>✕</button>
              </div>
              <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
                <div style={{ fontSize: 13 }}>Cliente: <strong>{cajaCobrarModal.cliente_nombre || 'S/Cliente'}</strong></div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#1e40af', marginTop: 4 }}>Total: RD$ {ventaTotal.toFixed(2)}</div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Forma de pago:</label>
                <select value={cajaTipoPago} onChange={(e) => { const v=e.target.value; setCajaTipoPago(v); setCajaMontoRecibido(''); if (v==='mixto') setCajaMixtoEfectivo(ventaTotal.toFixed(2)); }} style={{ width: '100%' }}>
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="mixto">Mixto</option>
                </select>
              </div>

              {cajaTipoPago === 'mixto' && (
                <div style={{ marginBottom: 14, border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>
                  <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Efectivo aplicado:</label>
                  <input type="number" min={0} max={ventaTotal} step="0.01" value={cajaMixtoEfectivo}
                    onChange={(e) => { const val = Math.max(0, Math.min(ventaTotal, Number(e.target.value || 0))); setCajaMixtoEfectivo(val.toFixed(2)); setCajaMontoRecibido(val.toFixed(2)); }}
                    style={{ width: '100%', marginBottom: 8 }} />
                  <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Otra forma de pago:</label>
                  <select value={cajaMixtoOtroTipo} onChange={(e) => setCajaMixtoOtroTipo(e.target.value)} style={{ width: '100%', marginBottom: 8 }}>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="transferencia">Transferencia</option>
                  </select>
                  <div style={{ fontSize: 14 }}>Monto automático {cajaMixtoOtroTipo}: <strong>RD$ {money(mixtoOtroMonto)}</strong></div>
                </div>
              )}

              {(cajaTipoPago === 'efectivo' || cajaTipoPago === 'mixto') && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>💵 Monto recibido en efectivo:</label>
                  <input
                    type="number"
                    min={0}
                    step="50"
                    placeholder={`Mín. ${money(efectivoEsperado)}`}
                    value={cajaMontoRecibido}
                    onChange={(e) => setCajaMontoRecibido(e.target.value)}
                    autoFocus
                    style={{ width: '100%', fontSize: 22, fontWeight: 800, textAlign: 'right', padding: '8px 10px' }}
                  />
                  {vueltoCaja > 0 && (
                    <div style={{ background: '#f0fdf4', border: '2px solid #86efac', borderRadius: 8, padding: '10px 16px', marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>💵 Vuelto:</span>
                      <strong style={{ color: '#15803d', fontSize: 24 }}>RD$ {vueltoCaja.toFixed(2)}</strong>
                    </div>
                  )}
                  {recibNum > 0 && recibNum < efectivoEsperado && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '6px 10px', marginTop: 6, color: '#dc2626', fontSize: 12 }}>
                      ⚠️ Monto insuficiente — faltan RD$ {money(efectivoEsperado - recibNum)}
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={async () => {
                  if (cajaTipoPago === 'efectivo' && recibNum < ventaTotal) {
                    toast('error', `Monto recibido insuficiente. Faltan RD$ ${(ventaTotal - recibNum).toFixed(2)}`);
                    return;
                  }
                  if (cajaTipoPago === 'mixto' && (mixtoEfectivo <= 0 || mixtoEfectivo >= ventaTotal)) {
                    toast('error', 'En mixto el efectivo debe ser mayor a 0 y menor al total');
                    return;
                  }
                  if (cajaTipoPago === 'mixto' && recibNum < mixtoEfectivo) {
                    toast('error', `Monto recibido insuficiente para el efectivo mixto. Faltan RD$ ${money(mixtoEfectivo - recibNum)}`);
                    return;
                  }
                  try {
                    const printWin = (qzIsConnected() && qzPrinterFactura) ? null : window.open('', '_blank', 'width=420,height=900');
                    await api(`/ventas/${cajaCobrarModal.id}/cobrar`, token, {
                      method: 'POST',
                      body: JSON.stringify({
                        tipo_pago: cajaTipoPago,
                        monto_efectivo: cajaTipoPago === 'efectivo' ? ventaTotal : (cajaTipoPago === 'mixto' ? mixtoEfectivo : 0),
                        monto_tarjeta: cajaTipoPago === 'tarjeta' ? ventaTotal : (cajaTipoPago === 'mixto' && cajaMixtoOtroTipo === 'tarjeta' ? mixtoOtroMonto : 0),
                        monto_transferencia: cajaTipoPago === 'transferencia' ? ventaTotal : (cajaTipoPago === 'mixto' && cajaMixtoOtroTipo === 'transferencia' ? mixtoOtroMonto : 0),
                        monto_recibido: cajaTipoPago === 'efectivo' ? recibNum : (cajaTipoPago === 'mixto' ? Math.max(recibNum, mixtoEfectivo) : 0),
                      }),
                    });
                    if (vueltoCaja > 0) toast('ok', `✅ Cobrada — Vuelto: RD$ ${vueltoCaja.toFixed(2)}`);
                    else toast('ok', `✅ Venta ${cajaCobrarModal.numero_interno} cobrada`);
                    await imprimirFacturaVenta(cajaCobrarModal.id, cajaTipoPago, cajaTipoPago === 'mixto' ? ventaTotal : ((cajaTipoPago === 'efectivo') ? recibNum : ventaTotal), vueltoCaja, printWin);
                    setCajaCobrarModal(null);
                    await cargarTodo();
                  } catch (e: any) {
                    toast('error', e.message);
                  }
                }}>✅ Confirmar cobro</button>
                <button className="btn btn-ghost" onClick={() => setCajaCobrarModal(null)}>Cancelar</button>
              </div>
            </div>
          </div>
        );
      })()}

      {modalNcDiferencia && (() => {
        const difVal = Number(modalNcDiferencia.diferencia);
        const ncVal = Number(modalNcDiferencia.monto_nc);
        const recibidoNum = parseFloat((modalNcDiferencia as any)._recibido || String(difVal)) || difVal;
        const vueltoNc = formaPagoComplementario === 'efectivo' ? Math.max(0, recibidoNum - difVal) : 0;
        return (
          <div className="modal-backdrop">
            <div className="modal-card" style={{ maxWidth: 440 }}>
              <div className="modal-header">
                <h3>⚠️ Saldo insuficiente en NC — Cobro complementario</h3>
              </div>
              <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
                <div>📄 NC cubrió: <strong>RD$ {ncVal.toFixed(2)}</strong></div>
                <div style={{ marginTop: 4 }}>💳 Pendiente a cobrar: <strong style={{ color: '#dc2626', fontSize: 15 }}>RD$ {difVal.toFixed(2)}</strong></div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Cobrar diferencia con:</label>
                <select value={formaPagoComplementario} onChange={(e) => setFormaPagoComplementario(e.target.value)} style={{ width: '100%' }}>
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="transferencia">Transferencia</option>
                </select>
              </div>
              {formaPagoComplementario === 'efectivo' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Monto recibido en efectivo:</label>
                  <input
                    type="number"
                    min={difVal}
                    step="50"
                    value={(modalNcDiferencia as any)._recibido ?? difVal.toFixed(2)}
                    onChange={(e) => setModalNcDiferencia({ ...modalNcDiferencia, _recibido: e.target.value })}
                    style={{ width: '100%', fontSize: 18, fontWeight: 700, textAlign: 'right' }}
                  />
                  {vueltoNc > 0 && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, padding: '8px 12px', marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600 }}>💵 Vuelto:</span>
                      <strong style={{ color: '#15803d', fontSize: 18 }}>RD$ {vueltoNc.toFixed(2)}</strong>
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={async () => {
                  const recib = parseFloat((modalNcDiferencia as any)._recibido || String(difVal)) || difVal;
                  if (formaPagoComplementario === 'efectivo' && recib < difVal) {
                    toast('error', `Monto recibido (${recib.toFixed(2)}) es menor que la diferencia (${difVal.toFixed(2)})`);
                    return;
                  }
                  try {
                    const printWin = (qzIsConnected() && qzPrinterFactura) ? null : window.open('', '_blank', 'width=420,height=900');
                    await api(`/ventas/${modalNcDiferencia.venta_id}/cobrar`, token, {
                      method: 'POST',
                      body: JSON.stringify({
                        tipo_pago: formaPagoComplementario,
                        monto_nota_credito: ncVal,
                        monto_efectivo: formaPagoComplementario === 'efectivo' ? difVal : 0,
                        monto_tarjeta: formaPagoComplementario === 'tarjeta' ? difVal : 0,
                        monto_transferencia: formaPagoComplementario === 'transferencia' ? difVal : 0,
                        monto_recibido: formaPagoComplementario === 'efectivo' ? recib : 0,
                      }),
                    });
                    if (vueltoNc > 0) toast('ok', `✅ Cobro registrado — Vuelto: RD$ ${vueltoNc.toFixed(2)}`);
                    else toast('ok', '✅ Pago complementario registrado');
                    await imprimirFacturaVenta(modalNcDiferencia.venta_id, formaPagoComplementario, formaPagoComplementario === 'efectivo' ? recibidoNum : difVal, vueltoNc, printWin);
                    setModalNcDiferencia(null);
                    await cargarTodo();
                  } catch (e: any) {
                    toast('error', e.message);
                  }
                }}>✅ Confirmar cobro</button>
                <button className="btn btn-ghost" onClick={() => setModalNcDiferencia(null)}>Cancelar</button>
              </div>
            </div>
          </div>
        );
      })()}

      {(modulo === 'caja' || modulo === 'mayorista') && (
        <article className="panel-card">
          <div className="panel-head">
            <h3>Bandeja caja y cobros</h3>
            <span className="chip chip-warning">{pendientes.length} pendientes</span>
          </div>
          <table className="table-premium">
            <thead><tr><th>Turno</th><th>Cliente</th><th>Tipo factura</th><th>Fiscal</th><th>Total</th><th>Sucursal</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {pendientes.length === 0 ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24 }}>No hay ventas pendientes en caja</td></tr> : pendientes.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.numero_interno}</strong></td>
                  <td>{p.cliente_nombre}</td>
                  <td>{String(p.tipo_comprobante || 'consumidor_final').replaceAll('_',' ')}</td>
                  <td>{p.tipo_comprobante && p.tipo_comprobante !== 'consumidor_final' ? `${p.fiscal_empresa || p.cliente_nombre} / ${p.fiscal_rnc || '-'}` : '-'}</td>
                  <td>RD$ {Number(p.total).toFixed(2)}</td>
                  <td>{p.sucursal_nombre || p.sucursal_id || '-'}</td>
                  <td>{p.estado}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    {p.estado === 'enviada_a_caja' && <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => tomarVentaCaja(p.id).catch((e) => toast('error', e.message))}>Tomar</button>}
                    {p.estado === 'lista_para_cobro' && <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => cobrarVentaCaja(p)}>Cobrar</button>}
                    {p.estado === 'en_revision_caja' && <span className="chip chip-warning">En revisión</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      )}

      {modulo === 'revendedor' && usuario.rol === 'revendedor' && (
        <article className="panel-card span-12">
          <div className="panel-head">
            <h3>Catálogo Revendedor (Tablet)</h3>
            <span className="chip chip-soft">Pedido en calle</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 14 }}>
            <div>
              <label>Buscar cliente</label>
              <input
                list="rev-clientes-options"
                value={revClienteBuscar}
                onChange={(e) => {
                  const val = e.target.value;
                  setRevClienteBuscar(val);
                  const match = clientesRev.find((c: any) => `${c.codigo} · ${c.nombre}` === val || c.nombre?.toLowerCase() === val.toLowerCase() || c.codigo?.toLowerCase() === val.toLowerCase());
                  if (match) setRevClienteId(match.id);
                }}
                placeholder="Código, nombre o teléfono"
              />
              <datalist id="rev-clientes-options">
                {clientesRev.map((c: any) => (
                  <option key={c.id} value={`${c.codigo} · ${c.nombre}`}>{c.telefono_1 || c.telefono || ''}</option>
                ))}
              </datalist>
              <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => { setNuevoCliente({ ...NUEVOCLUB_BLANK, codigo: autoCodigoCliente(clientes), nombre: revClienteBuscar || '' }); setModalCliente(true); }}>+ Crear cliente nuevo</button>
            </div>
            <div>
              <label>Pago recibido en calle</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                <input type="checkbox" checked={revPagoRegistrado} onChange={(e) => setRevPagoRegistrado(e.target.checked)} />
                <span>Marcar como pagado</span>
              </div>
              <div style={{ marginTop: 12, fontSize: 13, color: '#475569' }}>Cliente seleccionado: <strong>{clientes.find((c) => c.id === revClienteId)?.nombre || '—'}</strong></div>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <label>Buscar productos</label>
            <input value={buscarProducto} onChange={(e) => setBuscarProducto(e.target.value)} placeholder="Código / nombre / marca" />
            {revProductoInfoCard && (
              <div className="producto-info-card" style={{ marginTop: 10 }}>
                <button className="btn-close-info" onClick={() => setRevProductoInfoCard(null)}>✕</button>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {revProductoInfoCard.imagen_url
                    ? <img src={imgSrc(revProductoInfoCard.imagen_url)} alt={revProductoInfoCard.nombre} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid #e0e0e0' }} />
                    : <div style={{ width: 64, height: 64, background: '#f0f0f0', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#999', textAlign: 'center' }}>Sin imagen</div>}
                  <div>
                    <strong>{revProductoInfoCard.nombre}</strong>
                    <div className="producto-info-detalles" style={{ marginTop: 4 }}>
                      <span>📍 Ubicación: <strong>{revProductoInfoCard.ubicacion || 'Sin ubicación'}</strong></span>
                      <span>📦 Existencia: <strong>{Number(revProductoInfoCard.existencia || 0).toFixed(2)}</strong></span>
                      <span>💰 Precio activo: <strong>RD$ {money(precioRevActual(revProductoInfoCard))}</strong></span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10, marginTop: 10 }}>
              {productosRevendedor.map((p: any) => (
                <button
                  key={p.id}
                  className="btn btn-ghost"
                  style={{ textAlign: 'left', padding: 10, display: 'grid', gap: 6 }}
                  onClick={() => setRevProductoInfoCard(p)}
                  onDoubleClick={() => abrirModalCantidadRevendedor(p)}
                  title="1 clic: ver precio/existencia · 2 clics: pedir cantidad"
                >
                  {p.imagen_url
                    ? <img src={imgSrc(p.imagen_url)} alt={p.nombre} style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 8 }} />
                    : <div style={{ width: '100%', height: 90, background: '#e2e8f0', borderRadius: 8, display: 'grid', placeItems: 'center', color: '#64748b', fontSize: 12 }}>Sin imagen</div>}
                  <strong>{p.nombre}</strong>
                  <div style={{ fontSize: 12, color: '#475569', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span>{p.marca || '-'} · Exis: {Number(p.existencia || 0).toFixed(0)}</span>
                    <span
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        togglePrecioRevendedor(String(p.id));
                      }}
                      title="Doble clic para alternar entre precio negocios #1 y #2"
                      style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '3px 8px', background: usaPrecioNegocio2(String(p.id)) ? '#fff7ed' : '#f8fafc', fontWeight: 700 }}
                    >
                      RD$ {money(precioRevActual(p))}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <button
            className="btn btn-primary"
            style={{ position: 'fixed', right: 22, bottom: 22, borderRadius: 999, padding: '12px 18px', zIndex: 40, boxShadow: '0 10px 24px rgba(2,12,36,.25)' }}
            onClick={() => setRevCarritoAbierto(true)}
          >
            🛒 Pedido ({revCarrito.length}) · RD$ {money(revCarrito.reduce((a, i) => a + Number(i.cantidad) * Number(i.precio_unitario), 0))}
          </button>
        </article>
      )}

      {modulo === 'revendedor' && revCarritoAbierto && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setRevCarritoAbierto(false); }}>
          <div className="modal-card" style={{ maxWidth: 760 }}>
            <div className="modal-header">
              <h3>🛒 Resumen del pedido</h3>
              <button className="btn btn-ghost" onClick={() => setRevCarritoAbierto(false)}>✕</button>
            </div>
            <table className="table-premium">
              <thead><tr><th>Producto</th><th>Cant</th><th>Precio</th><th>Total</th></tr></thead>
              <tbody>
                {revCarrito.length === 0 ? <tr><td colSpan={4} style={{ textAlign: 'center' }}>Sin productos</td></tr> : revCarrito.map((i: any, idx: number) => (
                  <tr key={idx}>
                    <td>{i.descripcion}</td>
                    <td><input type="number" min={1} value={i.cantidad} onChange={(e) => setRevCarrito((prev) => prev.map((x, j) => j === idx ? { ...x, cantidad: Math.max(1, Number(e.target.value || 1)) } : x))} /></td>
                    <td>RD$ {money(Number(i.precio_unitario))}</td>
                    <td>RD$ {money(Number(i.cantidad) * Number(i.precio_unitario))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
              <strong>Total: RD$ {money(revCarrito.reduce((a, i) => a + Number(i.cantidad) * Number(i.precio_unitario), 0))}</strong>
              <button className="btn btn-primary" onClick={() => crearOrdenRevendedor().then(() => setRevCarritoAbierto(false)).catch((e) => toast('error', e.message))}>Confirmar y enviar pedido</button>
            </div>
          </div>
        </div>
      )}

      {modalCantidadRevProducto && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setModalCantidadRevProducto(null); }}>
          <div className="modal-card" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>Agregar producto al pedido</h3>
              <button className="btn btn-ghost" onClick={() => setModalCantidadRevProducto(null)}>✕</button>
            </div>
            <div style={{ marginBottom: 10 }}>
              <strong>{modalCantidadRevProducto.nombre}</strong>
              <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 13 }}>
                📍 {modalCantidadRevProducto.ubicacion || 'Sin ubicación'} · 📦 {Number(modalCantidadRevProducto.existencia || 0).toFixed(2)} · 💰 RD$ {money(precioRevActual(modalCantidadRevProducto))}
              </div>
            </div>
            <div>
              <label>Cantidad solicitada</label>
              <input
                autoFocus
                type="number"
                min={1}
                value={cantidadRevProductoSeleccionada}
                onChange={(e) => setCantidadRevProductoSeleccionada(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmarAgregarCantidadRevendedor(); }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setModalCantidadRevProducto(null)}>Cancelar</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={confirmarAgregarCantidadRevendedor}>Agregar</button>
            </div>
          </div>
        </div>
      )}

      {modulo === 'ordenes' && usuario.rol === 'vendedor' && (
        <article className="panel-card span-12">
          <div className="panel-head">
            <h3>Órdenes asignadas</h3>
            <span className="chip chip-soft">{ordenes.filter((o: any) => !['buscada_completa','en_verificacion','empacando','verificada','completada'].includes(o.estado)).length} órdenes</span>
          </div>
          {ordenes.filter((o: any) => !['buscada_completa','en_verificacion','empacando','verificada','completada'].includes(o.estado)).length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No tienes órdenes pendientes en este momento.</p>
          )}
          {ordenes.filter((o: any) => !['buscada_completa','en_verificacion','empacando','verificada','completada'].includes(o.estado)).map((o: any) => (
            <div key={o.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <strong style={{ fontSize: 16 }}>{o.numero_orden}</strong>
                  <span style={{ marginLeft: 12, color: 'var(--muted)' }}>{o.cliente_nombre}</span>
                </div>
                <span className={`chip chip-${o.estado === 'buscada' ? 'verde' : 'warning'}`}>{String(o.estado).replace(/_/g, ' ')}</span>
              </div>
              <button className="btn btn-ghost" style={{ marginBottom: 10 }} onClick={async () => {
                if (ordenSeleccionada?.id === o.id) { setOrdenSeleccionada(null); setPickerItems([]); }
                else { setOrdenSeleccionada(o); await cargarPickerView(o.id); }
              }}>
                {ordenSeleccionada?.id === o.id ? 'Ocultar checklist' : '📋 Ver checklist de búsqueda'}
              </button>
              {ordenSeleccionada?.id === o.id && (
                <table className="table-premium">
                  <thead><tr><th>Encontrado</th><th>Producto</th><th>Marca</th><th>Cant.</th><th>Ubicación</th></tr></thead>
                  <tbody>
                    {pickerItems.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center' }}>Sin items</td></tr>}
                    {pickerItems.map((it: any) => (
                      <tr key={it.id} style={{ background: it.encontrado ? '#f0fdf4' : undefined }}>
                        <td style={{ textAlign: 'center' }}>
                          <input type="checkbox" checked={!!it.encontrado} style={{ width: 18, height: 18, cursor: it.encontrado ? 'default' : 'pointer' }} onChange={async (e) => {
                            if (!e.target.checked || it.encontrado) return;
                            await api(`/orders/${o.id}/items/${it.id}/found`, token, { method: 'POST' });
                            await cargarPickerView(o.id);
                            await cargarTodo();
                          }} />
                        </td>
                        <td style={{ textDecoration: it.encontrado ? 'line-through' : undefined, color: it.encontrado ? 'var(--muted)' : undefined }}>{it.descripcion}</td>
                        <td>{it.marca || '-'}</td>
                        <td>{it.cantidad}</td>
                        <td>{it.ubicacion || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {ordenSeleccionada?.id === o.id && pickerItems.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                    {pickerItems.filter((i: any) => i.encontrado).length} de {pickerItems.length} items encontrados
                  </span>
                  {pickerItems.length > 0 && pickerItems.every((i: any) => i.encontrado) && (
                    <button className="btn btn-primary" style={{ padding: '6px 16px', fontSize: 13 }} onClick={async () => {
                      try {
                        await api(`/orders/${o.id}/completar-busqueda`, token, { method: 'POST' });
                        toast('ok', 'Orden marcada como completada');
                        setOrdenSeleccionada(null);
                        setPickerItems([]);
                        await cargarTodo();
                      } catch (er: any) { toast('error', er.message); }
                    }}>
                      ✓ Marcar búsqueda como completada
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </article>
      )}

      {modulo === 'ordenes' && usuario.rol !== 'vendedor' && (() => {
        const estadoChip: Record<string, string> = {
          creada: 'chip-warning', en_busqueda: 'chip-warning', buscada: 'chip-soft',
          buscada_completa: 'chip-soft', en_verificacion: 'chip-primary', empacando: 'chip-primary',
          verificada: 'chip-verde', completada: 'chip-verde',
          en_camino: 'chip-primary', entregado: 'chip-verde',
        };
        const estadoLabel: Record<string, string> = {
          creada: 'Creada', en_busqueda: 'En búsqueda', buscada: 'Buscada',
          buscada_completa: 'Búsqueda completa', en_verificacion: 'En verificación',
          empacando: 'Empacando', verificada: 'Verificada', completada: 'Completada',
          en_camino: 'En camino', entregado: 'Entregado',
        };
        const avanzarEstado = async (o: any, nuevoEstado: string) => {
          try {
            await api(`/orders/${o.id}/cambiar-estado`, token, { method: 'POST', body: JSON.stringify({ estado: nuevoEstado }) });
            toast('ok', `Estado → ${estadoLabel[nuevoEstado] ?? nuevoEstado}`);
            await cargarTodo();
          } catch (er: any) { toast('error', er.message); }
        };
        return (
        <article className="panel-card span-12">
          <div className="panel-head">
            <h3>Órdenes / Pedidos</h3>
            <span className="chip chip-soft">{ordenes.length} órdenes</span>
          </div>
          <table className="table-premium">
            <thead>
              <tr>
                <th>Orden</th><th>Cliente</th><th>Vendedor</th>
                <th>Estado</th><th>Bultos</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ordenes.length === 0
                ? <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)' }}>Sin órdenes</td></tr>
                : ordenes.map((o: any) => (
                <tr key={o.id}>
                  <td><strong style={{ fontSize: 13 }}>{o.numero_orden}</strong></td>
                  <td>{o.cliente_nombre}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 12 }}>{o.usuario_creador}</td>
                  <td>
                    <span className={`chip ${estadoChip[o.estado] ?? 'chip-soft'}`} style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                      {estadoLabel[o.estado] ?? o.estado}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {Number(o.total_bultos) > 0
                      ? <span title={`Bultos: ${o.bultos_lista}`}>📦 {o.total_bultos} ({o.bultos_lista})</span>
                      : <span style={{ color: 'var(--muted)' }}>—</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                      {(usuario.rol === 'cajero' || usuario.rol === 'administrador') && <>
                        {o.estado === 'creada' && (
                          <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }}
                            onClick={() => avanzarEstado(o, 'en_busqueda')}>▶ Iniciar búsqueda</button>
                        )}
                        {o.estado === 'en_busqueda' && (
                          <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }}
                            onClick={() => avanzarEstado(o, 'buscada')}>✓ Marcar buscada</button>
                        )}
                        {(o.estado === 'buscada' || o.estado === 'buscada_completa') && (
                          <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 12 }}
                            onClick={() => avanzarEstado(o, 'en_verificacion')}>→ En verificación</button>
                        )}
                        {(o.estado === 'en_verificacion' || o.estado === 'empacando') && (
                          <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 12 }}
                            onClick={() => avanzarEstado(o, 'verificada')}>✓ Verificada</button>
                        )}
                        {o.estado === 'verificada' && (
                          <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 12, background: '#16a34a' }}
                            onClick={() => avanzarEstado(o, 'completada')}>✅ Completar</button>
                        )}
                        {o.estado === 'completada' && choferes.length > 0 && (
                          <>
                            <select value={choferSeleccionado[o.id] ?? ''} style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #d1d5db' }}
                              onChange={(e) => setChoferSeleccionado(prev => ({ ...prev, [o.id]: e.target.value }))}>
                              <option value="">🚗 Elegir chofer...</option>
                              {choferes.map((c: any) => <option key={c.id} value={c.id}>{c.nombre_completo}</option>)}
                            </select>
                            {choferSeleccionado[o.id] && (
                              <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 12, background: '#0284c7' }}
                                onClick={async () => {
                                  try {
                                    await api(`/orders/${o.id}/enviar-chofer`, token, { method: 'POST', body: JSON.stringify({ chofer_id: choferSeleccionado[o.id] }) });
                                    toast('ok', 'Orden enviada al chofer');
                                    setChoferSeleccionado(prev => { const n = { ...prev }; delete n[o.id]; return n; });
                                    await cargarTodo();
                                  } catch (er: any) { toast('error', er.message); }
                                }}>🚗 Enviar</button>
                            )}
                          </>
                        )}
                        {o.estado === 'en_camino' && (
                          <>
                            <span style={{ fontSize: 11, color: '#0284c7' }}>🚗 {o.chofer_nombre ?? '—'}</span>
                            <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 12, background: '#16a34a' }}
                              onClick={async () => {
                                try {
                                  await api(`/orders/${o.id}/entregado`, token, { method: 'POST' });
                                  toast('ok', 'Entrega confirmada');
                                  await cargarTodo();
                                } catch (er: any) { toast('error', er.message); }
                              }}>✅ Entregado</button>
                          </>
                        )}
                        {!['completada','en_camino','entregado'].includes(o.estado) && (
                          <select defaultValue="" style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #d1d5db' }}
                            onChange={(e) => {
                              if (!e.target.value) return;
                              api(`/orders/${o.id}/asignar-picker`, token, { method: 'POST', body: JSON.stringify({ picker_usuario_id: e.target.value }) })
                                .then(() => { toast('ok', 'Empleado asignado'); cargarTodo(); })
                                .catch((er: any) => toast('error', er.message));
                            }}>
                            <option value="">👤 Asignar...</option>
                            {pickers.map((p: any) => <option key={p.id} value={p.id}>{p.nombre_completo}{p.rol ? ` (${p.rol})` : ''}</option>)}
                          </select>
                        )}
                      </>}
                      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }}
                        onClick={async () => {
                          if (ordenSeleccionada?.id === o.id) { setOrdenSeleccionada(null); setPickerItems([]); }
                          else { setOrdenSeleccionada(o); await cargarPickerView(o.id); }
                        }}>
                        {ordenSeleccionada?.id === o.id ? 'Ocultar' : '📋 Items'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {ordenSeleccionada && (
            <div style={{ marginTop: 14, border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h4 style={{ margin: 0 }}>Items · {ordenSeleccionada.numero_orden}</h4>
                <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }}
                  onClick={() => { setOrdenSeleccionada(null); setPickerItems([]); }}>✕ Cerrar</button>
              </div>
              <table className="table-premium">
                <thead><tr><th>Producto</th><th>Marca</th><th>Cant.</th><th>Ubicación</th><th>Encontrado</th></tr></thead>
                <tbody>
                  {pickerItems.length === 0
                    ? <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)' }}>Sin items</td></tr>
                    : pickerItems.map((it: any) => (
                    <tr key={it.id} style={{ background: it.encontrado ? '#f0fdf4' : undefined }}>
                      <td style={{ textDecoration: it.encontrado ? 'line-through' : undefined, color: it.encontrado ? 'var(--muted)' : undefined }}>{it.descripcion}</td>
                      <td>{it.marca || '-'}</td><td>{it.cantidad}</td><td>{it.ubicacion || '-'}</td>
                      <td>
                        <input type="checkbox" checked={!!it.encontrado} onChange={async (e) => {
                          if (!e.target.checked) return;
                          await api(`/orders/${ordenSeleccionada.id}/items/${it.id}/found`, token, { method: 'POST' });
                          await cargarPickerView(ordenSeleccionada.id);
                          await cargarTodo();
                        }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
        );
      })()}

      {modulo === 'pendiente-verificar' && (usuario.rol === 'cajero' || usuario.rol === 'administrador' || tieneCapacidad('can_verify')) && (() => {
        const pendientes = ordenes.filter((o: any) => ['buscada','buscada_completa','en_verificacion','pendiente_verificacion','empacando'].includes(o.estado));
        const bultoAbierto = !!bundleActual;
        const ordenDelBulto = bultoAbierto ? pendientes.find((o: any) => o.id === bundleActual!.orderId) ?? null : null;
        const itemsOrdenActual: any[] = ordenDelBulto ? (ordenItemsCache[ordenDelBulto.id] ?? []) : [];
        const totalUnidadesBulto = bultoItems.reduce((s: number, bi: any) => s + Number(bi.cantidad_en_bulto), 0);
        return (
          <article className="panel-card">
            <div className="panel-head"><h3>Pendiente verificar</h3><span className="chip chip-warning">{pendientes.length}</span></div>

            {/* ── Sin bulto abierto: lista de órdenes con botón por orden ── */}
            {!bultoAbierto && (
              <>
                {pendientes.length === 0 && (
                  <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 32 }}>No hay órdenes pendientes de verificación.</p>
                )}
                {pendientes.map((o: any) => (
                  <div key={o.id} style={{ border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '12px 16px', marginBottom: 10, background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong style={{ fontSize: 15 }}>{o.numero_orden}</strong>
                      <span style={{ marginLeft: 10, color: 'var(--muted)' }}>{o.cliente_nombre}</span>
                      <span className="chip chip-verde" style={{ fontSize: 11, marginLeft: 10 }}>{String(o.estado).replace(/_/g,' ')}</span>
                    </div>
                    <button className="btn btn-primary" style={{ padding: '7px 20px', fontSize: 13 }} onClick={async () => {
                      try {
                        await api(`/orders/${o.id}/verificar/iniciar`, token, { method: 'POST' }).catch(() => {});
                        const b = await api<any>(`/orders/${o.id}/bundles`, token, { method: 'POST' });
                        setBundleActual({ orderId: o.id, ...b });
                        setBultoItems([]);
                        await cargarOrdenItemsPendientes(o.id);
                        toast('ok', `📦 Bulto #${b.numero_bulto} abierto — ${o.numero_orden}`);
                        await cargarTodo();
                      } catch (er: any) { toast('error', er.message); }
                    }}>📦 Abrir bulto</button>
                  </div>
                ))}
              </>
            )}

            {/* ── Bulto abierto: vista dividida ── */}
            {bultoAbierto && ordenDelBulto && (
              <>
                {/* Barra de encabezado del bulto */}
                <div style={{ background: '#1e3a8a', color: '#fff', borderRadius: 8, padding: '10px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 22 }}>📦</span>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>Bulto #{bundleActual!.numero_bulto}</span>
                  <span style={{ opacity: 0.8, fontSize: 14 }}>— {ordenDelBulto.numero_orden} · {ordenDelBulto.cliente_nombre}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.75 }}>{bultoItems.length} art. · {totalUnidadesBulto} unid.</span>
                </div>

                {/* Grid 2 columnas */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>

                  {/* IZQUIERDA: artículos de la orden */}
                  <div>
                    <h4 style={{ margin: '0 0 10px', color: '#1e3a8a', fontSize: 14 }}>Artículos de {ordenDelBulto.numero_orden}</h4>
                    {itemsOrdenActual.length === 0 && (
                      <p style={{ color: 'var(--muted)', padding: 16, textAlign: 'center', fontSize: 13 }}>Cargando artículos...</p>
                    )}
                    {itemsOrdenActual.map((it: any) => {
                      const enCerrados = Number(it.en_bultos_cerrados);
                      const enAbierto  = Number(it.en_bulto_abierto);
                      const total      = Number(it.cantidad_total);
                      const pendiente  = Math.max(0, total - enCerrados - enAbierto);
                      const completado = enCerrados >= total;
                      const enEsteBulto = bultoItems.find((bi: any) => bi.order_item_id === it.id);
                      const qty = bultoQtys[it.id] ?? String(pendiente);
                      return (
                        <div key={it.id} style={{
                          border: `1.5px solid ${completado ? '#bbf7d0' : enEsteBulto ? '#bfdbfe' : '#e5e7eb'}`,
                          borderRadius: 8, padding: '10px 14px', marginBottom: 8,
                          background: completado ? '#f0fdf4' : enEsteBulto ? '#eff6ff' : '#fff',
                          opacity: completado ? 0.6 : 1,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 13, textDecoration: completado ? 'line-through' : undefined }}>{it.descripcion}</div>
                              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                                Total: {total} · Empacado: {enCerrados} · En bulto actual: {enAbierto}
                                {completado && <span style={{ color: '#16a34a', fontWeight: 700, marginLeft: 6 }}>✓ Completo</span>}
                              </div>
                            </div>
                            {!completado && (
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <input
                                  type="number" min={1}
                                  max={pendiente + (enEsteBulto ? Number(enEsteBulto.cantidad_en_bulto) : 0)}
                                  value={qty}
                                  onChange={(e) => setBultoQtys((prev) => ({ ...prev, [it.id]: e.target.value }))}
                                  style={{ width: 60, padding: '5px 8px', border: '1.5px solid #3b82f6', borderRadius: 6, fontSize: 13, textAlign: 'center' }}
                                />
                                <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={async () => {
                                  const q = Math.max(1, Number(qty));
                                  try { await agregarItemABulto(ordenDelBulto.id, it.id, q); }
                                  catch (er: any) { toast('error', er.message); }
                                }}>{enEsteBulto ? '↺ Actualizar' : '+ Agregar'}</button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Otras órdenes (referencia) */}
                    {pendientes.filter((o: any) => o.id !== ordenDelBulto.id).length > 0 && (
                      <div style={{ marginTop: 20 }}>
                        <h4 style={{ margin: '0 0 8px', color: 'var(--muted)', fontSize: 13 }}>Otras órdenes pendientes</h4>
                        {pendientes.filter((o: any) => o.id !== ordenDelBulto.id).map((o: any) => (
                          <div key={o.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 14px', marginBottom: 6, background: '#fafafa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span><strong style={{ fontSize: 13 }}>{o.numero_orden}</strong><span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 8 }}>{o.cliente_nombre}</span></span>
                            <span className="chip chip-warning" style={{ fontSize: 10 }}>{String(o.estado).replace(/_/g,' ')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* DERECHA: panel del bulto */}
                  <div style={{ border: '2px solid #bfdbfe', borderRadius: 10, padding: 16, background: '#f8faff', position: 'sticky', top: 80 }}>
                    <h4 style={{ margin: '0 0 12px', color: '#1e3a8a', fontSize: 14 }}>Contenido del bulto</h4>
                    {bultoItems.length === 0 && (
                      <p style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', padding: '14px 0' }}>
                        Bulto vacío.<br/>Agrega artículos desde la izquierda.
                      </p>
                    )}
                    {bultoItems.map((bi: any) => (
                      <div key={bi.bundle_item_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #dbeafe' }}>
                        <span style={{ flex: 1, fontSize: 12, color: '#1e293b' }}>{bi.descripcion}</span>
                        <span style={{ fontWeight: 700, minWidth: 28, textAlign: 'center', color: '#1e3a8a', fontSize: 13 }}>×{bi.cantidad_en_bulto}</span>
                        <button onClick={async () => {
                          try { await quitarItemDeBulto(ordenDelBulto.id, bi.order_item_id); }
                          catch (er: any) { toast('error', er.message); }
                        }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 16, padding: '0 2px', lineHeight: 1 }} title="Quitar">✕</button>
                      </div>
                    ))}
                    {bultoItems.length > 0 && (
                      <div style={{ marginTop: 10, padding: '8px 0', borderTop: '2px solid #bfdbfe', display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#1e3a8a', fontWeight: 700 }}>
                        <span>Total unidades</span><span>{totalUnidadesBulto}</span>
                      </div>
                    )}
                    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <button className="btn btn-primary" style={{ width: '100%', fontSize: 14, padding: '10px 0' }} onClick={async () => {
                        if (bultoItems.length === 0) return toast('error', 'El bulto está vacío. Agrega al menos un artículo.');
                        try {
                          const r = await api<any>(`/orders/${ordenDelBulto.id}/bundles/${bundleActual!.id}/cerrar`, token, { method: 'POST' });
                          toast('ok', `Bulto #${bundleActual!.numero_bulto} cerrado`);
                          if (r?.etiqueta) imprimirEtiquetaBulto(r.etiqueta);
                          if (r?.siguiente_bulto) {
                            setBundleActual({ orderId: ordenDelBulto.id, ...r.siguiente_bulto });
                            setBultoItems([]);
                            await cargarOrdenItemsPendientes(ordenDelBulto.id);
                            toast('ok', `📦 Bulto #${r.siguiente_bulto.numero_bulto} abierto`);
                          } else {
                            setBundleActual(null); setBultoItems([]); setOrdenItemsCache({});
                          }
                          await cargarTodo();
                        } catch (er: any) { toast('error', er.message); }
                      }}>📦 Cerrar bulto</button>
                      <button className="btn btn-ghost" style={{ width: '100%', fontSize: 13 }}
                        onClick={async () => {
                          try {
                            await imprimirFacturaOrdenFinal(ordenDelBulto.id);
                            setBundleActual(null); setBultoItems([]); setOrdenItemsCache({});
                            await cargarTodo();
                          } catch (e: any) { toast('error', e.message); }
                        }}>
                        🖨️ Imprimir factura
                      </button>
                      <button style={{ width: '100%', fontSize: 12, padding: '7px 0', border: '1px solid #fecaca', borderRadius: 6, background: 'none', color: '#ef4444', cursor: 'pointer' }}
                        onClick={async () => {
                          if (!confirm('¿Cancelar este bulto y volver a la lista?')) return;
                          try {
                            await api(`/orders/${ordenDelBulto.id}/bundles/${bundleActual!.id}/cancelar`, token, { method: 'POST' }).catch(() => {});
                          } finally {
                            setBundleActual(null); setBultoItems([]); setOrdenItemsCache({});
                          }
                        }}>
                        Cancelar y volver
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </article>
        );
      })()}



      {modulo === 'dgii' && usuario.rol === 'administrador' && (
        <article className="panel-card">
          <div className="panel-head">
            <h3>Catálogo DGII RNC</h3>
            <button className="btn btn-primary" onClick={async () => { const d = await api<any>('/dgii/sync-now', token); setDgiiPanel(d); toast('ok', d.ok ? 'Catálogo actualizado' : 'No se pudo actualizar'); }}>Actualizar catálogo ahora</button>
          </div>
          <button className="btn btn-ghost" onClick={async () => setDgiiPanel(await api<any>('/dgii/status', token))}>Refrescar estado</button>
          {dgiiPanel && (
            <div style={{ marginTop: 12 }}>
              <div>Última actualización exitosa: <strong>{dgiiPanel.ultimo_ok?.inicio || '-'}</strong></div>
              <div>Total registros: <strong>{dgiiPanel.total_registros ?? 0}</strong></div>
              <div>Estado actual: <strong>{dgiiPanel.sync_en_progreso ? 'Sincronizando...' : 'En espera'}</strong></div>
              <div>Última validación inmediata: <strong>{dgiiPanel.ultima_validacion_inmediata?.inicio || '-'}</strong></div>
              <div>Último error: <strong>{dgiiPanel.ultimo_error?.mensaje_error || '-'}</strong></div>
              <h4>Historial reciente</h4>
              <table className="table-premium"><thead><tr><th>Inicio</th><th>Estado</th><th>Tipo</th><th>Formato</th><th>Error</th></tr></thead><tbody>
                {(dgiiPanel.logs || []).map((l: any) => <tr key={l.id}><td>{l.inicio}</td><td>{l.estado}</td><td>{l.tipo_ejecucion}</td><td>{l.formato}</td><td>{l.mensaje_error || '-'}</td></tr>)}
              </tbody></table>
            </div>
          )}
        </article>
      )}

      {modulo === 'ncf' && usuario.rol === 'administrador' && (
        <article className="panel-card">
          <div className="panel-head">
            <h3>Configuración de rangos de comprobantes (NCF)</h3>
            <span className="chip chip-warning">{ncfTipos.length} tipos</span>
          </div>
          <p style={{ color: 'var(--muted)', marginBottom: 12 }}>Configura el rango completo por tipo: <strong>Desde</strong> y <strong>Hasta</strong>. El sistema seguirá la secuencia automáticamente.</p>
          <table className="table-premium">
            <thead>
              <tr><th>Tipo</th><th>Prefijo</th><th>Desde</th><th>Hasta</th><th>Usados</th><th>Activo</th><th>Guardar</th></tr>
            </thead>
            <tbody>
              {ncfTipos.map((t) => {
                const row = ncfEdit[t.id] ?? {};
                return (
                  <tr key={t.id}>
                    <td>{t.nombre}</td>
                    <td><input value={row.prefijo_fiscal ?? ''} onChange={(e) => setNcfEdit((m) => ({ ...m, [t.id]: { ...row, prefijo_fiscal: e.target.value } }))} style={{ width: 100 }} /></td>
                    <td><input type="number" value={row.secuencia_inicial ?? 1} onChange={(e) => setNcfEdit((m) => ({ ...m, [t.id]: { ...row, secuencia_inicial: Number(e.target.value) } }))} style={{ width: 110 }} /></td>
                    <td><input type="number" value={row.secuencia_final ?? 1} onChange={(e) => setNcfEdit((m) => ({ ...m, [t.id]: { ...row, secuencia_final: Number(e.target.value) } }))} style={{ width: 110 }} /></td>
                    <td>{(() => { const usados = Math.max(0, Number(row.secuencia_actual ?? row.secuencia_inicial ?? 1) - Number(row.secuencia_inicial ?? 1)); const total = Math.max(1, Number(row.secuencia_final ?? 1) - Number(row.secuencia_inicial ?? 1) + 1); const pct = Math.min(100, Math.round((usados / total) * 100)); return `${usados} de ${total} (${pct}%)`; })()}</td>
                    <td>
                      <select value={String(row.activo ?? 1)} onChange={(e) => setNcfEdit((m) => ({ ...m, [t.id]: { ...row, activo: Number(e.target.value) } }))}>
                        <option value="1">Activo</option>
                        <option value="0">Inactivo</option>
                      </select>
                    </td>
                    <td><button className="btn btn-primary" onClick={() => guardarRangoNcf(t.id).catch((e) => toast('error', e.message))}>Guardar</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </article>
      )}

      {modulo === 'cxc' && (
        <article className="panel-card">
          <div className="panel-head">
            <h3>Cuentas por Cobrar — Facturas a Crédito</h3>
            <span className="chip chip-warning">{cxc.filter((x) => Number(x.balance_pendiente) > 0).length} pendientes</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8, marginBottom: 12 }}>
            {(cxcRiesgo?.resumen ?? []).map((r: any) => (
              <div key={r.score} style={{ border: '1px solid #dbe4ff', borderRadius: 10, padding: '8px 10px', background: '#f8fbff' }}>
                <div style={{ fontSize: 12, color: '#475569' }}>Grado {r.score || 'A'}</div>
                <strong style={{ fontSize: 18, color: '#1e3a8a' }}>{Number(r.clientes || 0)}</strong>
                <div style={{ fontSize: 11, color: '#64748b' }}>Límite: RD$ {money(Number(r.limite_total || 0))}</div>
              </div>
            ))}
          </div>
          {usuario.rol === 'revendedor' && (
            <div style={{ marginBottom: 12 }}>
              <label>Buscar cliente (nombre, código o teléfono)</label>
              <input
                placeholder="Ej: yimi, CLI-0001, 809..."
                value={cxcBuscarCliente}
                onChange={(e) => setCxcBuscarCliente(e.target.value)}
              />
            </div>
          )}
          <p style={{ color: 'var(--muted)', marginBottom: 12 }}>Todas las facturas emitidas a crédito con su balance actual</p>
          <table className="table-premium">
            <thead>
              <tr><th>Factura</th><th>Cliente</th><th>Fecha</th><th>Vence</th><th>Días restantes</th><th>Monto original</th><th>Balance pendiente</th><th>Estado</th><th>Cobro</th></tr>
            </thead>
            <tbody>
              {cxcFiltrado.length === 0 ? (
                <tr><td colSpan={9} className="empty" style={{ textAlign: 'center', padding: 24 }}>No hay facturas a crédito registradas</td></tr>
              ) : cxcFiltrado.map((x) => (
                <tr key={x.id}>
                  <td><strong>{x.numero_interno}</strong></td>
                  <td>{x.cliente_nombre || '-'}</td>
                  <td>{x.fecha_creacion ? String(x.fecha_creacion).substring(0, 10) : '-'}</td>
                  <td>{x.fecha_vencimiento_calculada ? String(x.fecha_vencimiento_calculada).substring(0, 10) : '-'}</td>
                  <td style={{ fontWeight: 700, color: Number(x.dias_restantes ?? 0) < 0 ? 'var(--rojo-600)' : 'var(--success)' }}>{Number(x.dias_restantes ?? 0)}</td>
                  <td>RD$ {Number(x.monto_original).toFixed(2)}</td>
                  <td style={{ color: Number(x.balance_pendiente) > 0 ? 'var(--rojo-600)' : 'var(--success)', fontWeight: 700 }}>
                    RD$ {Number(x.balance_pendiente).toFixed(2)}
                  </td>
                  <td>
                    <span className={`chip ${Number(x.balance_pendiente) > 0 ? 'chip-warning' : 'chip-lan'}`}>
                      {Number(x.balance_pendiente) > 0 ? 'Pendiente' : 'Saldado'}
                    </span>
                  </td>
                  <td>{Number(x.balance_pendiente) > 0 && <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => cobrarCuentaCxC(x).catch((e) => toast('error', e.message))}>Cobrar / Abonar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      )}

      {modulo === 'cuadrar' && (usuario.rol === 'vendedor' || usuario.rol === 'revendedor') && (
        <article className="panel-card">
          <div className="panel-head">
            <h3>⚖️ Cuadre del día</h3>
            <span className="chip chip-soft">Solo lectura</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginBottom: 14 }}>
            <div className="stat-box"><span>Total cobrado</span><strong>RD$ {money(Number(cxcCuadreDia?.totales?.monto_total ?? 0))}</strong></div>
            <div className="stat-box"><span>Efectivo</span><strong>RD$ {money(Number(cxcCuadreDia?.totales?.monto_efectivo ?? 0))}</strong></div>
            <div className="stat-box"><span>Tarjeta</span><strong>RD$ {money(Number(cxcCuadreDia?.totales?.monto_tarjeta ?? 0))}</strong></div>
            <div className="stat-box"><span>Transferencia</span><strong>RD$ {money(Number(cxcCuadreDia?.totales?.monto_transferencia ?? 0))}</strong></div>
          </div>
          <table className="table-premium">
            <thead><tr><th>Hora</th><th>Cliente</th><th>Factura</th><th>Tipo</th><th>Monto</th></tr></thead>
            <tbody>
              {(cxcCuadreDia?.pagos ?? []).length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center' }}>Sin cobros registrados hoy</td></tr>
              ) : (cxcCuadreDia.pagos || []).map((p: any) => (
                <tr key={p.id}>
                  <td>{String(p.fecha_creacion || '').substring(11, 19)}</td>
                  <td>{p.cliente_nombre || '-'}</td>
                  <td>{p.numero_interno || '-'}</td>
                  <td>{p.tipo_pago}</td>
                  <td>RD$ {money(Number(p.monto_total || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 10 }}>Este módulo no permite editar ni eliminar montos recibidos.</p>
        </article>
      )}

      {cxcCobroModal && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setCxcCobroModal(null); }}>
          <div className="modal-card" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3>Cobrar / Abonar</h3>
              <button className="btn btn-ghost" onClick={() => setCxcCobroModal(null)}>✕</button>
            </div>
            <p style={{ marginTop: 0, color: 'var(--muted)' }}>
              Factura: <strong>{cxcCobroModal.numero_interno}</strong><br />
              Cliente: <strong>{cxcCobroModal.cliente_nombre}</strong><br />
              Balance pendiente: <strong>RD$ {Number(cxcCobroModal.balance_pendiente ?? 0).toFixed(2)}</strong>
            </p>
            <label>Monto a cobrar/abonar</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={cxcCobroMonto}
              onChange={(e) => setCxcCobroMonto(e.target.value)}
              placeholder="0.00"
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="btn btn-primary" onClick={() => confirmarCobroCxC().catch((e) => toast('error', e.message))}>Confirmar</button>
              <button className="btn btn-ghost" onClick={() => setCxcCobroModal(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {modulo === 'fidelidad' && (
        <article className="panel-card">
          <div className="panel-head">
            <h3>⭐ Programa de Fidelidad</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="chip chip-soft">{clientesFidelidad.length} miembros</span>
              <button className="btn btn-primary" onClick={() => { setBuscarClienteFidelidad(''); setClienteFidelidadSeleccionado(null); setModalFidelidad(true); }}>⭐ Inscribir Cliente</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
            <div style={{ background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', borderRadius: 12, padding: '14px 18px', border: '1px solid #fde68a' }}>
              <div style={{ fontSize: 12, color: '#92400e', fontWeight: 600, marginBottom: 4 }}>MIEMBROS ACTIVOS</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#d97706' }}>{clientesFidelidad.length}</div>
            </div>
            <div style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', borderRadius: 12, padding: '14px 18px', border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: 12, color: '#166534', fontWeight: 600, marginBottom: 4 }}>TOTAL PUNTOS ACTIVOS</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#16a34a' }}>{clientesFidelidad.reduce((s: number, c: any) => s + Number(c.puntos_disponibles || 0), 0).toLocaleString()}</div>
            </div>
            <div style={{ background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', borderRadius: 12, padding: '14px 18px', border: '1px solid #bfdbfe' }}>
              <div style={{ fontSize: 12, color: '#1e40af', fontWeight: 600, marginBottom: 4 }}>TOTAL GASTADO (MIEMBROS)</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#1d4ed8' }}>RD$ {clientesFidelidad.reduce((s: number, c: any) => s + Number(c.total_gastado || 0), 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</div>
            </div>
          </div>

          {clientesFidelidad.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>⭐</div>
              <p style={{ fontSize: 15, fontWeight: 600 }}>No hay clientes en el programa de Fidelidad</p>
              <p style={{ fontSize: 13 }}>Inscribe clientes desde el botón de arriba o marcando la casilla de Fidelidad al crear/editar un cliente en el módulo Clientes.</p>
            </div>
          ) : (
            <table className="table-premium">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Teléfono</th>
                  <th>Compras</th>
                  <th>Total Gastado</th>
                  <th style={{ color: '#d97706' }}>⭐ Puntos Acumulados</th>
                  <th style={{ color: '#16a34a' }}>Pts Disponibles</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clientesFidelidad.map((c: any) => (
                  <tr key={c.id}>
                    <td><strong>{c.codigo}</strong></td>
                    <td>{c.nombre}</td>
                    <td>{c.telefono_1 || '—'}</td>
                    <td style={{ textAlign: 'center' }}>{Number(c.total_compras || 0)}</td>
                    <td>RD$ {Number(c.total_gastado || 0).toFixed(2)}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: '#d97706' }}>{Number(c.puntos_acumulados || 0).toLocaleString()}</td>
                    <td style={{ textAlign: 'center', fontWeight: 800, color: '#16a34a', fontSize: 15 }}>{Number(c.puntos_disponibles || 0).toLocaleString()}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={async () => {
                          const fullCliente = clientes.find((cl: any) => cl.id === c.id);
                          if (fullCliente) { setEditandoCliente({ ...fullCliente }); cambiarModuloConRuta('clientes'); }
                        }}>✏ Editar</button>
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px', color: '#d97706' }} onClick={async () => {
                          const movs = await api<any>(`/clientes/fidelidad/${c.id}/movimientos`, token).catch(() => null);
                          if (movs) {
                            const info = movs.movimientos.slice(0, 5).map((m: any) => `${m.fecha.substring(0,10)} | ${m.tipo === 'acumulacion' ? '+' : '-'}${m.puntos} pts — ${m.descripcion}`).join('\n');
                            toast('ok', `⭐ ${c.nombre}: ${Number(c.puntos_disponibles || 0)} pts disponibles${info ? '\n\n' + info : ''}`);
                          }
                        }}>⭐ Ver Pts</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
      )}

      {modulo === 'clientes' && (
        <article className="panel-card">
          <div className="panel-head">
            <h3>Clientes</h3>
            <button className="btn btn-primary" onClick={() => { setNuevoCliente({ ...NUEVOCLUB_BLANK, codigo: autoCodigoCliente(clientes) }); setModalCliente(true); }}>+ Nuevo Cliente</button>
          </div>
          <table className="table-premium">
            <thead>
              <tr><th>Código</th><th>Nombre</th><th>Cédula/RNC</th><th>Teléfono</th><th>Correo</th><th>Crédito</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {clientes.length === 0
                ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>Sin clientes registrados</td></tr>
                : clientes.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.codigo || '—'}</strong></td>
                    <td>{c.nombre}</td>
                    <td>{c.cedula_rnc || '—'}</td>
                    <td>{c.telefono_1 || '—'}</td>
                    <td>{c.correo || '—'}</td>
                    <td>
                      <span className={`chip ${c.estatus_credito === 'abierto' ? 'chip-lan' : 'chip-warning'}`}>
                        {c.estatus_credito === 'abierto' ? '✓ Abierto' : '✗ Cerrado'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setEditandoCliente({ ...c })}>✏ Editar</button>
                        {usuario.rol === 'administrador' && (
                          <button className={`btn ${c.estatus_credito === 'abierto' ? 'btn-ghost' : 'btn-primary'}`} style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => toggleCreditoCliente(c).catch((e) => toast('error', e.message))}>
                            {c.estatus_credito === 'abierto' ? 'Cerrar crédito' : 'Abrir crédito'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>

          {modalCliente && (
            <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setModalCliente(false); }}>
              <div className="modal-card modal-card-wide">
                <div className="modal-header">
                  <h3>Nuevo Cliente</h3>
                  <button className="btn btn-ghost" onClick={() => setModalCliente(false)}>✕ Cerrar</button>
                </div>
                <div className="quick-form" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
                  <div><label>Código (auto-generado)</label><input placeholder={autoCodigoCliente(clientes)} value={nuevoCliente.codigo} onChange={(e) => setNuevoCliente((s: any) => ({ ...s, codigo: e.target.value }))} /></div>
                  <div><label>Nombre completo *</label><input placeholder="Ej: Juan Pérez / Taller Los Hermanos" value={nuevoCliente.nombre} onChange={(e) => setNuevoCliente((s: any) => ({ ...s, nombre: e.target.value }))} /></div>
                  <div><label>Cédula / RNC</label><input placeholder="Ej: 001-1234567-8" value={nuevoCliente.cedula_rnc} onChange={(e) => setNuevoCliente((s: any) => ({ ...s, cedula_rnc: e.target.value }))} /></div>
                  <div><label>Teléfono principal</label><input placeholder="Ej: 809-555-0001" value={nuevoCliente.telefono_1} onChange={(e) => setNuevoCliente((s: any) => ({ ...s, telefono_1: e.target.value }))} /></div>
                  <div><label>Teléfono secundario</label><input placeholder="Ej: 849-555-0002" value={nuevoCliente.telefono_2} onChange={(e) => setNuevoCliente((s: any) => ({ ...s, telefono_2: e.target.value }))} /></div>
                  <div><label>Correo electrónico</label><input placeholder="cliente@correo.com" value={nuevoCliente.correo} onChange={(e) => setNuevoCliente((s: any) => ({ ...s, correo: e.target.value }))} /></div>
                  <div><label>Representante / Contacto</label><input placeholder="Persona de contacto" value={nuevoCliente.representante} onChange={(e) => setNuevoCliente((s: any) => ({ ...s, representante: e.target.value }))} /></div>
                  <div><label>Dirección</label><input placeholder="Calle, ciudad, sector..." value={nuevoCliente.direccion} onChange={(e) => setNuevoCliente((s: any) => ({ ...s, direccion: e.target.value }))} /></div>
                  <div><label>Fecha de nacimiento</label><input type="date" value={nuevoCliente.fecha_nacimiento} onChange={(e) => setNuevoCliente((s: any) => ({ ...s, fecha_nacimiento: e.target.value }))} /></div>
                  <div><label>Tipo de cliente</label><input placeholder="Ej: Taller, Comerciante, Persona" value={nuevoCliente.tipo_cliente} onChange={(e) => setNuevoCliente((s: any) => ({ ...s, tipo_cliente: e.target.value }))} /></div>
                  <div><label>% Descuento habitual</label><input type="number" placeholder="0" value={nuevoCliente.porcentaje_descuento} onChange={(e) => setNuevoCliente((s: any) => ({ ...s, porcentaje_descuento: Number(e.target.value) }))} /></div>
                  <div><label>Tipo comprobante fiscal</label>
                    <select value={nuevoCliente.tipo_comprobante_fiscal} onChange={(e) => setNuevoCliente((s: any) => ({ ...s, tipo_comprobante_fiscal: e.target.value }))}>
                      <option value="consumidor_final">Consumidor final</option>
                      <option value="credito_fiscal">Crédito fiscal</option>
                      <option value="regimen_especial">Régimen especial</option>
                      <option value="empresa_gubernamental">Empresa gubernamental</option>
                    </select>
                  </div>
                  <div><label>Estado de crédito</label>
                    <select value={nuevoCliente.estatus_credito} onChange={(e) => setNuevoCliente((s: any) => ({ ...s, estatus_credito: e.target.value }))}>
                      <option value="cerrado">Crédito cerrado (solo contado)</option>
                      <option value="abierto">Crédito abierto</option>
                    </select>
                  </div>
                  <div><label>Límite de crédito (RD$)</label><input type="number" placeholder="Solo si crédito abierto" value={nuevoCliente.limite_credito} onChange={(e) => setNuevoCliente((s: any) => ({ ...s, limite_credito: Number(e.target.value) }))} /></div>
                  <div><label>Días máx. de crédito</label><input type="number" placeholder="Ej: 30, 60, 90" value={nuevoCliente.limite_tiempo_dias} onChange={(e) => setNuevoCliente((s: any) => ({ ...s, limite_tiempo_dias: Number(e.target.value) }))} /></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, gridColumn: '1/-1', background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', borderRadius: 8, padding: '10px 14px', border: '1px solid #fde68a' }}>
                    <input type="checkbox" id="fid-nuevo" checked={!!nuevoCliente.en_programa_fidelidad} onChange={(e) => setNuevoCliente((s: any) => ({ ...s, en_programa_fidelidad: e.target.checked }))} style={{ width: 18, height: 18, accentColor: '#d97706', cursor: 'pointer' }} />
                    <label htmlFor="fid-nuevo" style={{ cursor: 'pointer', fontWeight: 600, color: '#92400e', margin: 0 }}>⭐ Inscribir en programa de Fidelidad — cada peso gastado acumula 1 punto</label>
                  </div>
                </div>
                <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => crearCliente().catch((e) => toast('error', e.message))}>✅ Guardar Cliente</button>
              </div>
            </div>
          )}

          {editandoCliente && (
            <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setEditandoCliente(null); }}>
              <div className="modal-card modal-card-wide">
                <div className="modal-header">
                  <h3>Editar Cliente — {editandoCliente.codigo}</h3>
                  <button className="btn btn-ghost" onClick={() => setEditandoCliente(null)}>✕ Cerrar</button>
                </div>
                <div className="quick-form" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
                  <div><label>Código</label><input value={editandoCliente.codigo || ''} onChange={(e) => setEditandoCliente((s: any) => ({ ...s, codigo: e.target.value }))} /></div>
                  <div><label>Nombre completo *</label><input value={editandoCliente.nombre || ''} onChange={(e) => setEditandoCliente((s: any) => ({ ...s, nombre: e.target.value }))} /></div>
                  <div><label>Cédula / RNC</label><input value={editandoCliente.cedula_rnc || ''} onChange={(e) => setEditandoCliente((s: any) => ({ ...s, cedula_rnc: e.target.value }))} /></div>
                  <div><label>Teléfono principal</label><input value={editandoCliente.telefono_1 || ''} onChange={(e) => setEditandoCliente((s: any) => ({ ...s, telefono_1: e.target.value }))} /></div>
                  <div><label>Teléfono secundario</label><input value={editandoCliente.telefono_2 || ''} onChange={(e) => setEditandoCliente((s: any) => ({ ...s, telefono_2: e.target.value }))} /></div>
                  <div><label>Correo electrónico</label><input value={editandoCliente.correo || ''} onChange={(e) => setEditandoCliente((s: any) => ({ ...s, correo: e.target.value }))} /></div>
                  <div><label>Representante</label><input value={editandoCliente.representante || ''} onChange={(e) => setEditandoCliente((s: any) => ({ ...s, representante: e.target.value }))} /></div>
                  <div><label>Dirección</label><input value={editandoCliente.direccion || ''} onChange={(e) => setEditandoCliente((s: any) => ({ ...s, direccion: e.target.value }))} /></div>
                  <div><label>% Descuento</label><input type="number" value={editandoCliente.porcentaje_descuento || 0} onChange={(e) => setEditandoCliente((s: any) => ({ ...s, porcentaje_descuento: Number(e.target.value) }))} /></div>
                  <div><label>Estado de crédito</label>
                    <select value={editandoCliente.estatus_credito || 'cerrado'} onChange={(e) => setEditandoCliente((s: any) => ({ ...s, estatus_credito: e.target.value }))}>
                      <option value="cerrado">Crédito cerrado</option>
                      <option value="abierto">Crédito abierto</option>
                    </select>
                  </div>
                  <div><label>Límite de crédito (RD$)</label><input type="number" value={editandoCliente.limite_credito || 0} onChange={(e) => setEditandoCliente((s: any) => ({ ...s, limite_credito: Number(e.target.value) }))} /></div>
                  <div><label>Días máx. de crédito</label><input type="number" value={editandoCliente.limite_tiempo_dias || 0} onChange={(e) => setEditandoCliente((s: any) => ({ ...s, limite_tiempo_dias: Number(e.target.value) }))} /></div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', borderRadius: 8, padding: '10px 14px', border: '1px solid #fde68a', marginTop: 12 }}>
                  <input type="checkbox" id="fid-edit" checked={!!editandoCliente.en_programa_fidelidad} onChange={(e) => setEditandoCliente((s: any) => ({ ...s, en_programa_fidelidad: e.target.checked }))} style={{ width: 18, height: 18, accentColor: '#d97706', cursor: 'pointer' }} />
                  <label htmlFor="fid-edit" style={{ cursor: 'pointer', fontWeight: 600, color: '#92400e', margin: 0 }}>⭐ Miembro del programa de Fidelidad — cada peso gastado acumula 1 punto</label>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button className="btn btn-primary" onClick={() => editarCliente().catch((e) => toast('error', e.message))}>✅ Guardar cambios</button>
                  <button className="btn btn-ghost" onClick={() => setEditandoCliente(null)}>Cancelar</button>
                </div>
              </div>
            </div>
          )}
        </article>
      )}

      {modulo === 'productos' && (
        <article className="panel-card">
          <div className="panel-head">
            <h3>Productos</h3>
            <button className="btn btn-primary" onClick={() => { setNuevoProducto({ codigo: '', tipo: '', nombre: '', descripcion: '', marca: '', medida: '', costo: 0, lleva_itbis: true, margen: 0, precio: 0, precio_negocio_1: 0, precio_negocio_2: 0, itbis_porcentaje: 18, existencia_minima: 0, cantidad_a_ordenar: 0, ubicacion: '', categoria: '', codigo_barras: '', cuenta_contable: '', referencia: '', uso_notas: '', suplidor_principal_id: '', imagen_url: '' }); setImagenAddFile(null); setImagenAddPreview(''); setModalProductosPage(true); setQuickAddCat(false); setQuickAddSup(false); }}>+ Agregar Producto</button>
          </div>
          <table className="table-premium">
            <thead><tr><th></th><th>Código</th><th>Descripción</th><th>Categoría</th><th>Marca</th><th>Precio</th><th>Stock</th><th>Acciones</th></tr></thead>
            <tbody>
              {productos.length === 0
                ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>Sin productos registrados</td></tr>
                : productos.map((p) => (
                  <tr key={p.id}>
                    <td style={{ width: 44 }}>
                      {p.imagen_url
                        ? <img src={imgSrc(p.imagen_url)} alt={p.nombre} className="prod-img-thumb" />
                        : <div className="prod-img-placeholder">🔩</div>}
                    </td>
                    <td>{p.codigo}</td>
                    <td>{p.nombre}</td>
                    <td>{p.categoria_nombre || '—'}</td>
                    <td>{p.marca || '—'}</td>
                    <td>RD$ {Number(p.precio).toFixed(2)}</td>
                    <td>{Number(p.existencia || 0).toFixed(2)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => { setEditandoProducto({ ...p, itbis_porcentaje: Number(p.itbis_tasa ?? 0) * 100 }); setImagenEditPreview(''); setImagenEditFile(null); setQuickAddCat(false); setQuickAddSup(false); }}>✏ Editar</button>
                        <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => eliminarProducto(p.id).catch((e) => toast('error', e.message))}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>

          {modalProductosPage && (
            <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) { setModalProductosPage(false); setQuickAddCat(false); setQuickAddSup(false); } }}>
              <div className="modal-card modal-card-wide">
                <div className="modal-header">
                  <h3>Agregar Producto</h3>
                  <button className="btn btn-ghost" onClick={() => { setModalProductosPage(false); setQuickAddCat(false); setQuickAddSup(false); }}>✕ Cerrar</button>
                </div>
                {formProductoFields(nuevoProducto, (k, v) => setNuevoProducto((s: any) => ({ ...s, [k]: v })))}
                <div className="imagen-upload-area">
                  <label>Imagen del producto</label>
                  <div className="imagen-upload-row">
                    {imagenAddPreview
                      ? <div className="imagen-preview-wrap"><img src={imagenAddPreview} alt="Preview" className="imagen-preview" /><button className="btn-remove-img" onClick={() => { setImagenAddFile(null); setImagenAddPreview(''); }}>✕ Quitar</button></div>
                      : <div className="imagen-drop-zone"><span>📷 Sin imagen seleccionada</span></div>}
                    <input type="file" accept="image/jpeg,image/png,image/webp" style={{ opacity: 0, position: 'absolute', pointerEvents: 'none' }} id="prod-add-img" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setImagenAddFile(f); setImagenAddPreview(URL.createObjectURL(f)); } }} />
                    <label htmlFor="prod-add-img" className="btn btn-ghost" style={{ cursor: 'pointer', alignSelf: 'center' }}>{imagenAddPreview ? '🔄 Cambiar' : '📂 Seleccionar'}</label>
                  </div>
                </div>
                <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => crearProducto().then(() => { setModalProductosPage(false); setQuickAddCat(false); setQuickAddSup(false); }).catch((e) => toast('error', e.message))}>✅ Guardar Producto</button>
              </div>
            </div>
          )}

          {editandoProducto && (
            <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setEditandoProducto(null); }}>
              <div className="modal-card modal-card-wide">
                <div className="modal-header">
                  <h3>Editar Producto — {editandoProducto.codigo}</h3>
                  <button className="btn btn-ghost" onClick={() => setEditandoProducto(null)}>✕ Cerrar</button>
                </div>
                {formProductoFields(editandoProducto, (k, v) => setEditandoProducto((s: any) => ({ ...s, [k]: v })))}
                <div className="imagen-upload-area">
                  <label>Imagen del producto</label>
                  <div className="imagen-upload-row">
                    {(imagenEditPreview || editandoProducto.imagen_url)
                      ? <div className="imagen-preview-wrap"><img src={imagenEditPreview || imgSrc(editandoProducto.imagen_url)} alt="Preview" className="imagen-preview" /><button className="btn-remove-img" onClick={() => { setImagenEditFile(null); setImagenEditPreview(''); setEditandoProducto((s: any) => ({ ...s, imagen_url: '' })); }}>✕ Quitar</button></div>
                      : <div className="imagen-drop-zone"><span>📷 Sin imagen</span></div>}
                    <input type="file" accept="image/jpeg,image/png,image/webp" style={{ opacity: 0, position: 'absolute', pointerEvents: 'none' }} id="prod-edit-img" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setImagenEditFile(f); setImagenEditPreview(URL.createObjectURL(f)); } }} />
                    <label htmlFor="prod-edit-img" className="btn btn-ghost" style={{ cursor: 'pointer', alignSelf: 'center' }}>{(imagenEditPreview || editandoProducto.imagen_url) ? '🔄 Cambiar' : '📂 Seleccionar'}</label>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button className="btn btn-primary" onClick={() => editarProductoGuardar().catch((e) => toast('error', e.message))}>✅ Guardar cambios</button>
                  <button className="btn btn-ghost" onClick={() => { setEditandoProducto(null); setImagenEditFile(null); setImagenEditPreview(''); setQuickAddCat(false); setQuickAddSup(false); }}>Cancelar</button>
                </div>
              </div>
            </div>
          )}
        </article>
      )}

      {modulo === 'compras' && <article className="panel-card">
        <div className="panel-head">
          <h3>Compras</h3>
          <button className="btn btn-primary" onClick={() => setModalCompra(true)}>+ Registrar compra</button>
        </div>
        <h4>Historial compras</h4>
        <table className="table-premium"><thead><tr><th>Código</th><th>Suplidor</th><th>Sucursal</th><th>Factura</th><th>NCF</th><th>Total</th><th>Estado</th></tr></thead><tbody>{compras.map((c) => <tr key={c.id}><td>{c.codigo_compra}</td><td>{c.suplidor_nombre}</td><td>{c.sucursal_nombre}</td><td>{c.numero_factura}</td><td>{c.numero_ncf}</td><td>{Number(c.total).toFixed(2)}</td><td>{c.estado}</td></tr>)}</tbody></table>
      </article>}

      {modalCompra && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setModalCompra(false); }}>
          <div className="modal-card modal-card-wide">
            <div className="modal-header">
              <h3>Registrar compra</h3>
              <button className="btn btn-ghost" onClick={() => setModalCompra(false)}>✕ Cerrar</button>
            </div>
            <div className="quick-form" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
              <select value={nuevaCompra.suplidor_id} onChange={(e) => setNuevaCompra((s: any) => ({ ...s, suplidor_id: e.target.value }))}><option value="">Suplidor</option>{suplidores.map((s) => <option key={s.id} value={s.id}>{s.nombre_comercial}</option>)}</select>
              <select value={nuevaCompra.sucursal_id} onChange={(e) => setNuevaCompra((s: any) => ({ ...s, sucursal_id: e.target.value }))}><option value="">Sucursal destino</option>{sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
              <input placeholder="Factura suplidor" value={nuevaCompra.numero_factura} onChange={(e) => setNuevaCompra((s: any) => ({ ...s, numero_factura: e.target.value }))} />
              <input placeholder="NCF suplidor" value={nuevaCompra.numero_ncf} onChange={(e) => setNuevaCompra((s: any) => ({ ...s, numero_ncf: e.target.value }))} />
              <input type="date" value={nuevaCompra.fecha_factura} onChange={(e) => setNuevaCompra((s: any) => ({ ...s, fecha_factura: e.target.value }))} />
              <input type="date" value={nuevaCompra.fecha_vencimiento} onChange={(e) => setNuevaCompra((s: any) => ({ ...s, fecha_vencimiento: e.target.value }))} />
              <select value={nuevaCompra.condicion_compra} onChange={(e) => setNuevaCompra((s: any) => ({ ...s, condicion_compra: e.target.value }))}><option value="contado">Contado</option><option value="credito">Crédito</option></select>
              <input placeholder="Observaciones" value={nuevaCompra.observaciones} onChange={(e) => setNuevaCompra((s: any) => ({ ...s, observaciones: e.target.value }))} />
            </div>
            <div className="quick-form" style={{ gridTemplateColumns: '2fr repeat(4,1fr) auto' }}>
              <select value={itemCompra.producto_id} onChange={(e) => setItemCompra((s: any) => ({ ...s, producto_id: e.target.value }))}><option value="">Producto</option>{productos.map((p) => <option key={p.id} value={p.id}>{p.codigo} - {p.nombre}</option>)}</select>
              <input type="number" value={itemCompra.cantidad} onChange={(e) => setItemCompra((s: any) => ({ ...s, cantidad: Number(e.target.value) }))} />
              <input type="number" value={itemCompra.costo_unitario} onChange={(e) => setItemCompra((s: any) => ({ ...s, costo_unitario: Number(e.target.value) }))} />
              <input type="number" value={itemCompra.itbis_tasa} onChange={(e) => setItemCompra((s: any) => ({ ...s, itbis_tasa: Number(e.target.value) }))} />
              <input type="number" value={itemCompra.descuento_monto} onChange={(e) => setItemCompra((s: any) => ({ ...s, descuento_monto: Number(e.target.value) }))} />
              <button className="btn btn-ghost" onClick={() => { const p = productos.find((x) => x.id === itemCompra.producto_id); if (!p) return; setNuevaCompra((s: any) => ({ ...s, items: [...s.items, { ...itemCompra, descripcion: p.nombre }] })); }}>Agregar item</button>
            </div>
            <table className="table-premium"><thead><tr><th>Producto</th><th>Cant</th><th>Costo</th><th>ITBIS</th><th>Descuento</th><th></th></tr></thead><tbody>{nuevaCompra.items.map((i: any, idx: number) => <tr key={idx}><td>{i.descripcion}</td><td>{i.cantidad}</td><td>{i.costo_unitario}</td><td>{i.itbis_tasa}</td><td>{i.descuento_monto}</td><td><button className="btn btn-ghost" onClick={() => setNuevaCompra((s: any) => ({ ...s, items: s.items.filter((_: any, n: number) => n !== idx) }))}>Quitar</button></td></tr>)}</tbody></table>
            <button className="btn btn-primary" onClick={() => crearCompra().then(() => setModalCompra(false)).catch((e) => toast('error', e.message))}>Registrar compra</button>
          </div>
        </div>
      )}

      {modulo === 'inventario' && (
        !sucursalInvSeleccionada ? (
          <article className="panel-card">
            <h3>Inventario por Sucursal</h3>
            <p style={{ color: 'var(--muted)', marginBottom: 16 }}>Selecciona una sucursal para ver su inventario de productos</p>
            <div className="sucursal-grid">
              {sucursales.map((s) => (
                <button key={s.id} className="sucursal-tile" onClick={() => setSucursalInvSeleccionada(s.id)}>
                  <span className="sucursal-icon">🏪</span>
                  <strong>{s.nombre}</strong>
                  <small>{s.codigo}</small>
                </button>
              ))}
            </div>
          </article>
        ) : (
          <article className="panel-card">
            <div className="panel-head">
              <h3>Inventario — {sucursales.find((s) => s.id === sucursalInvSeleccionada)?.nombre}</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={() => { setNuevoProducto({ codigo: '', tipo: '', nombre: '', descripcion: '', marca: '', medida: '', costo: 0, lleva_itbis: true, margen: 0, precio: 0, precio_negocio_1: 0, precio_negocio_2: 0, itbis_porcentaje: 18, existencia_minima: 0, cantidad_a_ordenar: 0, ubicacion: '', categoria: '', codigo_barras: '', cuenta_contable: '', referencia: '', uso_notas: '', suplidor_principal_id: '', imagen_url: '' }); setImagenAddFile(null); setImagenAddPreview(''); setModalProductoInv(true); setQuickAddCat(false); setQuickAddSup(false); }}>+ Agregar Producto</button>
                <button className="btn btn-ghost" onClick={() => setSucursalInvSeleccionada('')}>← Volver</button>
              </div>
            </div>
            <table className="table-premium">
              <thead><tr><th></th><th>Código</th><th>Descripción</th><th>Marca</th><th>Medida</th><th>Ubicación</th><th>Precio</th><th>Existencia</th><th>Acciones</th></tr></thead>
              <tbody>
                {productos.map((p) => (
                  <tr key={p.id}>
                    <td style={{ width: 44 }}>
                      {p.imagen_url
                        ? <img src={imgSrc(p.imagen_url)} alt={p.nombre} className="prod-img-thumb" />
                        : <div className="prod-img-placeholder">🔩</div>}
                    </td>
                    <td>{p.codigo}</td>
                    <td>{p.nombre}</td>
                    <td>{p.marca || '-'}</td>
                    <td>{p.medida || '-'}</td>
                    <td>{p.ubicacion || '-'}</td>
                    <td>RD$ {Number(p.precio).toFixed(2)}</td>
                    <td>{Number(p.existencia || 0).toFixed(2)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => { setEditandoProducto({ ...p, itbis_porcentaje: Number(p.itbis_tasa ?? 0) * 100 }); setImagenEditPreview(''); setImagenEditFile(null); setQuickAddCat(false); setQuickAddSup(false); }}>✏ Editar</button>
                        <button className="btn btn-danger" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => eliminarProducto(p.id).catch((e) => toast('error', e.message))}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {modalProductoInv && (
              <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) { setModalProductoInv(false); setQuickAddCat(false); setQuickAddSup(false); } }}>
                <div className="modal-card modal-card-wide">
                  <div className="modal-header">
                    <h3>Agregar Producto al Inventario</h3>
                    <button className="btn btn-ghost" onClick={() => { setModalProductoInv(false); setQuickAddCat(false); setQuickAddSup(false); }}>✕ Cerrar</button>
                  </div>
                  {formProductoFields(nuevoProducto, (k, v) => setNuevoProducto((s: any) => ({ ...s, [k]: v })))}
                  <div className="imagen-upload-area">
                    <label>Imagen del producto</label>
                    <div className="imagen-upload-row">
                      {imagenAddPreview
                        ? <div className="imagen-preview-wrap"><img src={imagenAddPreview} alt="Preview" className="imagen-preview" /><button className="btn-remove-img" onClick={() => { setImagenAddFile(null); setImagenAddPreview(''); }}>✕ Quitar</button></div>
                        : <div className="imagen-drop-zone"><span>📷 Haz clic para seleccionar imagen</span></div>}
                      <input type="file" accept="image/jpeg,image/png,image/webp" style={{ opacity: 0, position: 'absolute', pointerEvents: 'none' }} id="add-imagen-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setImagenAddFile(f); setImagenAddPreview(URL.createObjectURL(f)); } }} />
                      <label htmlFor="add-imagen-input" className="btn btn-ghost" style={{ cursor: 'pointer', alignSelf: 'center' }}>{imagenAddPreview ? '🔄 Cambiar' : '📂 Seleccionar'}</label>
                    </div>
                  </div>
                  <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => crearProducto().then(() => { setModalProductoInv(false); setQuickAddCat(false); setQuickAddSup(false); }).catch((e) => toast('error', e.message))}>✅ Guardar Producto</button>
                </div>
              </div>
            )}

            {editandoProducto && (
              <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setEditandoProducto(null); }}>
                <div className="modal-card modal-card-wide">
                  <div className="modal-header">
                    <h3>Editar Producto — {editandoProducto.codigo}</h3>
                    <button className="btn btn-ghost" onClick={() => setEditandoProducto(null)}>✕ Cerrar</button>
                  </div>
                  {formProductoFields(editandoProducto, (k, v) => setEditandoProducto((s: any) => ({ ...s, [k]: v })))}
                  <div className="imagen-upload-area">
                    <label>Imagen del producto</label>
                    <div className="imagen-upload-row">
                      {(imagenEditPreview || editandoProducto.imagen_url)
                        ? <div className="imagen-preview-wrap"><img src={imagenEditPreview || imgSrc(editandoProducto.imagen_url)} alt="Preview" className="imagen-preview" /><button className="btn-remove-img" onClick={() => { setImagenEditFile(null); setImagenEditPreview(''); setEditandoProducto((s: any) => ({ ...s, imagen_url: '' })); }}>✕ Quitar</button></div>
                        : <div className="imagen-drop-zone"><span>📷 Sin imagen</span></div>}
                      <input type="file" accept="image/jpeg,image/png,image/webp" style={{ opacity: 0, position: 'absolute', pointerEvents: 'none' }} id="edit-imagen-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setImagenEditFile(f); setImagenEditPreview(URL.createObjectURL(f)); } }} />
                      <label htmlFor="edit-imagen-input" className="btn btn-ghost" style={{ cursor: 'pointer', alignSelf: 'center' }}>{(imagenEditPreview || editandoProducto.imagen_url) ? '🔄 Cambiar' : '📂 Seleccionar'}</label>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    <button className="btn btn-primary" onClick={() => editarProductoGuardar().catch((e) => toast('error', e.message))}>✅ Guardar cambios</button>
                    <button className="btn btn-ghost" onClick={() => { setEditandoProducto(null); setImagenEditFile(null); setImagenEditPreview(''); setQuickAddCat(false); setQuickAddSup(false); }}>Cancelar</button>
                  </div>
                </div>
              </div>
            )}
          </article>
        )
      )}

      {modulo === 'maestros' && (
        <div className="maestros-grid">
          <article className="panel-card">
            <div className="panel-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 28 }}>🏪</span>
                <div><h3 style={{ margin: 0 }}>Sucursales</h3><p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>{sucursales.length} registradas</p></div>
              </div>
              <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => setNuevaSucursal({ codigo: '', nombre: '', direccion: '', telefono: '' })}>+ Nueva</button>
            </div>
            <div className="maestro-form">
              <div><label>Código</label><input placeholder="Ej: SUC-01" value={nuevaSucursal.codigo} onChange={(e) => setNuevaSucursal((s: any) => ({ ...s, codigo: e.target.value }))} /></div>
              <div><label>Nombre *</label><input placeholder="Nombre de la sucursal" value={nuevaSucursal.nombre} onChange={(e) => setNuevaSucursal((s: any) => ({ ...s, nombre: e.target.value }))} /></div>
              <div><label>Dirección</label><input placeholder="Dirección física" value={nuevaSucursal.direccion} onChange={(e) => setNuevaSucursal((s: any) => ({ ...s, direccion: e.target.value }))} /></div>
              <div><label>Teléfono</label><input placeholder="809-000-0000" value={nuevaSucursal.telefono} onChange={(e) => setNuevaSucursal((s: any) => ({ ...s, telefono: e.target.value }))} /></div>
              <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} onClick={() => crearSucursal().catch((e) => toast('error', e.message))}>Guardar</button>
            </div>
            <div className="maestro-list">
              {sucursales.length === 0 && <p className="empty">Sin sucursales registradas</p>}
              {sucursales.map((s) => (
                <div key={s.id} className="maestro-item">
                  <div className="maestro-item-icon">🏪</div>
                  <div className="maestro-item-info">
                    <strong>{s.nombre}</strong>
                    <span>{s.codigo}{s.direccion ? ` · ${s.direccion}` : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="panel-card">
            <div className="panel-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 28 }}>🏷️</span>
                <div><h3 style={{ margin: 0 }}>Categorías</h3><p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>{categorias.length} registradas</p></div>
              </div>
              <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => setNuevaCategoria({ codigo: '', nombre: '', descripcion: '' })}>+ Nueva</button>
            </div>
            <div className="maestro-form">
              <div><label>Código</label><input placeholder="Ej: CAT-01" value={nuevaCategoria.codigo} onChange={(e) => setNuevaCategoria((s: any) => ({ ...s, codigo: e.target.value }))} /></div>
              <div><label>Nombre *</label><input placeholder="Nombre de la categoría" value={nuevaCategoria.nombre} onChange={(e) => setNuevaCategoria((s: any) => ({ ...s, nombre: e.target.value }))} /></div>
              <div style={{ gridColumn: 'span 2' }}><label>Descripción</label><input placeholder="Descripción opcional" value={nuevaCategoria.descripcion} onChange={(e) => setNuevaCategoria((s: any) => ({ ...s, descripcion: e.target.value }))} /></div>
              <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} onClick={() => crearCategoria().catch((e) => toast('error', e.message))}>Guardar</button>
            </div>
            <div className="maestro-list">
              {categorias.length === 0 && <p className="empty">Sin categorías registradas</p>}
              {categorias.map((c) => (
                <div key={c.id} className="maestro-item">
                  <div className="maestro-item-icon">🏷️</div>
                  <div className="maestro-item-info">
                    <strong>{c.nombre}</strong>
                    <span>{c.codigo || 'Sin código'}{c.descripcion ? ` · ${c.descripcion}` : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="panel-card">
            <div className="panel-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 28 }}>🏭</span>
                <div><h3 style={{ margin: 0 }}>Suplidores</h3><p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>{suplidores.length} registrados</p></div>
              </div>
              <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => setNuevoSuplidor({ codigo: '', nombre_comercial: '', razon_social: '', rnc_cedula: '', telefono: '', correo: '', direccion: '', contacto: '', observaciones: '' })}>+ Nuevo</button>
            </div>
            <div className="maestro-form">
              <div><label>Código</label><input placeholder="Ej: SUP-001" value={nuevoSuplidor.codigo} onChange={(e) => setNuevoSuplidor((s: any) => ({ ...s, codigo: e.target.value }))} /></div>
              <div><label>Nombre comercial *</label><input placeholder="Nombre del suplidor" value={nuevoSuplidor.nombre_comercial} onChange={(e) => setNuevoSuplidor((s: any) => ({ ...s, nombre_comercial: e.target.value }))} /></div>
              <div><label>RNC / Cédula</label><input placeholder="000-0000000-0" value={nuevoSuplidor.rnc_cedula} onChange={(e) => setNuevoSuplidor((s: any) => ({ ...s, rnc_cedula: e.target.value }))} /></div>
              <div><label>Teléfono</label><input placeholder="809-000-0000" value={nuevoSuplidor.telefono} onChange={(e) => setNuevoSuplidor((s: any) => ({ ...s, telefono: e.target.value }))} /></div>
              <div><label>Correo electrónico</label><input placeholder="contacto@empresa.com" value={nuevoSuplidor.correo} onChange={(e) => setNuevoSuplidor((s: any) => ({ ...s, correo: e.target.value }))} /></div>
              <div><label>Persona de contacto</label><input placeholder="Nombre del representante" value={nuevoSuplidor.contacto} onChange={(e) => setNuevoSuplidor((s: any) => ({ ...s, contacto: e.target.value }))} /></div>
              <div style={{ gridColumn: 'span 2' }}><label>Dirección</label><input placeholder="Dirección física del suplidor" value={nuevoSuplidor.direccion} onChange={(e) => setNuevoSuplidor((s: any) => ({ ...s, direccion: e.target.value }))} /></div>
              <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} onClick={() => crearSuplidor().catch((e) => toast('error', e.message))}>Guardar</button>
            </div>
            <div className="maestro-list">
              {suplidores.length === 0 && <p className="empty">Sin suplidores registrados</p>}
              {suplidores.map((s) => (
                <div key={s.id} className="maestro-item">
                  <div className="maestro-item-icon">🏭</div>
                  <div className="maestro-item-info">
                    <strong>{s.nombre_comercial}</strong>
                    <span>{s.codigo ? `${s.codigo} · ` : ''}{s.telefono || ''}{s.correo ? ` · ${s.correo}` : ''}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => setEditandoSuplidor({ ...s })}>Editar</button>
                    <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12, color: 'var(--rojo-600)' }} onClick={() => eliminarSuplidor(s.id).catch((e) => toast('error', e.message))}>Eliminar</button>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>
      )}

      {editandoSuplidor && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setEditandoSuplidor(null); }}>
          <div className="modal-card modal-card-wide">
            <div className="modal-header">
              <h3>Editar Suplidor — {editandoSuplidor.codigo || editandoSuplidor.id}</h3>
              <button className="btn btn-ghost" onClick={() => setEditandoSuplidor(null)}>✕ Cerrar</button>
            </div>
            <div className="quick-form" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
              <div><label>Código</label><input value={editandoSuplidor.codigo || ''} onChange={(e) => setEditandoSuplidor((x: any) => ({ ...x, codigo: e.target.value }))} /></div>
              <div><label>Nombre comercial *</label><input value={editandoSuplidor.nombre_comercial || ''} onChange={(e) => setEditandoSuplidor((x: any) => ({ ...x, nombre_comercial: e.target.value }))} /></div>
              <div><label>RNC / Cédula</label><input value={editandoSuplidor.rnc_cedula || ''} onChange={(e) => setEditandoSuplidor((x: any) => ({ ...x, rnc_cedula: e.target.value }))} /></div>
              <div><label>Teléfono</label><input value={editandoSuplidor.telefono || ''} onChange={(e) => setEditandoSuplidor((x: any) => ({ ...x, telefono: e.target.value }))} /></div>
              <div><label>Correo</label><input value={editandoSuplidor.correo || ''} onChange={(e) => setEditandoSuplidor((x: any) => ({ ...x, correo: e.target.value }))} /></div>
              <div><label>Contacto</label><input value={editandoSuplidor.contacto || ''} onChange={(e) => setEditandoSuplidor((x: any) => ({ ...x, contacto: e.target.value }))} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label>Dirección</label><input value={editandoSuplidor.direccion || ''} onChange={(e) => setEditandoSuplidor((x: any) => ({ ...x, direccion: e.target.value }))} /></div>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={() => editarSuplidor().catch((e) => toast('error', e.message))}>Guardar cambios</button>
              <button className="btn btn-ghost" onClick={() => setEditandoSuplidor(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {modulo === 'usuarios' && (
        <article className="panel-card">
          <div className="panel-head">
            <h3>Empleados del Sistema</h3>
            <button className="btn btn-primary" onClick={() => setModalUsuario(true)}>+ Registro de Usuario</button>
          </div>
          <table className="table-premium">
            <thead><tr><th>Usuario</th><th>Nombre completo</th><th>Rol</th><th>Sucursal</th><th>Acciones</th></tr></thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td>{u.nombre_completo}</td>
                  <td><span className="chip chip-user">{u.rol}</span></td>
                  <td>{u.sucursales || '-'}</td>
                  <td><button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setEditandoUsuario({ ...u, password: '' })}>Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>

          {modalUsuario && (
            <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setModalUsuario(false); }}>
              <div className="modal-card">
                <div className="modal-header">
                  <h3>Registro de Usuario</h3>
                  <button className="btn btn-ghost" onClick={() => setModalUsuario(false)}>✕ Cerrar</button>
                </div>
                <div className="quick-form" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
                  <div>
                    <label>Nombre de usuario (login)</label>
                    <input placeholder="Ej: juan.perez — sin espacios ni tildes" value={nuevoUsuario.username} onChange={(e) => setNuevoUsuario((s: any) => ({ ...s, username: e.target.value }))} />
                  </div>
                  <div>
                    <label>Nombre completo del empleado</label>
                    <input placeholder="Ej: Juan Pérez García" value={nuevoUsuario.nombre_completo} onChange={(e) => setNuevoUsuario((s: any) => ({ ...s, nombre_completo: e.target.value }))} />
                  </div>
                  <div>
                    <label>Contraseña inicial</label>
                    <input type="password" placeholder="Mínimo 4 caracteres" value={nuevoUsuario.password} onChange={(e) => setNuevoUsuario((s: any) => ({ ...s, password: e.target.value }))} />
                  </div>
                  <div>
                    <label>Rol / Permiso en el sistema</label>
                    <select value={nuevoUsuario.rol} onChange={(e) => setNuevoUsuario((s: any) => ({ ...s, rol: e.target.value }))}>
                      {roles.map((r) => <option key={r.id} value={r.nombre}>{r.nombre}</option>)}
                    </select>
                    <small style={{ color: 'var(--muted)', fontSize: 11 }}>vendedor: solo POS · cajero: POS + cobros · administrador: acceso total</small>
                  </div>
                  <div>
                    <label>Sucursal asignada</label>
                    <select value={nuevoUsuario.sucursal_id} onChange={(e) => setNuevoUsuario((s: any) => ({ ...s, sucursal_id: e.target.value }))}>
                      <option value="">Sin sucursal fija</option>
                      {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => crearUsuario().then(() => setModalUsuario(false)).catch((e) => toast('error', e.message))}>Crear Usuario</button>
                  </div>
                </div>
                <hr style={{ margin: '16px 0', borderColor: '#edf0f6' }} />
                <h4 style={{ margin: '0 0 10px', color: 'var(--azul-800)' }}>Empleados registrados</h4>
                <table className="table-premium">
                  <thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Sucursal</th></tr></thead>
                  <tbody>
                    {usuarios.map((u) => (
                      <tr key={u.id}>
                        <td>{u.username}</td>
                        <td>{u.nombre_completo}</td>
                        <td><span className="chip chip-user">{u.rol}</span></td>
                        <td>{u.sucursales || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </article>
      )}

      {editandoUsuario && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setEditandoUsuario(null); }}>
          <div className="modal-card">
            <div className="modal-header">
              <h3>Editar usuario</h3>
              <button className="btn btn-ghost" onClick={() => setEditandoUsuario(null)}>✕ Cerrar</button>
            </div>
            <div className="quick-form" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
              <div>
                <label>Usuario (login)</label>
                <input value={editandoUsuario.username || ''} onChange={(e) => setEditandoUsuario((s: any) => ({ ...s, username: e.target.value }))} />
              </div>
              <div>
                <label>Nombre completo</label>
                <input value={editandoUsuario.nombre_completo || ''} onChange={(e) => setEditandoUsuario((s: any) => ({ ...s, nombre_completo: e.target.value }))} />
              </div>
              <div>
                <label>Nueva contraseña (opcional)</label>
                <input type="password" value={editandoUsuario.password || ''} onChange={(e) => setEditandoUsuario((s: any) => ({ ...s, password: e.target.value }))} placeholder="Dejar vacío para mantener" />
              </div>
              <div>
                <label>Rol</label>
                <select value={editandoUsuario.rol || 'vendedor'} onChange={(e) => setEditandoUsuario((s: any) => ({ ...s, rol: e.target.value }))}>
                  {roles.map((r) => <option key={r.id} value={r.nombre}>{r.nombre}</option>)}
                </select>
              </div>
              <div>
                <label>Sucursal</label>
                <select value={editandoUsuario.sucursal_id || ''} onChange={(e) => setEditandoUsuario((s: any) => ({ ...s, sucursal_id: e.target.value }))}>
                  <option value="">Sin sucursal fija</option>
                  {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
              <div>
                <label>Estado</label>
                <select value={editandoUsuario.estado || 'activo'} onChange={(e) => setEditandoUsuario((s: any) => ({ ...s, estado: e.target.value }))}>
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', borderRadius: 8, padding: '10px 14px', border: '1px solid #fde68a', marginTop: 12 }}>
              <input type="checkbox" id="puede-fidelidad" checked={!!editandoUsuario.puede_agregar_fidelidad} onChange={(e) => setEditandoUsuario((s: any) => ({ ...s, puede_agregar_fidelidad: e.target.checked }))} style={{ width: 18, height: 18, accentColor: '#d97706', cursor: 'pointer' }} />
              <label htmlFor="puede-fidelidad" style={{ cursor: 'pointer', fontWeight: 600, color: '#92400e', margin: 0 }}>⭐ Puede agregar clientes al programa de Fidelidad desde el POS</label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'linear-gradient(135deg,#ecfeff,#cffafe)', borderRadius: 8, padding: '10px 14px', border: '1px solid #67e8f9', marginTop: 8 }}>
              <input type="checkbox" id="puede-verificar" checked={!!editandoUsuario.puede_verificar} onChange={(e) => setEditandoUsuario((s: any) => ({ ...s, puede_verificar: e.target.checked }))} style={{ width: 18, height: 18, accentColor: '#0891b2', cursor: 'pointer' }} />
              <label htmlFor="puede-verificar" style={{ cursor: 'pointer', fontWeight: 600, color: '#155e75', margin: 0 }}>✅ Disponible como verificador de pedidos</label>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={() => actualizarUsuario().catch((e) => toast('error', e.message))}>Guardar cambios</button>
              <button className="btn btn-ghost" onClick={() => setEditandoUsuario(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {modulo === 'importador' && <article className="panel-card"><h3>Importar base SQL legada</h3>
        <p>Sube un archivo .sql y migra los datos al sistema de forma segura</p>
        <p>Ruta: <strong>/admin/importar-sql-legado</strong></p>
        <p>Motor actual: <strong>{importMeta?.motor_actual || 'sqlite'}</strong>. El importador parsea SQL Server legacy sin ejecutar DDL peligroso.</p>
        <div className="quick-form" style={{ gridTemplateColumns: '1fr 1fr auto' }}>
          <input value={sqlNombre} onChange={(e) => setSqlNombre(e.target.value)} placeholder="Nombre archivo" />
          <input type="file" accept=".sql,text/plain" onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setSqlNombre(f.name);
            setSqlFile(f);
            if (f.size <= 8 * 1024 * 1024) {
              setSqlContenido(await f.text());
            } else {
              setSqlContenido('');
            }
          }} />
          <button className="btn btn-primary" disabled={subiendoSql || (!sqlFile && !sqlContenido.trim())} onClick={() => analizarSqlLegado().catch((e) => toast('error', e.message))}>{subiendoSql ? `Subiendo ${uploadProgreso}%` : 'Analizar SQL'}</button>
        </div>
        {sqlFile && <p style={{ marginTop: 8 }}>Archivo seleccionado: <strong>{sqlFile.name}</strong> · {(sqlFile.size / (1024 * 1024)).toFixed(2)} MB {sqlFile.size > 8 * 1024 * 1024 ? '(modo chunked)' : '(modo directo)'}</p>}
        {subiendoSql && <progress max={100} value={uploadProgreso} style={{ width: '100%' }} />}

        <div className="quick-form" style={{ gridTemplateColumns: '1fr auto auto auto auto auto auto auto auto' }}>
          <select value={jobSeleccionado} onChange={(e) => setJobSeleccionado(e.target.value)}>
            <option value="">Seleccionar job</option>
            {importJobs.map((j) => <option key={j.id} value={j.id}>{j.nombre_archivo} · {j.estado}</option>)}
          </select>
          <button className="btn btn-ghost" disabled={!jobSeleccionado} onClick={() => verPreviewJob(jobSeleccionado).catch((e) => toast('error', e.message))}>Vista previa</button>
          <button className="btn btn-ghost" disabled={!jobSeleccionado} onClick={() => ejecutarImport(jobSeleccionado, true, ['all']).catch((e) => toast('error', e.message))}>Dry run</button>
          <button className="btn btn-primary" disabled={!jobSeleccionado} onClick={() => ejecutarImport(jobSeleccionado, false, ['all']).catch((e) => toast('error', e.message))}>Importar todo</button>
          <button className="btn btn-ghost" disabled={!jobSeleccionado} onClick={() => ejecutarImport(jobSeleccionado, false, ['clientes']).catch((e) => toast('error', e.message))}>Clientes</button>
          <button className="btn btn-ghost" disabled={!jobSeleccionado} onClick={() => ejecutarImport(jobSeleccionado, false, ['suplidores']).catch((e) => toast('error', e.message))}>Suplidores</button>
          <button className="btn btn-ghost" disabled={!jobSeleccionado} onClick={() => ejecutarImport(jobSeleccionado, false, ['productos']).catch((e) => toast('error', e.message))}>Productos</button>
          <button className="btn btn-ghost" disabled={!jobSeleccionado} onClick={() => ejecutarImport(jobSeleccionado, false, ['compras']).catch((e) => toast('error', e.message))}>Compras</button>
          <button className="btn btn-ghost" disabled={!jobSeleccionado} onClick={() => ejecutarImport(jobSeleccionado, false, ['ventas']).catch((e) => toast('error', e.message))}>Ventas</button>
        </div>

        <div className="quick-form" style={{ gridTemplateColumns: 'auto auto auto' }}>
          <button className="btn btn-success" disabled={!jobSeleccionado} onClick={() => confirmarJob(jobSeleccionado).catch((e) => toast('error', e.message))}>Confirmar importación</button>
          <button className="btn btn-danger" disabled={!jobSeleccionado} onClick={() => deshacerJob(jobSeleccionado).catch((e) => toast('error', e.message))}>Deshacer última importación</button>
          <button className="btn btn-ghost" disabled={!jobSeleccionado} onClick={() => descargarLog(jobSeleccionado).catch((e) => toast('error', e.message))}>Descargar log</button>
        </div>

        {importPreview && <>
          <h4>Resumen análisis</h4>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{importPreview.job?.resumen_json}</pre>
          <h4>Tablas detectadas</h4>
          <table className="table-premium"><thead><tr><th>Tabla</th><th>Destino</th><th>Filas</th></tr></thead><tbody>{importPreview.tablas?.map((t: any, i: number) => <tr key={i}><td>{t.tabla_legacy}</td><td>{t.tabla_destino || 'pendiente'}</td><td>{t.cantidad}</td></tr>)}</tbody></table>
          <h4>Duplicados potenciales</h4>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(importPreview.duplicados_potenciales || [], null, 2)}</pre>
        </>}

        {resultadoImport && <>
          <h4>Resultado importación</h4>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(resultadoImport, null, 2)}</pre>
        </>}
      </article>}

      {modulo === 'reportes' && (
        <article className="panel-card">
          <div className="panel-head">
            <h3>Centro de Reportes</h3>
            <p style={{ color: 'var(--muted)', margin: 0 }}>Reportes operativos del sistema</p>
          </div>
          <div className="reporte-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
            {Object.entries(reportes).map(([k, rows]) => (
              <button key={k} className={`reporte-btn ${reporteActivo === k ? 'activo' : ''}`} onClick={() => setReporteActivo(reporteActivo === k ? '' : k)}>
                <span className="reporte-icon">{REPORTE_ICONS[k] ?? '📊'}</span>
                <strong>{REPORTE_LABELS[k] ?? k.replace(/-/g, ' ')}</strong>
                <span className="reporte-count">{(rows as any[]).length} registros</span>
              </button>
            ))}
          </div>
          {reporteActivo && reportes[reporteActivo] && (
            <div className="reporte-data">
              <div className="panel-head" style={{ marginBottom: 12 }}>
                <h4 style={{ margin: 0 }}>{REPORTE_LABELS[reporteActivo] ?? reporteActivo.replace(/-/g, ' ')} — {reportes[reporteActivo].length} registros</h4>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost" onClick={() => cargarTodo().catch((e) => toast('error', e.message))}>🔄 Actualizar</button>
                  <button className="btn btn-primary" onClick={exportarReportePdf}>📄 Exportar PDF</button>
                  <button className="btn btn-ghost" onClick={() => setReporteActivo('')}>✕ Cerrar</button>
                </div>
              </div>
              <ReporteTabla filas={reportes[reporteActivo] as any[]} />
            </div>
          )}
        </article>
      )}

      {modulo === 'contabilidad' && (
        <div>
          <div className="contab-kpi-row">
            <div className="contab-kpi azul"><span>💰 Total ventas</span><strong>RD$ {ventasAll.reduce((a, v) => a + Number(v.total ?? 0), 0).toFixed(2)}</strong></div>
            <div className="contab-kpi verde"><span>✅ Ventas contado</span><strong>RD$ {ventasAll.filter((v) => v.tipo_venta === 'contado').reduce((a, v) => a + Number(v.total ?? 0), 0).toFixed(2)}</strong></div>
            <div className="contab-kpi naranja"><span>📒 Ventas crédito</span><strong>RD$ {ventasAll.filter((v) => v.tipo_venta === 'credito').reduce((a, v) => a + Number(v.total ?? 0), 0).toFixed(2)}</strong></div>
            <div className="contab-kpi rojo"><span>🧮 Total compras</span><strong>RD$ {compras.reduce((a, c) => a + Number(c.total ?? 0), 0).toFixed(2)}</strong></div>
            <div className="contab-kpi morado"><span>📦 Registros ventas</span><strong>{ventasAll.length}</strong></div>
            <div className="contab-kpi gris"><span>💹 Beneficio</span><strong>RD$ {ventasAll.reduce((a, v) => a + Number(v.beneficio ?? 0), 0).toFixed(2)}</strong></div>
          </div>

          <div className="contab-tabs">
            {(['cuadres', 'ventas', 'compras'] as const).map((t) => (
              <button key={t} className={`contab-tab ${tabContabilidad === t ? 'activo' : ''}`} onClick={() => setTabContabilidad(t)}>
                {t === 'cuadres' ? '⚖️ Cuadres de Caja' : t === 'ventas' ? '🧾 Ingresos / Ventas' : '🧮 Egresos / Compras'}
                <span className="contab-tab-count">{t === 'cuadres' ? cuadres.length : t === 'ventas' ? ventasAll.length : compras.length}</span>
              </button>
            ))}
          </div>

          <article className="panel-card" style={{ marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
            {tabContabilidad === 'cuadres' && (
              <>
                <div className="panel-head" style={{ marginBottom: 12 }}>
                  <h4 style={{ margin: 0 }}>Cuadres de caja — Historial</h4>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span className="chip chip-warning">{cuadres.filter((c) => Math.abs(Number(c.diferencia ?? 0)) > 0).length} inconsistentes</span>
                    <span className="chip chip-lan">{cuadres.filter((c) => Math.abs(Number(c.diferencia ?? 0)) === 0).length} normales</span>
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="table-premium">
                    <thead><tr><th>Número</th><th>Cajero</th><th>Sucursal</th><th>Contado</th><th>Esperado</th><th>Diferencia</th><th>Estado</th><th>Fecha</th></tr></thead>
                    <tbody>
                      {cuadres.length === 0 ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>No hay cuadres registrados aún</td></tr>
                      : cuadres.map((c) => {
                        const dif = Number(c.diferencia ?? 0);
                        const inconsistente = Math.abs(dif) > 0;
                        return (
                          <tr key={c.id}>
                            <td><strong>{c.numero_cuadre || c.id?.substring(0, 8)}</strong></td>
                            <td>{c.cajero_nombre || '-'}</td>
                            <td>{c.sucursal_nombre || '-'}</td>
                            <td>RD$ {Number(c.total_contado ?? 0).toFixed(2)}</td>
                            <td>RD$ {Number(c.total_esperado ?? 0).toFixed(2)}</td>
                            <td style={{ color: inconsistente ? 'var(--rojo-600)' : 'var(--success)', fontWeight: 700 }}>{dif >= 0 ? '+' : ''}{dif.toFixed(2)}</td>
                            <td><span className={`chip ${inconsistente ? 'chip-warning' : 'chip-lan'}`}>{inconsistente ? '⚠ Inconsistente' : '✓ Normal'}</span></td>
                            <td>{c.fecha_cierre ? String(c.fecha_cierre).substring(0, 10) : c.fecha_creacion ? String(c.fecha_creacion).substring(0, 10) : '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {tabContabilidad === 'ventas' && (
              <>
                <div className="panel-head" style={{ marginBottom: 12 }}>
                  <h4 style={{ margin: 0 }}>Ingresos — Todas las ventas</h4>
                  <span className="chip chip-lan">{ventasAll.length} registros</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="table-premium">
                    <thead><tr><th>#</th><th>Fecha</th><th>Cliente</th><th>Vendedor</th><th>Tipo</th><th>Forma pago</th><th>Subtotal</th><th>ITBIS</th><th>Descuento</th><th>Total</th><th>Beneficio</th><th>Estado</th></tr></thead>
                    <tbody>
                      {ventasAll.length === 0 ? <tr><td colSpan={12} style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>No hay ventas registradas</td></tr>
                      : ventasAll.map((v) => (
                        <tr key={v.id}>
                          <td><strong>{v.numero_interno || v.id?.substring(0, 8)}</strong></td>
                          <td>{v.fecha_creacion ? String(v.fecha_creacion).substring(0, 10) : '-'}</td>
                          <td>{v.cliente_nombre || '-'}</td>
                          <td>{v.vendedor_nombre || '-'}</td>
                          <td><span className={`chip ${v.tipo_venta === 'credito' ? 'chip-warning' : 'chip-lan'}`}>{v.tipo_venta}</span></td>
                          <td>{v.forma_pago || '-'}</td>
                          <td>RD$ {Number(v.subtotal ?? 0).toFixed(2)}</td>
                          <td>RD$ {Number(v.itbis_total ?? 0).toFixed(2)}</td>
                          <td style={{ color: Number(v.descuento_total) > 0 ? 'var(--success)' : undefined }}>- RD$ {Number(v.descuento_total ?? 0).toFixed(2)}</td>
                          <td><strong>RD$ {Number(v.total ?? 0).toFixed(2)}</strong></td>
                          <td style={{ color: Number(v.beneficio ?? 0) < 0 ? 'var(--rojo-600)' : 'var(--success)', fontWeight: 700 }}>RD$ {Number(v.beneficio ?? 0).toFixed(2)}</td>
                          <td><span className={`chip ${v.estado === 'anulada' ? 'chip-sync' : v.estado === 'cobrada' ? 'chip-lan' : 'chip-soft'}`}>{v.estado}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {tabContabilidad === 'compras' && (
              <>
                <div className="panel-head" style={{ marginBottom: 12 }}>
                  <h4 style={{ margin: 0 }}>Egresos — Todas las compras</h4>
                  <span className="chip chip-warning">{compras.length} registros</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="table-premium">
                    <thead><tr><th>Factura</th><th>Fecha</th><th>Suplidor</th><th>Sucursal</th><th>Condición</th><th>Estado pago</th><th>Subtotal</th><th>ITBIS</th><th>Total</th></tr></thead>
                    <tbody>
                      {compras.length === 0 ? <tr><td colSpan={9} style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>No hay compras registradas</td></tr>
                      : compras.map((c) => (
                        <tr key={c.id}>
                          <td><strong>{c.numero_factura || c.id?.substring(0, 8)}</strong></td>
                          <td>{c.fecha_factura ? String(c.fecha_factura).substring(0, 10) : '-'}</td>
                          <td>{c.suplidor_nombre || '-'}</td>
                          <td>{c.sucursal_nombre || '-'}</td>
                          <td>{c.condicion_compra || '-'}</td>
                          <td><span className={`chip ${c.estado_pago === 'pagado' ? 'chip-lan' : 'chip-warning'}`}>{c.estado_pago}</span></td>
                          <td>RD$ {Number(c.subtotal ?? 0).toFixed(2)}</td>
                          <td>RD$ {Number(c.itbis_total ?? 0).toFixed(2)}</td>
                          <td><strong>RD$ {Number(c.total ?? 0).toFixed(2)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </article>
        </div>
      )}

      {modulo === 'admin-dashboard' && (
        <div className="panel-grid">
          <article className="panel-card span-8">
            <h3>Resumen del día</h3>
            <div className="stats-grid">
              <div className="stat-box"><span>Ventas pendientes</span><strong>{kpis.ventas_pendientes ?? 0}</strong></div>
              <div className="stat-box"><span>Caja esperada</span><strong>RD$ {Number(kpis.caja_esperada ?? 0).toFixed(2)}</strong></div>
              <div className="stat-box"><span>Ventas a crédito</span><strong>RD$ {Number(kpis.ventas_credito ?? 0).toFixed(2)}</strong></div>
              <div className="stat-box"><span>Cobros del día</span><strong>RD$ {Number(kpis.cobros_total ?? 0).toFixed(2)}</strong></div>
              <div className="stat-box"><span>Beneficio del día</span><strong>RD$ {Number(adminResumen.beneficio_dia ?? 0).toFixed(2)}</strong></div>
              <div className="stat-box"><span>Ventas cobradas hoy</span><strong>{Number(adminResumen.cobradas_dia?.cantidad ?? 0)}</strong></div>
            </div>
            <h4 style={{ marginTop: 16 }}>Productos en bajo stock</h4>
            <table className="table-premium">
              <thead><tr><th>Código</th><th>Producto</th><th>Existencia</th><th>Categoría</th></tr></thead>
              <tbody>
                {(adminResumen.productos_bajo_stock ?? []).length === 0
                  ? <tr><td colSpan={4} style={{ textAlign: 'center', padding: 20 }}>Sin alertas de bajo stock</td></tr>
                  : (adminResumen.productos_bajo_stock ?? []).map((p: any) => (
                    <tr key={p.codigo}>
                      <td>{p.codigo}</td>
                      <td>{p.nombre}</td>
                      <td style={{ color: 'var(--rojo-600)', fontWeight: 700 }}>{Number(p.existencia ?? 0).toFixed(2)}</td>
                      <td>{p.categoria || '-'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </article>
          <article className="panel-card span-4">
            <h3>Accesos rápidos</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              <button className="btn btn-primary" onClick={() => cambiarModuloConRuta('pos')}>🧾 Ir al POS</button>
              <button className="btn btn-ghost" onClick={() => cambiarModuloConRuta('cxc')}>📒 Cuentas por cobrar</button>
              <button className="btn btn-ghost" onClick={() => cambiarModuloConRuta('contabilidad')}>🏦 Ver cuadres</button>
              <button className="btn btn-ghost" onClick={() => cambiarModuloConRuta('historial-ventas')}>🗂️ Historial de ventas</button>
              <button className="btn btn-ghost" onClick={() => cambiarModuloConRuta('importador')}>🧬 Importar SQL</button>
            </div>
          </article>
        </div>
      )}

      {modulo === 'historial-ventas' && (
        <article className="panel-card">
          <div className="panel-head">
            <h3>Historial de Ventas</h3>
            <span className="chip chip-lan">{historialFiltrado.length} registros</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(160px,1fr))', gap: 8, marginBottom: 10 }}>
            <select value={historialFiltro.sucursal_id} onChange={(e) => setHistorialFiltro((s: any) => ({ ...s, sucursal_id: e.target.value, empleado_id: '' }))}>
              <option value="">Todas las sucursales</option>
              {sucursales.map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <select value={historialFiltro.empleado_id} onChange={(e) => setHistorialFiltro((s: any) => ({ ...s, empleado_id: e.target.value }))}>
              <option value="">Todos los empleados</option>
              {usuarios.filter((u: any) => !historialFiltro.sucursal_id || u.sucursal_id === historialFiltro.sucursal_id).map((u: any) => <option key={u.id} value={u.id}>{u.nombre_completo}</option>)}
            </select>
            {historialFiltro.modo === 'dia' && <input type="date" value={historialFiltro.fecha} onChange={(e) => setHistorialFiltro((s: any) => ({ ...s, fecha: e.target.value }))} />}
            {historialFiltro.modo === 'mes' && <input type="month" value={historialFiltro.mes} onChange={(e) => setHistorialFiltro((s: any) => ({ ...s, mes: e.target.value }))} />}
            {historialFiltro.modo === 'rango' && (
              <>
                <input type="date" value={historialFiltro.desde} onChange={(e) => setHistorialFiltro((s: any) => ({ ...s, desde: e.target.value }))} />
                <input type="date" value={historialFiltro.hasta} onChange={(e) => setHistorialFiltro((s: any) => ({ ...s, hasta: e.target.value }))} />
              </>
            )}
          </div>
          <table className="table-premium">
            <thead><tr><th>#</th><th>Fecha</th><th>Cliente</th><th>Vendedor</th><th>Tipo</th><th>Total</th><th>Beneficio</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {historialFiltrado.length === 0 ? <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24 }}>No hay ventas registradas</td></tr> : historialFiltrado.map((v: any) => (
                <tr key={v.id} style={{ cursor: 'pointer' }} onClick={async () => setVentaDetalleModal(await api<any>(`/ventas/${v.id}`, token).catch(() => null))}>
                  <td><strong>{v.numero_interno || v.id?.substring(0, 8)}</strong></td>
                  <td>{v.fecha_creacion ? String(v.fecha_creacion).substring(0, 10) : '-'}</td>
                  <td>{v.cliente_nombre || '-'}</td>
                  <td>{v.vendedor_nombre || '-'}</td>
                  <td>{v.tipo_venta}</td>
                  <td>RD$ {Number(v.total ?? 0).toFixed(2)}</td>
                  <td style={{ color: Number(v.beneficio ?? 0) < 0 ? 'var(--rojo-600)' : 'var(--success)', fontWeight: 700 }}>RD$ {Number(v.beneficio ?? 0).toFixed(2)}</td>
                  <td>{v.estado}</td>
                  <td><button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); imprimirFacturaVenta(v.id, String(v.forma_pago ?? 'efectivo'), Number(v.total ?? 0), 0).catch((er) => toast('error', er.message)); }}>Reimprimir</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      )}

      {modulo === 'devoluciones' && (
        <article className="panel-card">
          <div className="panel-head"><h3>Devoluciones</h3><span className="chip chip-soft">{devolucionesFiltradas.length} registros</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(160px,1fr))', gap: 8, marginBottom: 10 }}>
            <select value={devolFiltro.sucursal_id} onChange={(e) => setDevolFiltro((s: any) => ({ ...s, sucursal_id: e.target.value, empleado_id: '' }))}>
              <option value="">Todas las sucursales</option>
              {sucursales.map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <select value={devolFiltro.empleado_id} onChange={(e) => setDevolFiltro((s: any) => ({ ...s, empleado_id: e.target.value }))}>
              <option value="">Todos los empleados</option>
              {usuarios.filter((u: any) => !devolFiltro.sucursal_id || u.sucursal_id === devolFiltro.sucursal_id).map((u: any) => <option key={u.id} value={u.id}>{u.nombre_completo}</option>)}
            </select>
            {devolFiltro.modo === 'dia' && <input type="date" value={devolFiltro.fecha} onChange={(e) => setDevolFiltro((s: any) => ({ ...s, fecha: e.target.value }))} />}
            {devolFiltro.modo === 'mes' && <input type="month" value={devolFiltro.mes} onChange={(e) => setDevolFiltro((s: any) => ({ ...s, mes: e.target.value }))} />}
            {devolFiltro.modo === 'rango' && (
              <>
                <input type="date" value={devolFiltro.desde} onChange={(e) => setDevolFiltro((s: any) => ({ ...s, desde: e.target.value }))} />
                <input type="date" value={devolFiltro.hasta} onChange={(e) => setDevolFiltro((s: any) => ({ ...s, hasta: e.target.value }))} />
              </>
            )}
          </div>
          <table className="table-premium">
            <thead><tr><th>NC</th><th>Factura</th><th>Cliente</th><th>Vendida</th><th>Devuelta</th><th>Monto</th></tr></thead>
            <tbody>
              {devolucionesFiltradas.length === 0 ? <tr><td colSpan={6} style={{ textAlign: 'center' }}>Sin devoluciones</td></tr> : devolucionesFiltradas.map((n: any) => (
                <tr key={n.id}>
                  <td>{n.numero}</td>
                  <td>{n.venta_numero || '-'}</td>
                  <td>{n.cliente_nombre}</td>
                  <td>{n.venta_fecha ? new Date(n.venta_fecha).toLocaleString() : '-'}</td>
                  <td>{n.fecha_creacion ? new Date(n.fecha_creacion).toLocaleString() : '-'}</td>
                  <td>RD$ {money(Number(n.monto_original || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      )}
      {modulo === 'por-vencer' && usuario.rol === 'revendedor' && (
        <article className="panel-card">
          <div className="panel-head"><h3>Facturas por vencer (10 días)</h3><span className="chip chip-warning">{porVencerRev.length} facturas</span></div>
          <table className="table-premium">
            <thead><tr><th>Factura</th><th>Cliente</th><th>Vence</th><th>Días</th><th>Pendiente</th><th>Acción</th></tr></thead>
            <tbody>
              {porVencerRev.length === 0 ? <tr><td colSpan={6} style={{ textAlign: 'center' }}>Sin facturas por vencer</td></tr> : porVencerRev.map((x: any) => {
                const dias = Math.ceil((new Date(String(x.fecha_vencimiento)).getTime() - Date.now()) / 86400000);
                return <tr key={x.id}>
                  <td>{x.numero_interno}</td><td>{x.cliente_nombre}</td><td>{String(x.fecha_vencimiento).slice(0, 10)}</td><td>{dias}</td><td>RD$ {money(Number(x.balance_pendiente || 0))}</td>
                  <td><button className="btn btn-primary" onClick={() => { cambiarModuloConRuta('cxc'); setTimeout(() => setCxcCobroModal(x), 50); }}>Cobrar</button></td>
                </tr>;
              })}
            </tbody>
          </table>
        </article>
      )}
      {modulo === 'eventos' && usuario.rol === 'administrador' && (
        <article className="panel-card">
          <div className="panel-head"><h3>Eventos</h3><span className="chip chip-soft">{eventos.length}</span></div>
          <table className="table-premium">
            <thead><tr><th>Fecha/Hora</th><th>Entidad</th><th>Acción</th><th>Descripción</th><th>Usuario</th></tr></thead>
            <tbody>
              {eventos.length === 0 ? <tr><td colSpan={5} style={{ textAlign: 'center' }}>Sin eventos</td></tr> : eventos.map((e: any) => (
                <tr key={e.id}>
                  <td>{e.fecha_creacion ? new Date(e.fecha_creacion).toLocaleString() : '-'}</td>
                  <td>{e.entidad}</td>
                  <td>{e.accion}</td>
                  <td>{e.descripcion}</td>
                  <td>{e.usuario_nombre || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      )}
      {modulo === 'chofer' && usuario.rol === 'chofer' && (
        <article className="panel-card">
          <h3 style={{ fontSize: 18, marginBottom: 14 }}>🚗 Mis entregas en camino</h3>
          {ordenes.length === 0 ? (
            <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>No tienes entregas asignadas actualmente.</p>
          ) : (
            <table className="tabla-base" style={{ width: '100%' }}>
              <thead>
                <tr><th>Orden</th><th>Cliente</th><th>Dirección</th><th>Teléfono</th><th>Acción</th></tr>
              </thead>
              <tbody>
                {ordenes.map((o: any) => (
                  <tr key={o.id}>
                    <td><strong>{o.numero_orden}</strong></td>
                    <td>{o.cliente_nombre}</td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{[o.direccion, o.ciudad].filter(Boolean).join(', ') || '—'}</td>
                    <td style={{ fontSize: 12 }}>{o.telefono_1 || '—'}</td>
                    <td>
                      <button className="btn btn-primary" style={{ background: '#16a34a', padding: '5px 12px', fontSize: 13 }}
                        onClick={async () => {
                          try {
                            await api(`/orders/${o.id}/entregado`, token, { method: 'POST' });
                            toast('ok', '¡Entrega confirmada!');
                            await cargarTodo();
                          } catch (er: any) { toast('error', er.message); }
                        }}>✅ Confirmar entrega</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
      )}
    </Layout>
    {modalConfigReporte && (
      <div className="modal-backdrop">
        <div className="modal-card" style={{ maxWidth: 520 }}>
          <div className="modal-header"><h3>¿Cómo deseas generar el reporte?</h3><button className="btn btn-ghost" onClick={() => setModalConfigReporte('')}>✕</button></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { k: 'hoy', t: 'Hoy' },
              { k: 'dia', t: 'Día' },
              { k: 'mes', t: 'Mes' },
              { k: 'rango', t: 'Rango de fechas' },
            ].map((opt) => (
              <button key={opt.k} className="btn btn-primary" onClick={() => {
                if (modalConfigReporte === 'historial-ventas') setHistorialFiltro((s: any) => ({ ...s, modo: opt.k, sucursal_id: s.sucursal_id || sucursalId }));
                if (modalConfigReporte === 'devoluciones') setDevolFiltro((s: any) => ({ ...s, modo: opt.k, sucursal_id: s.sucursal_id || sucursalId }));
                setModalConfigReporte('');
              }}>{opt.t}</button>
            ))}
          </div>
        </div>
      </div>
    )}
    {ventaDetalleModal?.venta && (
      <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setVentaDetalleModal(null); }}>
        <div className="modal-card" style={{ maxWidth: 860 }}>
          <div className="modal-header"><h3>Factura {ventaDetalleModal.venta.numero_interno}</h3><button className="btn btn-ghost" onClick={() => setVentaDetalleModal(null)}>✕</button></div>
          <p>{new Date(ventaDetalleModal.venta.fecha_creacion).toLocaleString()} · {ventaDetalleModal.venta.cliente_nombre}</p>
          <table className="table-premium"><thead><tr><th>Producto</th><th>Cant</th><th>Precio</th><th>Total</th></tr></thead><tbody>
            {(ventaDetalleModal.detalle || []).map((d: any) => <tr key={d.id}><td>{d.descripcion}</td><td>{d.cantidad}</td><td>RD$ {money(Number(d.precio_unitario))}</td><td>RD$ {money(Number(d.subtotal_linea))}</td></tr>)}
          </tbody></table>
        </div>
      </div>
    )}
    <div className="toast-stack">{toasts.map((t) => <div key={t.id} className={`toast ${t.tipo}`}>{t.texto}</div>)}</div>
  </>;
}

const rootContainer = document.getElementById('root')!;
const existingRoot = (rootContainer as any).__reactRoot;
if (existingRoot) {
  existingRoot.render(<React.StrictMode><App /></React.StrictMode>);
} else {
  const newRoot = createRoot(rootContainer);
  (rootContainer as any).__reactRoot = newRoot;
  newRoot.render(<React.StrictMode><App /></React.StrictMode>);
}
