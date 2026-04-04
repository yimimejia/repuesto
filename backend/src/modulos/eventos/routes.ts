import { Router } from 'express';
import { auth, permitir } from '../../shared/auth.js';
import { db } from '../../db/connection.js';

const eventosRouter = Router();
eventosRouter.use(auth);

eventosRouter.get('/', permitir('administrador'), (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 200), 500);
  const desde = String(req.query.desde ?? '').trim();
  const hasta = String(req.query.hasta ?? '').trim();
  let sql = `SELECT a.*, u.nombre_completo as usuario_nombre
    FROM auditoria_logs a
    LEFT JOIN usuarios u ON u.id=a.usuario_id
    WHERE 1=1`;
  const params: any[] = [];
  if (desde) { sql += ' AND datetime(a.fecha_creacion) >= datetime(?)'; params.push(desde); }
  if (hasta) { sql += ' AND datetime(a.fecha_creacion) <= datetime(?)'; params.push(hasta); }
  sql += ' ORDER BY a.fecha_creacion DESC LIMIT ?';
  params.push(limit);
  res.json(db.prepare(sql).all(...params));
});

export { eventosRouter };
