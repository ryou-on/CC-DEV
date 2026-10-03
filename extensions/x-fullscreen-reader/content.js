/* X Fullscreen Reader v0.2.0
 * 1記事1画面の全画面リーダー。Alt+R または右下の 📖 ボタンで起動。
 * ←→ 送り/戻り ／ ↑↓ ブックマーク選択 ／ J K 移動 ／ X 選択 ／ Enter 決定 ／ Esc 閉じる
 */
(() => {
  'use strict';
  if (window.__xfrLoaded) return;
  window.__xfrLoaded = true;

  const VERSION = '0.2.0';
  const DEFAULT_ENTRY = { name: 'ブックマーク（フォルダなし）', isDefault: true };

  // ---- 状態 ----
  const state = {
    open: false,
    items: [],          // 収集した投稿 {id,url,name,handle,text,quote,images,hasVideo,time,context,y}
    index: 0,
    fontSize: 40,
    light: false,
    folders: [],        // キャッシュしたフォルダ名
    picker: null,       // {cursor, marked:Set, entries, loading}
    busy: false,
    stack: [],          // スレッド進入前の {items,index,url,scrollY}
  };
  const logs = [];
  const log = (...a) => { logs.push(a.map(String).join(' ')); console.log('[XFR]', ...a); };

  // ---- 設定の保存/復元 ----
  const store = {
    async load() {
      try {
        const r = await chrome.storage.local.get(['fontSize', 'light', 'folders']);
        if (r.fontSize) state.fontSize = r.fontSize;
        if (typeof r.light === 'boolean') state.light = r.light;
        if (Array.isArray(r.folders)) state.folders = r.folders;
      } catch (e) { log('storage load error', e); }
    },
    save() {
      try { chrome.storage.local.set({ fontSize: state.fontSize, light: state.light, folders: state.folders }); } catch (e) {}
    },
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(fn, timeout = 2500) {
    const t = Date.now();
    while (Date.now() - t < timeout) {
      const r = fn();
      if (r) return r;
      await sleep(80);
    }
    return null;
  }

  // ---- 投稿の収集 ----
  const statusId = (href) => (href.match(/\/status\/(\d+)/) || [])[1];

  function articleLink(article) {
    // 時刻を含むリンク = 投稿本体へのリンク（広告は存在しない）
    const t = article.querySelector('a[href*="/status/"] time');
    return t ? t.closest('a') : null;
  }

  function parseArticle(article) {
    const link = articleLink(article);
    if (!link) return null;
    const id = statusId(link.getAttribute('href'));
    if (!id) return null;
    const texts = [...article.querySelectorAll('[data-testid="tweetText"]')];
    const userLines = (article.querySelector('[data-testid="User-Name"]')?.innerText || '')
      .split('\n').map((s) => s.trim()).filter(Boolean);
    const timeEl = article.querySelector('time');
    const images = [...article.querySelectorAll('[data-testid="tweetPhoto"] img')]
      .map((i) => i.src.replace(/name=\w+/, 'name=large'));
    return {
      id,
      url: new URL(link.getAttribute('href'), location.origin).href,
      name: userLines[0] || '',
      handle: userLines.find((s) => s.startsWith('@')) || '',
      text: texts[0]?.innerText || '',
      quote: texts[1]?.innerText || '',
      images: [...new Set(images)],
      hasVideo: !!article.querySelector('[data-testid="videoPlayer"], [data-testid="videoComponent"]'),
      time: timeEl ? new Date(timeEl.getAttribute('datetime')).toLocaleString('ja-JP') : '',
      context: article.querySelector('[data-testid="socialContext"]')?.innerText || '',
      y: article.getBoundingClientRect().top + window.scrollY,
      h: article.getBoundingClientRect().height,
    };
  }

  function collect() {
    let added = 0;
    document.querySelectorAll('article[data-testid="tweet"]').forEach((a) => {
      const it = parseArticle(a);
      if (!it) return;
      const ex = state.items.find((x) => x.id === it.id);
      if (ex) { ex.y = it.y; ex.h = it.h; return; }
      state.items.push(it);
      added++;
    });
    // 現在表示中の投稿を維持したままY順に並べ替え
    const cur = state.items[state.index]?.id;
    state.items.sort((a, b) => a.y - b.y);
    if (cur) state.index = Math.max(0, state.items.findIndex((x) => x.id === cur));
    return added;
  }

  function findArticle(id) {
    return [...document.querySelectorAll('article[data-testid="tweet"]')].find((a) => {
      const l = articleLink(a);
      return l && statusId(l.getAttribute('href')) === id;
    });
  }

  // 元の投稿をDOM上に確保する（仮想スクロールで消えている場合は戻る）
  async function ensureArticle(id) {
    let a = findArticle(id);
    if (a) return a;
    const it = state.items.find((x) => x.id === id);
    if (!it) return null;
    window.scrollTo(0, Math.max(0, it.y - 80));
    return await waitFor(() => findArticle(id), 3000);
  }

  // 次の投稿が未ロードなら、ページを下へスクロールして読み込ませる
  async function loadMore() {
    const last = state.items[state.items.length - 1];
    const before = state.items.length;
    window.scrollTo(0, last ? last.y : document.body.scrollHeight);
    const t = Date.now();
    while (Date.now() - t < 4500) {
      await sleep(350);
      collect();
      if (state.items.length > before) return true;
      window.scrollBy(0, 600);
    }
    return false;
  }

  // ---- UI（Shadow DOM で X のCSSと分離） ----
  let host, root, el = {};

  function buildUI() {
    host = document.createElement('div');
    host.id = 'xfr-host';
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;display:none;';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host{all:initial}
        .wrap{position:fixed;inset:0;display:flex;flex-direction:column;font-family:-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;
          background:#000;color:#fff;--sub:#9aa4ad;--bar:#14181c;--accent:#1d9bf0}
        .wrap.light{background:#fff;color:#000;--sub:#536471;--bar:#eff3f4}
        header{display:flex;align-items:center;justify-content:space-between;padding:14px 28px;background:var(--bar);font-size:20px;color:var(--sub)}
        header b{color:inherit;font-size:22px}
        main{flex:1;overflow:auto;padding:32px 8vw;display:flex;flex-direction:column;align-items:center}
        article{width:100%;max-width:1100px;margin:auto 0}
        .ctx{font-size:calc(var(--fs)*.5);color:var(--sub);margin-bottom:12px}
        .who{display:flex;gap:16px;align-items:baseline;flex-wrap:wrap;margin-bottom:20px}
        .who .n{font-size:calc(var(--fs)*.8);font-weight:700}
        .who .h,.who .t{font-size:calc(var(--fs)*.55);color:var(--sub)}
        .txt{font-size:var(--fs);line-height:1.65;white-space:pre-wrap;word-break:break-word}
        .quote{margin-top:24px;padding:16px 24px;border-left:6px solid var(--sub);font-size:calc(var(--fs)*.8);color:var(--sub);white-space:pre-wrap}
        .imgs{margin-top:24px;display:flex;flex-wrap:wrap;gap:16px}
        .imgs img{max-width:100%;max-height:60vh;border-radius:12px;object-fit:contain}
        .note{margin-top:20px;font-size:calc(var(--fs)*.55);color:var(--sub)}
        .note a{color:var(--accent)}
        footer{padding:12px 28px;background:var(--bar);color:var(--sub);font-size:19px;display:flex;gap:28px;flex-wrap:wrap;justify-content:center}
        footer kbd{background:rgba(128,128,128,.25);border-radius:6px;padding:2px 10px;margin-right:6px;font-family:inherit}
        .bm{color:#f7b500;font-weight:700}
        .toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:var(--accent);color:#fff;padding:14px 32px;border-radius:999px;font-size:26px;opacity:0;transition:opacity .2s;pointer-events:none}
        .toast.on{opacity:1}
        .picker{position:fixed;inset:0;background:rgba(0,0,0,.7);display:none;align-items:center;justify-content:center}
        .picker.on{display:flex}
        .box{background:var(--bar);color:inherit;border-radius:20px;padding:28px 36px;min-width:min(720px,90vw);max-height:80vh;overflow:auto}
        .box h2{margin:0 0 16px;font-size:30px}
        .row{display:flex;align-items:center;gap:18px;padding:14px 20px;border-radius:12px;font-size:32px;border:3px solid transparent}
        .row.cur{border-color:var(--accent);background:rgba(29,155,240,.18)}
        .chk{width:36px;height:36px;border:3px solid var(--sub);border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-size:28px;color:#fff}
        .row.on .chk{background:var(--accent);border-color:var(--accent)}
        .hint{margin-top:16px;color:var(--sub);font-size:20px}
      </style>
      <div class="wrap">
        <header><b>📖 X Reader</b><span id="pos"></span><span id="bmstate"></span></header>
        <main id="main"></main>
        <footer>
          <span><kbd>←</kbd>戻る <kbd>→</kbd>次へ</span>
          <span><kbd>⌘←</kbd><kbd>⌘→</kbd>リプライ</span>
          <span><kbd>↑</kbd><kbd>↓</kbd>ブックマーク</span>
          <span><kbd>+</kbd><kbd>-</kbd>文字サイズ</span>
          <span><kbd>T</kbd>白黒</span>
          <span><kbd>Esc</kbd>閉じる</span>
        </footer>
        <div class="toast" id="toast"></div>
        <div class="picker" id="picker"><div class="box">
          <h2>ブックマーク先を選択</h2>
          <div id="rows"></div>
          <div class="hint"><kbd>↑↓</kbd>/<kbd>J K</kbd> 移動 ・ <kbd>X</kbd> 選択 ・ <kbd>Enter</kbd> 決定 ・ <kbd>R</kbd> フォルダ再取得 ・ <kbd>Esc</kbd> 取消</div>
        </div></div>
      </div>`;
    el.wrap = root.querySelector('.wrap');
    el.main = root.getElementById('main');
    el.pos = root.getElementById('pos');
    el.bmstate = root.getElementById('bmstate');
    el.toast = root.getElementById('toast');
    el.picker = root.getElementById('picker');
    el.rows = root.getElementById('rows');
    document.documentElement.appendChild(host);
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function render() {
    const it = state.items[state.index];
    el.wrap.classList.toggle('light', state.light);
    el.wrap.style.setProperty('--fs', state.fontSize + 'px');
    el.pos.textContent = it ? `${state.stack.length ? '💬 スレッド ' : ''}${state.index + 1} / ${state.items.length}` : '';
    if (!it) { el.main.innerHTML = '<article><div class="txt">投稿が見つかりません</div></article>'; return; }
    el.main.innerHTML = `<article>
      ${it.context ? `<div class="ctx">${esc(it.context)}</div>` : ''}
      <div class="who"><span class="n">${esc(it.name)}</span><span class="h">${esc(it.handle)}</span><span class="t">${esc(it.time)}</span></div>
      <div class="txt">${esc(it.text) || '<span style="opacity:.5">（本文なし）</span>'}</div>
      ${it.quote ? `<div class="quote">${esc(it.quote)}</div>` : ''}
      ${it.images.length ? `<div class="imgs">${it.images.map((s) => `<img src="${esc(s)}" alt="">`).join('')}</div>` : ''}
      ${it.hasVideo ? '<div class="note">🎬 動画付きの投稿です（元の投稿で再生してください）</div>' : ''}
      <div class="note"><a href="${esc(it.url)}" target="_blank" rel="noopener">元の投稿を開く ↗</a></div>
    </article>`;
    el.main.scrollTop = 0;
    updateBmState();
  }

  function updateBmState() {
    const it = state.items[state.index];
    const a = it && findArticle(it.id);
    el.bmstate.innerHTML = a && a.querySelector('[data-testid="removeBookmark"]') ? '<span class="bm">★ ブックマーク済み</span>' : '';
  }

  let toastTimer;
  function toast(msg, ms = 2200) {
    el.toast.textContent = msg;
    el.toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('on'), ms);
  }

  // ---- 開閉 ----
  function openReader() {
    collect();
    if (!state.items.length) { alert('投稿が見つかりません。タイムラインを表示してから起動してください。'); return; }
    // 画面最上部に見えている投稿から開始
    const top = window.scrollY + 60;
    let i = state.items.findIndex((x) => x.y + x.h > top);
    state.index = i < 0 ? state.items.length - 1 : i;
    state.open = true;
    host.style.display = 'block';
    render();
    log('open index', state.index);
  }

  async function closeReader() {
    closePicker();
    while (state.stack.length) await exitThread();
    state.open = false;
    host.style.display = 'none';
    const it = state.items[state.index];
    if (it) window.scrollTo(0, Math.max(0, it.y - 70)); // 読んでいた位置にタイムラインを合わせる
  }

  // ---- リプライ（スレッド）移動 ----
  async function enterThread() {
    const it = state.items[state.index];
    if (!it || state.busy) return;
    state.busy = true;
    toast('リプライを読み込み中…', 6000);
    const a = await ensureArticle(it.id);
    const link = a && articleLink(a);
    if (!link) { state.busy = false; toast('元の投稿が見つかりません'); return; }
    state.stack.push({ items: state.items, index: state.index, url: location.href, scrollY: window.scrollY });
    link.click(); // SPA遷移で投稿詳細へ
    const ok = await waitFor(() => location.pathname.includes('/status/' + it.id) && findArticle(it.id), 5000);
    if (!ok) { const f = state.stack.pop(); state.items = f.items; state.index = f.index; state.busy = false; toast('リプライを開けませんでした'); return; }
    await sleep(600);
    state.items = [];
    collect();
    state.index = Math.max(0, state.items.findIndex((x) => x.id === it.id));
    if (state.index + 1 >= state.items.length) await loadMore();
    state.index = Math.min(state.index + 1, state.items.length - 1);
    state.busy = false;
    toast(state.index > 0 ? '💬 リプライ' : 'リプライはありません', 1500);
    render();
  }

  async function exitThread() {
    const f = state.stack.pop();
    if (!f) return;
    state.busy = true;
    history.back();
    await waitFor(() => location.href === f.url && document.querySelector('article[data-testid="tweet"]'), 5000);
    await sleep(500);
    state.items = f.items;
    state.index = f.index;
    collect();
    window.scrollTo(0, f.scrollY);
    state.busy = false;
    render();
  }

  async function replyMove(delta) {
    if (delta > 0) {
      if (!state.stack.length) await enterThread();
      else await go(1);
    } else if (state.stack.length) {
      if (state.index > 0) await go(-1);
      else await exitThread();
    }
  }

  // ---- 送り/戻り ----
  async function go(delta) {
    if (state.busy) return;
    const next = state.index + delta;
    if (next < 0) { toast('先頭です'); return; }
    if (next >= state.items.length) {
      state.busy = true;
      toast('読み込み中…', 5000);
      const ok = await loadMore();
      state.busy = false;
      if (!ok) { toast('これ以上ありません'); return; }
      toast('', 1);
    }
    state.index = Math.min(next, state.items.length - 1);
    render();
  }

  // ---- ブックマーク（Xの画面操作を代行） ----
  const textOf = (e) => (e.innerText || e.textContent || '').trim();
  const findByText = (rootEl, sel, re) => [...rootEl.querySelectorAll(sel)].find((e) => re.test(textOf(e)));

  async function openShareMenu(article) {
    const share = [...article.querySelectorAll('button, [role="button"]')]
      .find((b) => /^(共有|Share( post)?)$/i.test(b.getAttribute('aria-label') || ''));
    if (!share) return null;
    share.click();
    return await waitFor(() => document.querySelector('[role="menu"]'));
  }

  async function openFolderDialog(article) {
    const menu = await openShareMenu(article);
    if (!menu) return null;
    const item = findByText(menu, '[role="menuitem"]', /フォルダに追加|Add to Folder/i);
    if (!item) { dismiss(); return null; }
    item.click();
    return await waitFor(() => {
      const d = document.querySelector('[data-testid="sheetDialog"], [role="dialog"]');
      return d && d.querySelector('[role="button"], [role="menuitem"], [role="radio"], [role="checkbox"]') ? d : null;
    });
  }

  function dismiss() {
    const d = document.querySelector('[data-testid="sheetDialog"], [role="dialog"]');
    const close = d && d.querySelector('[aria-label="閉じる"], [aria-label="Close"]');
    if (close) close.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
  }

  const SKIP_LABEL = /^(完了|キャンセル|閉じる|新しいフォルダ|フォルダを作成|Done|Cancel|Close|New folder|Create)/i;
  function folderCandidates(dialog) {
    const seen = new Set();
    return [...dialog.querySelectorAll('[role="button"], [role="menuitem"], [role="radio"], [role="checkbox"], [role="option"]')]
      .map((e) => ({ name: textOf(e).split('\n')[0].trim(), el: e }))
      .filter((c) => c.name && c.name.length < 60 && !SKIP_LABEL.test(c.name) && !seen.has(c.name) && seen.add(c.name));
  }

  async function fetchFolders(article) {
    const dialog = await openFolderDialog(article);
    if (!dialog) return null;
    const names = folderCandidates(dialog).map((c) => c.name);
    dismiss();
    await sleep(250);
    log('folders', names.join(','));
    return names;
  }

  async function addToFolder(article, name) {
    const dialog = await openFolderDialog(article);
    if (!dialog) return false;
    const target = folderCandidates(dialog).find((c) => c.name === name);
    if (!target) { dismiss(); return false; }
    target.el.click();
    await sleep(400);
    const done = document.querySelector('[data-testid="sheetDialog"], [role="dialog"]');
    const doneBtn = done && findByText(done, '[role="button"], button', /^(完了|Done)$/i);
    if (doneBtn) doneBtn.click();
    await sleep(200);
    return true;
  }

  async function bookmarkDefault(article) {
    // 未登録なら登録、登録済みなら解除（Xのブックマークボタンと同じトグル）
    const btn = article.querySelector('[data-testid="bookmark"], [data-testid="removeBookmark"]');
    if (!btn) return null;
    const was = btn.getAttribute('data-testid') === 'removeBookmark';
    btn.click();
    return was ? 'removed' : 'added';
  }

  // ---- ピッカー ----
  function entries() { return [DEFAULT_ENTRY, ...state.folders.map((n) => ({ name: n }))]; }

  function renderPicker() {
    const p = state.picker;
    if (!p) return;
    el.rows.innerHTML = entries().map((e, i) => `
      <div class="row${i === p.cursor ? ' cur' : ''}${p.marked.has(i) ? ' on' : ''}">
        <span class="chk">${p.marked.has(i) ? '✓' : ''}</span><span>${e.isDefault ? '🔖 ' : '📁 '}${esc(e.name)}</span>
      </div>`).join('') + (p.loading ? '<div class="hint">フォルダを取得中…</div>' : '');
  }

  async function openPicker() {
    if (state.busy) return;
    state.picker = { cursor: 0, marked: new Set(), loading: false };
    el.picker.classList.add('on');
    renderPicker();
    if (!state.folders.length) refreshFolders();
  }

  function closePicker() {
    state.picker = null;
    el.picker.classList.remove('on');
  }

  async function refreshFolders() {
    const it = state.items[state.index];
    if (!it || !state.picker) return;
    state.picker.loading = true; renderPicker();
    state.busy = true;
    const a = await ensureArticle(it.id);
    const names = a ? await fetchFolders(a) : null;
    state.busy = false;
    if (state.picker) {
      state.picker.loading = false;
      if (names && names.length) { state.folders = names; store.save(); }
      else toast('フォルダを取得できませんでした（未作成/Premium外の可能性）', 3500);
      renderPicker();
    }
  }

  async function applyPicker() {
    const p = state.picker;
    const it = state.items[state.index];
    if (!p || !it) return;
    const list = entries();
    const idxs = p.marked.size ? [...p.marked].sort() : [p.cursor]; // 何も選ばず Enter ならカーソル位置を採用
    closePicker();
    state.busy = true;
    toast('処理中…', 8000);
    const a = await ensureArticle(it.id);
    if (!a) { state.busy = false; toast('元の投稿が見つかりません'); return; }
    const results = [];
    for (const i of idxs) {
      const e = list[i];
      if (e.isDefault) {
        const r = await bookmarkDefault(a);
        results.push(r === 'added' ? '★ブックマークに追加' : r === 'removed' ? 'ブックマーク解除' : '✕ボタン未検出');
      } else {
        const ok = await addToFolder(a, e.name);
        results.push(ok ? `📁${e.name}に追加` : `✕${e.name}失敗`);
      }
      await sleep(300);
    }
    state.busy = false;
    toast(results.join(' / '), 3200);
    log('apply', results.join(','));
    updateBmState();
  }

  // ---- キー操作 ----
  const isTyping = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

  window.addEventListener('keydown', (e) => {
    if (!e.isTrusted) return; // 自動操作で発行したキーイベントは無視
    if (e.altKey && e.code === 'KeyR') {
      e.preventDefault(); e.stopPropagation();
      state.open ? closeReader() : openReader();
      return;
    }
    if (!state.open) return;
    // リーダー中はXのショートカットに渡さない
    e.preventDefault(); e.stopPropagation();
    if (state.busy) return;
    const k = e.key;
    const p = state.picker;

    if (p) {
      const n = entries().length;
      if (k === 'Escape') closePicker();
      else if (k === 'ArrowDown' || k === 'j' || k === 'J') p.cursor = (p.cursor + 1) % n;
      else if (k === 'ArrowUp' || k === 'k' || k === 'K') p.cursor = (p.cursor - 1 + n) % n;
      else if (k === 'x' || k === 'X') p.marked.has(p.cursor) ? p.marked.delete(p.cursor) : p.marked.add(p.cursor);
      else if (k === 'r' || k === 'R') { refreshFolders(); return; }
      else if (k === 'Enter') { applyPicker(); return; }
      renderPicker();
      return;
    }

    if ((e.metaKey || e.ctrlKey) && (k === 'ArrowRight' || k === 'ArrowLeft')) { replyMove(k === 'ArrowRight' ? 1 : -1); return; }
    if (k === 'ArrowRight') go(1);
    else if (k === 'ArrowLeft') go(-1);
    else if (k === 'ArrowUp' || k === 'ArrowDown') openPicker();
    else if (k === 'Escape') closeReader();
    else if (k === '+' || k === '=') { state.fontSize = Math.min(120, state.fontSize + 4); store.save(); render(); }
    else if (k === '-') { state.fontSize = Math.max(16, state.fontSize - 4); store.save(); render(); }
    else if (k === 't' || k === 'T') { state.light = !state.light; store.save(); render(); }
  }, true);

  // ---- 起動ボタン（右下・半透明）＋デバッグコピー ----
  function buildLauncher() {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483000;display:flex;gap:6px;opacity:.6;font:12px sans-serif';
    const mk = (label, title, fn) => {
      const b = document.createElement('button');
      b.textContent = label; b.title = title;
      b.style.cssText = 'all:unset;cursor:pointer;background:rgba(29,155,240,.85);color:#fff;border-radius:999px;padding:6px 12px;font:12px sans-serif';
      b.addEventListener('click', fn);
      return b;
    };
    box.append(
      mk('📖 全画面で読む', 'Alt+R でも起動', () => (state.open ? closeReader() : openReader())),
      mk(`v${VERSION}`, 'リリースノート', () => alert(`## v0.2.0 (2026-10-03)\n- ⌘+←→でリプライの送り/戻りを追加\n\n## v0.1.0 (2026-10-03)\n- 初回リリース\n- 1記事1画面の全画面リーダー\n- ←→で送り/戻り、↑↓でブックマーク選択（J/K移動・X選択・Enter決定）`)),
      mk('🐞', 'デバッグログをコピー', async () => {
        try { await navigator.clipboard.writeText(logs.join('\n') || '(ログなし)'); } catch (e) {}
      })
    );
    document.documentElement.appendChild(box);
  }

  (async () => {
    await store.load();
    buildUI();
    buildLauncher();
    log('loaded', VERSION);
  })();
})();
