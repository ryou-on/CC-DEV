/* ─────────────────────────────────────────
   YT → hihaho Tab  /  tab-template.js
   タブHTML生成の共有モジュール。
   background.js (importScripts) と editor.html (script tag) の両方から使う。
   ───────────────────────────────────────── */

const DEFAULT_DESIGN = {
  theme: 'light',          // light | dark
  accent: '#1a56db',       // アクセントカラー
  tabPos: 'center',        // left | center | right
  panelWidth: 980,         // パネル幅 px
  panelMaxH: 820,          // パネル最大高 px
  fontScale: 100,          // 文字サイズ %
  labelSummary: '📋 要約',
  labelGlossary: '📚 用語集',
};

function escTab(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* hexカラーを factor倍に暗く/明るくする（0.8=20%暗く） */
function shadeColor(hex, factor) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * factor)));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

function generateTabHTML(title, content, design) {
  const d = { ...DEFAULT_DESIGN, ...(design || {}) };
  const { summary, glossary } = content || {};
  const f = (d.fontScale || 100) / 100;
  const fs = base => Math.round(base * f);
  const accent = d.accent || '#1a56db';
  const accentDark = shadeColor(accent, 0.72);

  // テーマ別カラー変数
  const themeVars = d.theme === 'dark'
    ? `--bg:#152238;--bd:#31435f;--t:#e9eff8;--s:#9db0c8;--card-bg:#1b2c47;--card-bd:#2a3e5f;--hover:#20334f;--open-bg:#24395a;--cnt:#c9d6e8;--tab-bg:rgba(21,34,56,.97);--tab-hover:#1d3050;--rd-bg:#243450;--head:#8fb7ff;--acc-bd:#2a3e5f`
    : `--bg:#fff;--bd:#e2e8f0;--t:#1e293b;--s:#64748b;--card-bg:#f8faff;--card-bd:#dbeafe;--hover:#f0f7ff;--open-bg:#eff6ff;--cnt:#374151;--tab-bg:rgba(255,255,255,.96);--tab-hover:#eff6ff;--rd-bg:#f1f5f9;--head:${accentDark};--acc-bd:#e2e8f0`;

  // タブ位置別の配置CSS
  const pos = d.tabPos === 'left'
    ? { row: 'left:28px', panel: 'left:28px', closed: 'translateY(-102%)', open: 'translateY(0)' }
    : d.tabPos === 'right'
      ? { row: 'right:28px', panel: 'right:28px', closed: 'translateY(-102%)', open: 'translateY(0)' }
      : { row: 'left:50%;transform:translateX(-50%)', panel: 'left:50%', closed: 'translate(-50%,-102%)', open: 'translate(-50%,0)' };

  const summaryCards = (summary?.sections || []).map(s => `
        <div class="summary-card">
          <div class="s-head"><span class="s-emoji">${escTab(s.emoji)}</span>${escTab(s.heading)}</div>
          <div class="s-text">${escTab(s.text)}</div>
        </div>`).join('') || '<p style="color:var(--s);padding:12px">要約データなし</p>';
  const glossaryItems = (glossary || []).map((g, i) => `
        <div class="acc" id="g${i}">
          <div class="acc-h" onclick="tg('g${i}')">
            <span class="acc-term">${escTab(g.term)}</span>${g.reading ? `<span class="acc-rd">${escTab(g.reading)}</span>` : ''}
            <span class="acc-arr">▼</span>
          </div>
          <div class="acc-body"><div class="acc-cnt">${escTab(g.definition)}</div></div>
        </div>`).join('') || '<p style="color:var(--s);padding:12px">用語データなし</p>';

  return `<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escTab(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--a:${accent};--ad:${accentDark};--gold:#f59e0b;${themeVars}}
html,body{width:100%;height:100%;overflow:hidden;font-family:'Noto Sans JP',sans-serif;background:transparent;color:var(--t)}
.frame{position:fixed;inset:0;pointer-events:none}
.tab-row{position:absolute;top:0;${pos.row};display:flex;gap:10px;z-index:20;pointer-events:none}
.tab{pointer-events:auto;background:var(--tab-bg);color:var(--head);font-size:${fs(18)}px;font-weight:700;letter-spacing:.08em;padding:11px 32px;border:none;border-radius:0 0 18px 18px;box-shadow:0 5px 18px rgba(0,0,0,.3);cursor:pointer;display:flex;align-items:center;gap:8px;min-height:48px;transition:background .18s,color .18s,transform .1s;white-space:nowrap;border-top:3px solid var(--a)}
.tab:hover{background:var(--tab-hover)}.tab:active{transform:scale(.95)}
.tc{width:14px;height:14px;transition:transform .3s;flex-shrink:0}
.frame[data-open="true"] .tab[aria-pressed="true"]{background:var(--a);color:#fff;border-top-color:var(--gold)}
.frame[data-open="true"] .tab[aria-pressed="true"] .tc{transform:rotate(180deg)}
.panel{position:absolute;top:0;${pos.panel};width:${d.panelWidth}px;max-width:96vw;max-height:${d.panelMaxH}px;background:var(--bg);border-radius:0 0 20px 20px;box-shadow:0 14px 50px rgba(0,0,0,.4);pointer-events:auto;display:flex;flex-direction:column;z-index:10;transform:${pos.closed};transition:transform .4s cubic-bezier(.32,.72,0,1),visibility 0s linear .4s;overflow:hidden;visibility:hidden;border:1px solid var(--bd);border-top:none}
.frame[data-open="true"] .panel{transform:${pos.open};visibility:visible;transition:transform .4s cubic-bezier(.32,.72,0,1),visibility 0s linear 0s}
.pi{flex:1;overflow-y:auto;padding:52px 32px 24px}
.pi::-webkit-scrollbar{width:5px}
.pi::-webkit-scrollbar-thumb{background:var(--a);border-radius:3px;opacity:.5}
.sh{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;padding-bottom:12px;border-bottom:2px solid var(--a)}
.st{font-size:${fs(20)}px;font-weight:700;color:var(--head)}
.cb{width:38px;height:38px;border-radius:50%;background:var(--rd-bg);border:1.5px solid var(--bd);cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--s);transition:all .15s}
.cb:hover{background:#fee2e2;border-color:#f87171;color:#ef4444}.cb:active{transform:scale(.92)}
.cb svg{width:16px;height:16px}
.sec{display:none}
.frame[data-active="summary"] .sec[data-section="summary"]{display:block}
.frame[data-active="glossary"] .sec[data-section="glossary"]{display:block}
.summary-card{background:var(--card-bg);border:1px solid var(--card-bd);border-left:4px solid var(--a);border-radius:6px;padding:16px 20px;margin-bottom:12px}
.s-head{font-size:${fs(17)}px;font-weight:700;color:var(--head);margin-bottom:8px;display:flex;align-items:center;gap:8px}
.s-emoji{font-size:${fs(20)}px}
.s-text{font-size:${fs(15)}px;line-height:1.85;color:var(--cnt)}
.acc{background:var(--bg);border:1px solid var(--acc-bd);border-radius:6px;margin-bottom:8px;overflow:hidden;transition:box-shadow .15s}
.acc:hover{box-shadow:0 2px 8px rgba(26,86,219,.1)}
.acc-h{padding:14px 18px;cursor:pointer;display:flex;align-items:center;gap:12px;user-select:none;transition:background .15s}
.acc-h:hover{background:var(--hover)}
.acc.open .acc-h{background:var(--open-bg)}
.acc-term{font-size:${fs(17)}px;font-weight:700;flex:1}
.acc-rd{font-size:${fs(12)}px;color:var(--s);background:var(--rd-bg);padding:2px 8px;border-radius:3px;flex-shrink:0}
.acc-arr{color:var(--s);font-size:${fs(12)}px;transition:transform .3s;flex-shrink:0}
.acc.open .acc-arr{transform:rotate(180deg)}
.acc-body{max-height:0;overflow:hidden;transition:max-height .35s ease}
.acc.open .acc-body{max-height:300px}
.acc-cnt{padding:12px 18px 16px;font-size:${fs(15)}px;line-height:1.8;color:var(--cnt);border-top:1px solid var(--bd)}
</style></head>
<body>
<div class="frame" data-open="false" data-active="summary" id="F">
  <div class="panel"><div class="pi" id="PI">
    <div class="sec" data-section="summary">
      <div class="sh">
        <div class="st">${escTab(d.labelSummary)}</div>
        <button class="cb" onclick="cls()"><svg viewBox="0 0 20 20" fill="none"><path d="M5 5L15 15M15 5L5 15" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button>
      </div>
      ${summaryCards}
    </div>
    <div class="sec" data-section="glossary">
      <div class="sh">
        <div class="st">${escTab(d.labelGlossary)}</div>
        <button class="cb" onclick="cls()"><svg viewBox="0 0 20 20" fill="none"><path d="M5 5L15 15M15 5L5 15" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button>
      </div>
      ${glossaryItems}
    </div>
  </div></div>
  <div class="tab-row">
    <button class="tab" data-target="summary" aria-pressed="true" onclick="tab_('summary')">
      <span>${escTab(d.labelSummary)}</span>
      <svg class="tc" viewBox="0 0 16 16" fill="none"><path d="M3 6L8 11L13 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <button class="tab" data-target="glossary" aria-pressed="false" onclick="tab_('glossary')">
      <span>${escTab(d.labelGlossary)}</span>
      <svg class="tc" viewBox="0 0 16 16" fill="none"><path d="M3 6L8 11L13 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </div>
</div>
<script>
var F=document.getElementById('F');
function tab_(t){
  var o=F.getAttribute('data-open')==='true';
  if(!o){F.setAttribute('data-active',t);F.setAttribute('data-open','true');}
  else if(F.getAttribute('data-active')===t){F.setAttribute('data-open','false');}
  else{F.setAttribute('data-active',t);document.getElementById('PI').scrollTop=0;}
  document.querySelectorAll('.tab[data-target]').forEach(function(b){
    b.setAttribute('aria-pressed',b.getAttribute('data-target')===t?'true':'false');
  });
}
function cls(){F.setAttribute('data-open','false');}
function tg(id){document.getElementById(id).classList.toggle('open');}
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&F.getAttribute('data-open')==='true')cls();});
<\/script>
</body></html>`;
}
