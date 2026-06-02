import type { Mensaje } from './verticals.js';

interface TemplateData {
  nombre: string;
  ciudad?: string;
  color: string;
  subtitulo: string;
  mensajes: Mensaje[];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Escapa, convierte *negrita* y saltos de línea. */
function formatText(s: string): string {
  return escapeHtml(s)
    .replace(/\*(.+?)\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br>');
}

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function bubble(m: Mensaje): string {
  const lado = m.from === 'asistente' ? 'out' : 'in';
  const check = m.from === 'asistente' ? '<span class="check">✓✓</span>' : '';
  return `<div class="row ${lado}"><div class="bubble ${lado}">${formatText(m.text)}<span class="time">${escapeHtml(m.hora)} ${check}</span></div></div>`;
}

/** Construye el HTML completo del boceto (mockup de chat de WhatsApp + caption). */
export function buildHtml(d: TemplateData): string {
  const bubbles = d.mensajes.map(bubble).join('\n');
  const sub = d.ciudad ? `${escapeHtml(d.ciudad)} · en línea` : 'en línea';

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  body { background: #e9edef; padding: 28px; }
  #card { width: 392px; margin: 0 auto; border-radius: 18px; overflow: hidden; box-shadow: 0 18px 50px rgba(0,0,0,.18); background: #fff; }

  .header { background: #075E54; color: #fff; display: flex; align-items: center; gap: 10px; padding: 12px 14px; }
  .back { font-size: 20px; opacity: .9; }
  .avatar { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
            font-weight: 700; font-size: 16px; color: #fff; flex: 0 0 auto; }
  .hname { font-size: 16px; font-weight: 600; line-height: 1.15; }
  .hsub { font-size: 12px; opacity: .85; }
  .hicons { margin-left: auto; opacity: .85; font-size: 17px; letter-spacing: 6px; }

  .chat { background: #efeae2; padding: 14px 12px 18px; min-height: 120px; }
  .row { display: flex; margin: 6px 0; }
  .row.in { justify-content: flex-start; }
  .row.out { justify-content: flex-end; }
  .bubble { max-width: 78%; padding: 7px 9px 5px; border-radius: 9px; font-size: 14.3px; line-height: 1.38;
            color: #111b21; box-shadow: 0 1px .5px rgba(0,0,0,.13); position: relative; white-space: normal; word-wrap: break-word; }
  .bubble.in { background: #fff; border-top-left-radius: 2px; }
  .bubble.out { background: #d9fdd3; border-top-right-radius: 2px; }
  .bubble b { font-weight: 700; }
  .time { display: block; text-align: right; font-size: 10.5px; color: #667781; margin-top: 2px; }
  .check { color: #53bdeb; font-size: 11px; }

  .caption { padding: 14px 16px 16px; text-align: center; border-top: 3px solid ${d.color}; background: #fff; }
  .cname { font-size: 16px; font-weight: 700; color: #111b21; }
  .csub { font-size: 12.5px; color: #54656f; margin-top: 4px; line-height: 1.35; }
  .badge { display: inline-block; margin-top: 9px; font-size: 11.5px; font-weight: 600; color: ${d.color};
           background: ${d.color}18; border-radius: 20px; padding: 4px 11px; }
</style></head>
<body>
  <div id="card">
    <div class="header">
      <span class="back">‹</span>
      <div class="avatar" style="background:${d.color}">${escapeHtml(iniciales(d.nombre))}</div>
      <div>
        <div class="hname">${escapeHtml(d.nombre)}</div>
        <div class="hsub">${sub}</div>
      </div>
      <div class="hicons">📹 📞</div>
    </div>
    <div class="chat">
      ${bubbles}
    </div>
    <div class="caption">
      <div class="cname">${escapeHtml(d.nombre)}</div>
      <div class="csub">${escapeHtml(d.subtitulo)}</div>
      <span class="badge">🤖 Asistente de IA · responde en segundos, 24/7</span>
    </div>
  </div>
</body></html>`;
}
