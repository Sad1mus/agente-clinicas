import http from 'node:http';
import { config } from '../config.js';
import { getClinicByDashboardToken, getDashboardData } from '../db.js';
import { dashboardPage } from './html.js';

/**
 * Panel de clientas (dashboard web) — incluido en TODOS los planes.
 *
 * Multi-tenant por token: cada clínica tiene su dashboard_token y entra por
 *   http://<host>:<puerto>/d/<token>
 * Sin login: el token largo ES la llave (como un link privado de Google Docs).
 *
 * Rutas:
 *   GET /d/<token>    → página HTML del panel
 *   GET /api/<token>  → datos JSON (los consume la página, refresco cada 30s)
 */
export function startDashboard(): http.Server {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      const [, ruta, token] = url.pathname.split('/');

      if (!token || (ruta !== 'd' && ruta !== 'api')) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('No encontrado');
        return;
      }

      const clinic = await getClinicByDashboardToken(token);
      if (!clinic) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Acceso no válido');
        return;
      }

      if (ruta === 'd') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(dashboardPage(token));
        return;
      }

      // ruta === 'api'
      const data = await getDashboardData(clinic);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(data));
    } catch (err) {
      console.error('[dashboard] error:', err);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Error interno');
    }
  });

  server.listen(config.dashboardPort, () => {
    console.log(`📊 Panel de clientas en http://localhost:${config.dashboardPort}/d/<token>`);
  });

  return server;
}
