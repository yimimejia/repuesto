import { Router } from 'express';
import { auth, permitir } from '../../shared/auth.js';
import { db } from '../../db/connection.js';
import { v4 as uuid } from 'uuid';
import { hashPassword } from '../../shared/security.js';

const usuariosRouter = Router();
usuariosRouter.use(auth);

usuariosRouter.get('/vendedores', permitir('vendedor', 'cajero', 'administrador', 'al_por_mayor'), (req, res) => {
  const sucursalId = String(req.query.sucursal_id ?? '').trim();
  const rows = sucursalId
    ? db.prepare(`SELECT DISTINCT u.id, u.nombre_completo, u.username FROM usuarios u
      JOIN roles r ON r.id=u.rol_id
      JOIN usuarios_sucursales us ON us.usuario_id=u.id
      WHERE r.nombre='vendedor' AND u.estado='activo' AND us.sucursal_id=? ORDER BY u.nombre_completo ASC`).all(sucursalId)
    : db.prepare(`SELECT u.id, u.nombre_completo, u.username FROM usuarios u JOIN roles r ON r.id=u.rol_id
      WHERE r.nombre='vendedor' AND u.estado='activo' ORDER BY u.nombre_completo ASC`).all();
  res.json(rows);
});

usuariosRouter.get('/pickers', permitir('cajero', 'administrador'), (_req, res) => {
  const rows = db.prepare(`SELECT u.id, u.nombre_completo, u.username, r.nombre as rol
    FROM usuarios u JOIN roles r ON r.id=u.rol_id
    WHERE u.estado='activo'
    ORDER BY u.nombre_completo ASC`).all();
  res.json(rows);
});

usuariosRouter.use(permitir('administrador'));

usuariosRouter.get('/', (_req, res) => {
  const rows = db.prepare(`SELECT u.id, u.username, u.nombre_completo, u.estado, r.nombre as rol,
      (SELECT us.sucursal_id FROM usuarios_sucursales us WHERE us.usuario_id=u.id ORDER BY us.es_predeterminada DESC, us.fecha_creacion ASC LIMIT 1) as sucursal_id,
      (SELECT GROUP_CONCAT(s.nombre, ', ') FROM usuarios_sucursales us JOIN sucursales s ON s.id=us.sucursal_id WHERE us.usuario_id=u.id) as sucursales,
      EXISTS(
        SELECT 1 FROM usuario_capacidades uc
        JOIN capacidades c ON c.id=uc.capacidad_id
        WHERE uc.usuario_id=u.id AND c.codigo='can_verify'
      ) as puede_verificar
    FROM usuarios u JOIN roles r ON r.id=u.rol_id ORDER BY u.nombre_completo ASC`).all();
  res.json(rows);
});
usuariosRouter.get('/roles', (_req, res) => res.json(db.prepare('SELECT * FROM roles ORDER BY nombre ASC').all()));

usuariosRouter.post('/', (req, res) => {
  const { username, nombre_completo, password, rol, sucursal_id } = req.body as any;
  if (!username || !nombre_completo || !password || !rol) return res.status(400).json({ error: 'Campos requeridos incompletos' });
  const role = db.prepare('SELECT id FROM roles WHERE nombre=?').get(rol) as { id: string } | undefined;
  if (!role) return res.status(400).json({ error: 'Rol inválido' });
  const now = new Date().toISOString();
  const id = uuid();
  try {
    const tx = db.transaction(() => {
      db.prepare(`INSERT INTO usuarios(id,username,nombre_completo,password_hash,rol_id,estado,fecha_creacion,fecha_actualizacion)
        VALUES(?,?,?,?,?,'activo',?,?)`).run(id, username, nombre_completo, hashPassword(password), role.id, now, now);
      if (sucursal_id) {
        db.prepare('INSERT INTO usuarios_sucursales(id,usuario_id,sucursal_id,es_predeterminada,fecha_creacion) VALUES(?,?,?,?,?)').run(uuid(), id, sucursal_id, 1, now);
      }
    });
    tx();
    return res.status(201).json({ ok: true });
  } catch {
    return res.status(409).json({ error: 'No se pudo crear usuario (usuario duplicado?)' });
  }
});

usuariosRouter.post('/:id/sucursales', (req, res) => {
  const { sucursal_id, es_predeterminada = false } = req.body;
  if (!sucursal_id) return res.status(400).json({ error: 'Sucursal requerida' });
  const now = new Date().toISOString();
  if (es_predeterminada) db.prepare('UPDATE usuarios_sucursales SET es_predeterminada=0 WHERE usuario_id=?').run(req.params.id);
  db.prepare('INSERT OR IGNORE INTO usuarios_sucursales(id,usuario_id,sucursal_id,es_predeterminada,fecha_creacion) VALUES(?,?,?,?,?)').run(uuid(), req.params.id, sucursal_id, es_predeterminada ? 1 : 0, now);
  res.json({ ok: true });
});

usuariosRouter.put('/:id', (req, res) => {
  const { username, nombre_completo, password, rol, sucursal_id, estado, puede_agregar_fidelidad, puede_verificar } = req.body as any;
  const actual = db.prepare('SELECT * FROM usuarios WHERE id=?').get(req.params.id) as any;
  if (!actual) return res.status(404).json({ error: 'Usuario no encontrado' });
  const role = rol ? db.prepare('SELECT id FROM roles WHERE nombre=?').get(rol) as { id: string } | undefined : undefined;
  if (rol && !role) return res.status(400).json({ error: 'Rol inválido' });

  const now = new Date().toISOString();
  try {
    const tx = db.transaction(() => {
      const passwordHash = password && String(password).trim() ? hashPassword(String(password)) : actual.password_hash;
      db.prepare(`UPDATE usuarios
        SET username=?, nombre_completo=?, password_hash=?, rol_id=?, estado=?, puede_agregar_fidelidad=?, fecha_actualizacion=?
        WHERE id=?`)
        .run(
          username ?? actual.username,
          nombre_completo ?? actual.nombre_completo,
          passwordHash,
          role?.id ?? actual.rol_id,
          estado ?? actual.estado,
          puede_agregar_fidelidad ? 1 : 0,
          now,
          req.params.id,
        );

      if (sucursal_id !== undefined) {
        db.prepare('DELETE FROM usuarios_sucursales WHERE usuario_id=?').run(req.params.id);
        if (sucursal_id) {
          db.prepare('INSERT INTO usuarios_sucursales(id,usuario_id,sucursal_id,es_predeterminada,fecha_creacion) VALUES(?,?,?,?,?)')
            .run(uuid(), req.params.id, sucursal_id, 1, now);
        }
      }

      if (puede_verificar !== undefined) {
        const cap = db.prepare("SELECT id FROM capacidades WHERE codigo='can_verify'").get() as any;
        if (cap?.id) {
          if (puede_verificar) {
            db.prepare('INSERT OR IGNORE INTO usuario_capacidades(id,usuario_id,capacidad_id,fecha_creacion) VALUES(?,?,?,?)')
              .run(uuid(), req.params.id, cap.id, now);
          } else {
            db.prepare('DELETE FROM usuario_capacidades WHERE usuario_id=? AND capacidad_id=?').run(req.params.id, cap.id);
          }
        }
      }
    });
    tx();
    return res.json({ ok: true });
  } catch {
    return res.status(409).json({ error: 'No se pudo actualizar usuario (usuario duplicado?)' });
  }
});

usuariosRouter.delete('/:id', (req, res) => {
  const row = db.prepare("UPDATE usuarios SET estado='inactivo', fecha_actualizacion=? WHERE id=? AND estado='activo'").run(new Date().toISOString(), req.params.id);
  if (!row.changes) return res.status(404).json({ error: 'Usuario no encontrado o ya inactivo' });
  return res.json({ ok: true });
});

export { usuariosRouter };
