# Repuestos Calcaño POS

Sistema de punto de venta (POS) local-first para Repuestos Calcaño. Opera en red local (LAN) con soporte para sincronización a nube futura.

## Arquitectura

- **Backend** (`backend/`): API REST + WebSocket en Express.js con TypeScript. Puerto 3000.
- **Frontend** (`frontend/`): React + Vite, TypeScript. Puerto 5000.
- **Base de datos**: SQLite via `better-sqlite3` (archivo local `backend/pos-local.db`).

## Módulos (menú administrador)

1. **Dashboard** — KPIs diarios y accesos rápidos
2. **POS Vendedor** — carrito con imagen/sin imagen, descuentos 5%/8%, búsqueda cliente por nombre o teléfono, registro rápido de cliente nuevo, envío a cajero (vendedor) o registrar venta (cajero/admin)
3. **Caja / Cobros** — bandeja del cajero (cajero tiene acceso a POS ahora)
4. **Cuentas por Cobrar** — todas las facturas a crédito con balance y estado
5. **Productos** — modal para agregar/editar con labels descriptivos, imagen thumbnail en tabla
6. **Clientes** — modal "Nuevo Cliente", crédito cerrado por defecto, editar por fila, toggle crédito (solo admin), sin campos de foto/sucursal, código auto-generado CLI-XXXX. Incluye checkbox para inscribir en Programa de Fidelidad.
6b. **Fidelidad** ⭐ — módulo independiente con lista de miembros, puntos acumulados, puntos disponibles, total compras/gastado. Tabla `movimientos_fidelidad` registra 1 punto por cada peso gastado automáticamente al completar una venta. Acceso en menú: vendedor, cajero y administrador. Botón "⭐ Fidelidad" en POS para inscribir clientes rápidamente.
7. **Devoluciones / Notas de Crédito** — sistema completo: al seleccionar tipo "Devolución" se abre modal que busca la venta original, selecciona items a devolver (con cantidad), genera Nota de Crédito automática (NC-0001...) que devuelve producto al inventario sin tocar caja. La NC se puede imprimir como comprobante fiscal. Se puede usar como forma de pago ("Nota de Crédito") en futuras compras: si NC > total se genera nueva NC con saldo restante; si NC < total aparece modal para pagar la diferencia con otro método.
7b. **Compras** — compras a suplidores con items
8. **Inventario Sucursal** — tiles de sucursales → click → productos de esa sucursal
9. **Suc / Cat / Suplidor** — maestros (sucursales, categorías, suplidores)
10. **Usuarios** — empleados con modal "Registro de Usuario" para crear nuevos
11. **Importar SQL** — importador de base legada SQL Server
12. **Reportes** — botones por tipo de reporte con vista de datos
13. **Contabilidad** — historial de cuadres de caja con estado Inconsistente/Normal
14. **Formato 606 DGII** — módulo tributario completo: registros de compras fiscales, validación, exportación TXT oficial DGII, gestión de períodos (abrir/cerrar), catálogos parametrizables (tipo identificación, bienes/servicios, retención ISR, forma de pago, tipo comprobante), configuración tributaria (RNC, emisor electrónico, reglas serie B/E), historial de exportaciones, auditoría de cambios. API: `/api/tax606/*`

## Sucursales automáticas

- `PRINCIPAL` — Sucursal Principal (creada si no existe al iniciar)
- `SUC-11` — Sucursal 11 (creada si no existe al iniciar, en connection.ts)

## Workflows

- **Start application**: `cd frontend && npm run dev` — interfaz en puerto 5000
- **Backend API**: `cd backend && npm run dev` — API REST + WebSocket en puerto 3000

## Variables de entorno

- `PUERTO`: puerto del backend (por defecto `3000`)
- `JWT_SECRETO`: secreto para tokens JWT (por defecto `super-secreto-local`)
- `ADMIN_OVERRIDE_PASSWORD`: contraseña de administrador (por defecto `admin123`)
- `DB_PATH`: ruta del archivo SQLite (por defecto `./pos-local.db`)

## Tecnologías

- Node.js 20 / TypeScript
- Express.js, better-sqlite3, ws (WebSocket), jsonwebtoken, zod
- React 18, React Router DOM, Vite 6
