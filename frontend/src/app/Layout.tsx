import { ReactNode } from 'react';

export interface MenuItem {
  key: string;
  label: string;
  icono: string;
  acento?: string;
}

interface LayoutProps {
  usuario: { nombre: string; rol: string };
  moduloActivo: string;
  onCambiarModulo: (key: string) => void;
  onCerrarSesion: () => void;
  menu: MenuItem[];
  tituloModulo: string;
  esDashboard?: boolean;
  bannerRed?: { tipo: 'ok' | 'warning'; texto: string } | null;
  kpis: Array<{ titulo: string; valor: string; subtitulo: string; tono: 'azul' | 'rojo' | 'verde' | 'gris' }>;
  ocultarSidebar?: boolean;
  children: ReactNode;
}

export function Layout({ usuario, moduloActivo, onCambiarModulo, onCerrarSesion, menu, tituloModulo, esDashboard, bannerRed, kpis, ocultarSidebar, children }: LayoutProps) {
  return (
    <div className={`layout-shell ${ocultarSidebar ? 'no-sidebar' : ''}`}>
      {!ocultarSidebar && <aside className="sidebar-premium">
        <div className="brand-box">
          <img className="brand-image" src="/logo-repuestos-calcano.svg" alt="Logo Repuestos Calcaño" />
          <div>
            <h1>Repuestos Calcaño</h1>
            <p>POS Comercial</p>
          </div>
        </div>

        <nav className="sidebar-menu">
          {menu.map((item) => (
            <button
              key={item.key}
              className={`menu-item ${moduloActivo === item.key ? 'activo' : ''} ${item.acento ? 'acento-' + item.acento : ''}`}
              onClick={() => onCambiarModulo(item.key)}
            >
              <span className="menu-icon">{item.icono}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="sidebar-user-name">{usuario.nombre}</span>
            <span className="sidebar-user-rol">{usuario.rol}</span>
          </div>
          <button className="btn-logout" onClick={onCerrarSesion} title="Cerrar sesión">
            ⏻ Salir
          </button>
        </div>
      </aside>}

      <main className="main-shell">
        {bannerRed && (
          <div className={`network-banner ${bannerRed.tipo}`}>
            {bannerRed.texto}
          </div>
        )}

        <header className="topbar-premium">
          <div className="topbar-title compact">
            <h2>{tituloModulo}</h2>
            {esDashboard && <p>{usuario.nombre} · {usuario.rol}</p>}
          </div>
          <div className="topbar-user-chip">
            <span className="chip chip-user">{usuario.rol}</span>
            <span style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>{usuario.nombre}</span>
            <button className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={onCerrarSesion}>⏻ Cerrar sesión</button>
          </div>
        </header>

        {ocultarSidebar && menu.length > 0 && (
          <div style={{ display: 'flex', gap: 8, margin: '0 0 12px 0', flexWrap: 'wrap' }}>
            {menu.map((item) => (
              <button
                key={item.key}
                className={`btn ${moduloActivo === item.key ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => onCambiarModulo(item.key)}
              >
                {item.icono} {item.label}
              </button>
            ))}
          </div>
        )}

        {esDashboard && kpis.length > 0 && (
          <section className="kpi-grid">
            {kpis.map((kpi) => (
              <article key={kpi.titulo} className={`kpi-card ${kpi.tono}`}>
                <div className="kpi-title">{kpi.titulo}</div>
                <div className="kpi-value">{kpi.valor}</div>
                <div className="kpi-sub">{kpi.subtitulo}</div>
              </article>
            ))}
          </section>
        )}

        <section className="workspace">{children}</section>
      </main>
    </div>
  );
}
