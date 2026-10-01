// Stream Deck プラグイン本体: ローカルAPIを10秒ごとに取得してキー画像(SVG)を更新
const API = 'http://127.0.0.1:7777';
const COLORS = { claude: '#f59e0b', codex: '#38bdf8', chatgpt: '#34d399' };
const contexts = {}; // context -> serviceId
let ws;

function connectElgatoStreamDeckSocket(port, uuid, registerEvent) {
  ws = new WebSocket('ws://127.0.0.1:' + port);
  ws.onopen = () => ws.send(JSON.stringify({ event: registerEvent, uuid }));
  ws.onmessage = async (m) => {
    const e = JSON.parse(m.data);
    const id = e.action && e.action.split('.').pop();
    if (e.event === 'willAppear') { contexts[e.context] = id; refresh(); }
    if (e.event === 'willDisappear') delete contexts[e.context];
    if (e.event === 'keyDown') {
      if (id === 'chatgpt') { await fetch(API + '/api/chatgpt', { method: 'POST', body: JSON.stringify({ increment: 1 }) }).catch(() => {}); refresh(); }
      else ws.send(JSON.stringify({ event: 'openUrl', payload: { url: API } }));
    }
  };
}

// 72x72 のゲージ付きSVG
function svg(name, p, sub, color) {
  const c = p >= 90 ? '#ef4444' : p >= 70 ? '#f59e0b' : color;
  const w = Math.round((p / 100) * 60);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect width="72" height="72" fill="#0f172a"/>
  <text x="36" y="16" fill="${color}" font-size="11" font-family="sans-serif" font-weight="bold" text-anchor="middle">${name}</text>
  <text x="36" y="45" fill="#fff" font-size="26" font-family="sans-serif" font-weight="bold" text-anchor="middle">${p === null ? '-' : Math.round(p) + '%'}</text>
  <rect x="6" y="52" width="60" height="6" rx="3" fill="#334155"/><rect x="6" y="52" width="${w}" height="6" rx="3" fill="${c}"/>
  <text x="36" y="68" fill="#94a3b8" font-size="9" font-family="sans-serif" text-anchor="middle">${sub}</text></svg>`;
}

async function refresh() {
  if (!ws || ws.readyState !== 1) return;
  let d;
  try { d = await (await fetch(API + '/api/usage')).json(); }
  catch { for (const c in contexts) setImage(c, svg('AI', 0, 'offline', '#ef4444')); return; }
  for (const [ctx, id] of Object.entries(contexts)) {
    const s = d.services.find((x) => x.id === id);
    const w = s && s.windows[0];
    const sub = w ? (w.resetsAt ? Math.max(0, Math.round((w.resetsAt - Date.now()) / 60000)) + 'm left' : w.label) : 'no data';
    const label = { claude: 'Claude', codex: 'Codex', chatgpt: 'ChatGPT' }[id];
    setImage(ctx, svg(label, w ? w.percent : 0, sub, COLORS[id]));
  }
}
function setImage(context, s) {
  ws.send(JSON.stringify({ event: 'setImage', context, payload: { image: 'data:image/svg+xml;charset=utf8,' + encodeURIComponent(s), target: 0 } }));
}
setInterval(refresh, 10000);
