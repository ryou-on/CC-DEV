/* ─────────────────────────────────────────
   YT → hihaho Tab  /  editor.js
   生成済みタブの内容・デザインを編集し、ライブプレビュー＆再デプロイする。
   ドラフトは chrome.storage.local.tabDrafts[slug]。
   プレビューは sandbox の preview.html に postMessage で送る。
   ───────────────────────────────────────── */

const el = id => document.getElementById(id);
const slug = new URLSearchParams(location.search).get('slug') || '';

let draft = null;
let previewReady = false;
let renderTimer = null;
let saveTimer = null;

const previewWin = () => el('previewFrame').contentWindow;

/* ── 初期化 ── */
document.addEventListener('DOMContentLoaded', async () => {
  el('slugBadge').textContent = slug || '(slugなし)';
  document.title = `タブエディタ — ${slug}`;

  const { tabDrafts = {} } = await chrome.storage.local.get('tabDrafts');
  draft = tabDrafts[slug] || null;
  if (!slug || !draft || !draft.content) {
    el('noDraft').classList.add('show');
    return;
  }

  // 欠損フィールドを補完
  draft.design = { ...DEFAULT_DESIGN, ...(draft.design || {}) };
  draft.content.summary = draft.content.summary || { sections: [] };
  draft.content.summary.sections = draft.content.summary.sections || [];
  draft.content.glossary = draft.content.glossary || [];

  // ヘッダー
  updateTabUrlLink();

  // 基本情報・デザインのフォームに反映＆bind
  el('titleInput').value = draft.title || '';
  el('themeSel').value = draft.design.theme;
  el('accentInput').value = draft.design.accent;
  el('tabPosSel').value = draft.design.tabPos;
  el('panelWidthInput').value = draft.design.panelWidth;
  el('panelMaxHInput').value = draft.design.panelMaxH;
  el('fontScaleInput').value = draft.design.fontScale;
  el('fontScaleVal').textContent = draft.design.fontScale + '%';
  el('labelSummaryInput').value = draft.design.labelSummary;
  el('labelGlossaryInput').value = draft.design.labelGlossary;

  el('titleInput').addEventListener('input', e => { draft.title = e.target.value; onChange(); });
  el('themeSel').addEventListener('change', e => { draft.design.theme = e.target.value; onChange(); });
  el('accentInput').addEventListener('input', e => { draft.design.accent = e.target.value; onChange(); });
  el('tabPosSel').addEventListener('change', e => { draft.design.tabPos = e.target.value; onChange(); });
  el('panelWidthInput').addEventListener('input', e => { draft.design.panelWidth = clampNum(e.target.value, 480, 1800, 980); onChange(); });
  el('panelMaxHInput').addEventListener('input', e => { draft.design.panelMaxH = clampNum(e.target.value, 300, 1040, 820); onChange(); });
  el('fontScaleInput').addEventListener('input', e => {
    draft.design.fontScale = +e.target.value;
    el('fontScaleVal').textContent = e.target.value + '%';
    onChange();
  });
  el('labelSummaryInput').addEventListener('input', e => { draft.design.labelSummary = e.target.value; onChange(); });
  el('labelGlossaryInput').addEventListener('input', e => { draft.design.labelGlossary = e.target.value; onChange(); });

  el('addSummaryBtn').addEventListener('click', () => {
    draft.content.summary.sections.push({ emoji: '📌', heading: '新しいセクション', text: '' });
    renderLists(); onChange();
  });
  el('addGlossaryBtn').addEventListener('click', () => {
    draft.content.glossary.push({ term: '新しい用語', reading: '', definition: '' });
    renderLists(); onChange();
  });

  el('deployBtn').addEventListener('click', deploy);

  renderLists();
  schedulePreview();
});

function clampNum(v, min, max, fallback) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function updateTabUrlLink() {
  const a = el('openTabUrl');
  if (draft?.tabUrl) { a.href = draft.tabUrl; a.style.display = ''; }
  else a.style.display = 'none';
}

/* ── プレビュー（sandbox iframe） ── */
window.addEventListener('message', e => {
  if (e.data?.type === 'preview-ready') { previewReady = true; sendRender(); }
});

function sendRender() {
  if (!previewReady || !draft) return;
  const html = generateTabHTML(draft.title, draft.content, draft.design);
  previewWin().postMessage({ type: 'render', html, videoId: draft.videoId || '' }, '*');
}

function onChange() {
  schedulePreview();
  scheduleSave();
}
function schedulePreview() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(sendRender, 250);
}
function scheduleSave() {
  clearTimeout(saveTimer);
  setStatus('', '');
  saveTimer = setTimeout(async () => {
    const { tabDrafts = {} } = await chrome.storage.local.get('tabDrafts');
    tabDrafts[slug] = { ...draft, updatedAt: Date.now() };
    await chrome.storage.local.set({ tabDrafts });
    setStatus('💾 下書き保存済み（未デプロイ）', '');
  }, 600);
}

function setStatus(text, cls) {
  const s = el('status');
  s.textContent = text;
  s.className = cls || '';
}

/* ── リスト描画 ── */
function renderLists() {
  renderSummary();
  renderGlossary();
}

function miniBtn(label, title, onClick, disabled) {
  const b = document.createElement('button');
  b.className = 'mini-btn' + (label === '✕' ? ' del' : '');
  b.textContent = label;
  b.title = title;
  b.disabled = !!disabled;
  b.addEventListener('click', onClick);
  return b;
}

function makeInput(cls, value, placeholder, onInput) {
  const i = document.createElement('input');
  i.type = 'text';
  i.className = 'input' + (cls ? ' ' + cls : '');
  i.value = value || '';
  i.placeholder = placeholder || '';
  i.addEventListener('input', e => { onInput(e.target.value); onChange(); });
  return i;
}

function makeTextarea(value, placeholder, onInput) {
  const t = document.createElement('textarea');
  t.className = 'input';
  t.value = value || '';
  t.placeholder = placeholder || '';
  t.rows = 2;
  t.addEventListener('input', e => { onInput(e.target.value); onChange(); });
  return t;
}

function move(arr, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  renderLists(); onChange();
}

function renderSummary() {
  const secs = draft.content.summary.sections;
  const list = el('summaryList');
  list.textContent = '';
  el('summaryCount').textContent = `${secs.length}件`;
  secs.forEach((s, i) => {
    const item = document.createElement('div');
    item.className = 'item';
    const head = document.createElement('div');
    head.className = 'item-head';
    head.appendChild(makeInput('emoji', s.emoji, '📌', v => { s.emoji = v; }));
    head.appendChild(makeInput('', s.heading, 'セクション名', v => { s.heading = v; }));
    head.appendChild(miniBtn('↑', '上へ', () => move(secs, i, -1), i === 0));
    head.appendChild(miniBtn('↓', '下へ', () => move(secs, i, 1), i === secs.length - 1));
    head.appendChild(miniBtn('✕', '削除', () => { secs.splice(i, 1); renderLists(); onChange(); }));
    item.appendChild(head);
    item.appendChild(makeTextarea(s.text, '説明文（2〜3文）', v => { s.text = v; }));
    list.appendChild(item);
  });
}

function renderGlossary() {
  const terms = draft.content.glossary;
  const list = el('glossaryList');
  list.textContent = '';
  el('glossaryCount').textContent = `${terms.length}件`;
  terms.forEach((g, i) => {
    const item = document.createElement('div');
    item.className = 'item';
    const head = document.createElement('div');
    head.className = 'item-head';
    head.appendChild(makeInput('', g.term, '用語', v => { g.term = v; }));
    head.appendChild(makeInput('reading', g.reading, 'よみがな（任意）', v => { g.reading = v; }));
    head.appendChild(miniBtn('↑', '上へ', () => move(terms, i, -1), i === 0));
    head.appendChild(miniBtn('↓', '下へ', () => move(terms, i, 1), i === terms.length - 1));
    head.appendChild(miniBtn('✕', '削除', () => { terms.splice(i, 1); renderLists(); onChange(); }));
    item.appendChild(head);
    item.appendChild(makeTextarea(g.definition, '定義（1〜2文）', v => { g.definition = v; }));
    list.appendChild(item);
  });
}

/* ── 再デプロイ ── */
async function deploy() {
  const btn = el('deployBtn');
  btn.disabled = true;
  setStatus('🚀 デプロイ中...', 'busy');
  try {
    // 直前の編集も含めて保存してからデプロイ
    clearTimeout(saveTimer);
    const { tabDrafts = {} } = await chrome.storage.local.get('tabDrafts');
    tabDrafts[slug] = { ...draft, updatedAt: Date.now() };
    await chrome.storage.local.set({ tabDrafts });

    const html = generateTabHTML(draft.title, draft.content, draft.design);
    const res = await chrome.runtime.sendMessage({ type: 'redeployTab', slug, html });
    if (res?.ok) {
      draft.tabUrl = res.tabUrl;
      updateTabUrlLink();
      setStatus('✓ デプロイ完了 — 本番反映まで1〜2分（GitHub Actions）', 'ok');
    } else {
      setStatus('✗ ' + (res?.error || 'デプロイに失敗しました'), 'err');
    }
  } catch (e) {
    setStatus('✗ ' + e.message, 'err');
  } finally {
    btn.disabled = false;
  }
}
