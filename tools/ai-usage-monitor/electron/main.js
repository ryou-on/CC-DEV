// デスクトップアプリ: メニューバー(Tray)に使用率を表示し、クリックでダッシュボードを開く
const { app, Tray, Menu, BrowserWindow, nativeImage } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = process.env.AI_USAGE_PORT || 7777;
const URL_BASE = `http://127.0.0.1:${PORT}`;
let tray, win, server;
const AB = { claude: 'C', codex: 'X', chatgpt: 'G' };

// サーバーが未起動なら子プロセスで起動
async function ensureServer() {
  try { await fetch(`${URL_BASE}/api/usage`); } catch {
    server = spawn(process.execPath.includes('Electron') ? 'node' : process.execPath, [path.join(__dirname, '../src/server.mjs')], { stdio: 'ignore' });
    await new Promise((r) => setTimeout(r, 800));
  }
}

function openWindow() {
  if (win) return win.show();
  win = new BrowserWindow({ width: 980, height: 640, title: 'AI Usage Monitor', backgroundColor: '#0f172a' });
  win.loadURL(URL_BASE);
  win.on('closed', () => (win = null));
}

async function refresh() {
  try {
    const d = await (await fetch(`${URL_BASE}/api/usage`)).json();
    tray.setTitle(d.services.map((s) => `${AB[s.id]} ${s.windows[0] ? Math.round(s.windows[0].percent) + '%' : '-'}`).join(' '));
    const items = [];
    for (const s of d.services) {
      items.push({ label: s.name, enabled: false });
      for (const w of s.windows) items.push({ label: `  ${w.label}: ${Math.round(w.percent)}%  ${w.detail}`, enabled: false });
      items.push({ type: 'separator' });
    }
    items.push({ label: 'ダッシュボードを開く', click: openWindow }, { label: '終了', role: 'quit' });
    tray.setContextMenu(Menu.buildFromTemplate(items));
  } catch { tray.setTitle('AI ⚠️'); }
}

app.whenReady().then(async () => {
  if (app.dock) app.dock.hide();
  await ensureServer();
  tray = new Tray(nativeImage.createEmpty());
  tray.on('click', openWindow);
  refresh();
  setInterval(refresh, 15000);
});
app.on('window-all-closed', (e) => e.preventDefault()); // ウィンドウを閉じてもメニューバーに常駐
app.on('quit', () => server && server.kill());
