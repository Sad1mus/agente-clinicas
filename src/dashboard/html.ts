/**
 * HTML del panel de clientas. Una sola página: carga los datos del endpoint
 * JSON de su clínica y se refresca sola cada 30 segundos. Mobile-first
 * (los dueños de clínica lo abren desde el celular).
 */
export function dashboardPage(token: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Panel de clientas</title>
<style>
  :root {
    --verde: #075e54; --verde-claro: #25d366; --verde-suave: #dcf8c6;
    --fondo: #f0f2f5; --blanco: #fff; --texto: #111b21; --gris: #667781;
    --rojo: #ea5455; --ambar: #ff9f43;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: var(--fondo); color: var(--texto); }

  header { background: var(--verde); color: #fff; padding: 18px 20px; position: sticky; top: 0; z-index: 10; }
  header h1 { font-size: 1.15rem; font-weight: 600; }
  header .sub { font-size: 0.8rem; opacity: 0.85; margin-top: 2px; display: flex; align-items: center; gap: 8px; }
  .badge-plan { background: var(--verde-claro); color: var(--verde); font-weight: 700; font-size: 0.7rem; padding: 2px 8px; border-radius: 10px; text-transform: uppercase; }
  .punto-vivo { width: 8px; height: 8px; background: var(--verde-claro); border-radius: 50%; display: inline-block; animation: pulso 2s infinite; }
  @keyframes pulso { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

  main { max-width: 960px; margin: 0 auto; padding: 16px; }

  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 20px; }
  .kpi { background: var(--blanco); border-radius: 12px; padding: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .kpi .num { font-size: 1.8rem; font-weight: 700; color: var(--verde); }
  .kpi .lbl { font-size: 0.75rem; color: var(--gris); margin-top: 2px; }
  .kpi.alerta .num { color: var(--rojo); }

  .roi { background: linear-gradient(135deg, var(--verde) 0%, #0a8c7a 100%); color: #fff; border-radius: 12px; padding: 18px 20px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(7,94,84,0.3); display: none; }
  .roi .roi-num { font-size: 1.7rem; font-weight: 800; }
  .roi .roi-lbl { font-size: 0.8rem; opacity: 0.9; margin-top: 2px; }

  section { background: var(--blanco); border-radius: 12px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  section h2 { font-size: 0.95rem; margin-bottom: 12px; color: var(--verde); display: flex; align-items: center; gap: 6px; }

  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th { text-align: left; color: var(--gris); font-weight: 600; font-size: 0.72rem; text-transform: uppercase; padding: 6px 8px; border-bottom: 2px solid var(--fondo); }
  td { padding: 8px; border-bottom: 1px solid var(--fondo); }
  tr:last-child td { border-bottom: none; }

  .estado { font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 10px; white-space: nowrap; }
  .estado.agendada { background: #fff3cd; color: #856404; }
  .estado.confirmada { background: var(--verde-suave); color: var(--verde); }
  .estado.cancelada { background: #f8d7da; color: #721c24; }
  .escalado-si { color: var(--rojo); font-weight: 700; }

  .chat { display: flex; flex-direction: column; gap: 6px; max-height: 420px; overflow-y: auto; padding: 8px; background: #e5ddd5; border-radius: 8px; }
  .burbuja { max-width: 80%; padding: 8px 12px; border-radius: 8px; font-size: 0.83rem; line-height: 1.35; box-shadow: 0 1px 1px rgba(0,0,0,0.1); }
  .burbuja.user { background: var(--blanco); align-self: flex-start; }
  .burbuja.assistant { background: var(--verde-suave); align-self: flex-end; }
  .burbuja .meta { font-size: 0.65rem; color: var(--gris); margin-top: 4px; text-align: right; }

  .vacio { color: var(--gris); font-size: 0.85rem; text-align: center; padding: 20px; }
  footer { text-align: center; color: var(--gris); font-size: 0.72rem; padding: 20px; }
  @media (max-width: 600px) { .kpis { grid-template-columns: repeat(2, 1fr); } th:nth-child(5), td:nth-child(5) { display: none; } }
</style>
</head>
<body>
<header>
  <h1 id="nombre-clinica">Cargando…</h1>
  <div class="sub"><span class="punto-vivo"></span> Asistente activo 24/7 · <span class="badge-plan" id="plan"></span></div>
</header>
<main>
  <div class="roi" id="roi">
    <div class="roi-num" id="roi-num"></div>
    <div class="roi-lbl">💰 generados este mes por tu asistente (citas × valor promedio)</div>
  </div>

  <div class="kpis" id="kpis"></div>

  <section>
    <h2>📅 Próximas citas</h2>
    <div id="citas"></div>
  </section>

  <section>
    <h2>🔔 Leads y escalamientos</h2>
    <div id="leads"></div>
  </section>

  <section>
    <h2>💬 Conversaciones recientes</h2>
    <div class="chat" id="chat"></div>
  </section>
</main>
<footer>Panel de clientas · se actualiza solo cada 30 segundos</footer>

<script>
const TOKEN = ${JSON.stringify(token)};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function fmtFecha(f) {
  const [y, m, d] = f.split('-');
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return d + ' ' + meses[Number(m) - 1];
}

async function cargar() {
  const res = await fetch('/api/' + TOKEN);
  if (!res.ok) { document.getElementById('nombre-clinica').textContent = 'Acceso no válido'; return; }
  const d = await res.json();

  document.getElementById('nombre-clinica').textContent = d.clinica.nombre;
  document.getElementById('plan').textContent = 'Plan ' + d.clinica.plan;
  document.title = 'Panel · ' + d.clinica.nombre;

  const k = d.kpis;

  // Banner de ROI: solo llega en la respuesta si el plan de la clínica lo incluye.
  const roiBox = document.getElementById('roi');
  if (typeof k.roi_estimado_mes === 'number') {
    document.getElementById('roi-num').textContent =
      '~$' + k.roi_estimado_mes.toLocaleString('es-CO') + ' COP';
    roiBox.style.display = 'block';
  } else {
    roiBox.style.display = 'none';
  }

  document.getElementById('kpis').innerHTML =
    kpi(k.citas_hoy, 'Citas hoy') +
    kpi(k.citas_proximas, 'Citas próximas') +
    kpi(k.citas_ultimos_7d, 'Agendadas últimos 7 días') +
    kpi(k.clientes_totales, 'Clientes atendidos') +
    kpi(k.mensajes_hoy, 'Mensajes hoy') +
    kpi(k.escalamientos, 'Escalamientos', k.escalamientos > 0);

  document.getElementById('citas').innerHTML = d.citas.length === 0
    ? '<div class="vacio">Aún no hay citas próximas</div>'
    : '<table><tr><th>Fecha</th><th>Hora</th><th>Cliente</th><th>Servicio</th><th>Mascota</th><th>Estado</th></tr>' +
      d.citas.map(c =>
        '<tr><td>' + fmtFecha(c.fecha) + '</td><td>' + c.hora.slice(0,5) + '</td><td>' + esc(c.nombre) +
        '</td><td>' + esc(c.servicio ?? '—') + '</td><td>' + esc(c.mascota ?? '—') +
        '</td><td><span class="estado ' + c.estado + '">' + c.estado + '</span></td></tr>'
      ).join('') + '</table>';

  document.getElementById('leads').innerHTML = d.leads.length === 0
    ? '<div class="vacio">Aún no hay leads registrados</div>'
    : '<table><tr><th>Fecha</th><th>Nombre</th><th>Interés</th><th>Notas</th><th>Escalado</th></tr>' +
      d.leads.map(l =>
        '<tr><td>' + new Date(l.created_at).toLocaleDateString('es-CO', {day:'2-digit', month:'short'}) +
        '</td><td>' + esc(l.nombre ?? '—') + '</td><td>' + esc(l.interes ?? '—') + '</td><td>' + esc(l.notas ?? '—') +
        '</td><td>' + (l.escalado ? '<span class="escalado-si">⚠ Sí</span>' : 'No') + '</td></tr>'
      ).join('') + '</table>';

  document.getElementById('chat').innerHTML = d.conversaciones.length === 0
    ? '<div class="vacio">Aún no hay conversaciones</div>'
    : d.conversaciones.map(m =>
        '<div class="burbuja ' + m.role + '">' + esc(m.content) +
        '<div class="meta">' + (m.role === 'assistant' ? '🤖 Asistente · ' : '👤 Cliente · ') +
        new Date(m.created_at).toLocaleString('es-CO', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'}) +
        '</div></div>'
      ).join('');
}

function kpi(num, lbl, alerta) {
  return '<div class="kpi' + (alerta ? ' alerta' : '') + '"><div class="num">' + num + '</div><div class="lbl">' + lbl + '</div></div>';
}

cargar();
setInterval(cargar, 30000);
</script>
</body>
</html>`;
}
