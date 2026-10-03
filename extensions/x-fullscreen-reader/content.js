/* X Fullscreen Reader v0.4.1
 * 1記事1画面の全画面リーダー。Alt+R または右下の 📖 ボタンで起動。
 * ←→ 送り/戻り ／ fn+←→ リプライ ／ fn+↑↓ ブックマーク選択 ／ ↑↓ 長文スクロール ／ J K 移動 ／ X 選択 ／ Enter 決定 ／ Esc 閉じる
 */
(() => {
  'use strict';
  if (window.__xfrLoaded) return;
  window.__xfrLoaded = true;

  const VERSION = '0.4.1';
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
    const t = [...article.querySelectorAll('a[href*="/status/"] time')]
      .find((x) => !x.closest('[role="link"]:not(a)')); // 引用ポスト内の時刻は除外
    if (t) return t.closest('a');
    // 詳細ページの本体ポストなど、時刻リンクが無い場合は status リンクを直接探す
    return [...article.querySelectorAll('a[href*="/status/"]')]
      .find((a) => /\/status\/\d+\/?$/.test(a.getAttribute('href') || '')) || null;
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
        <header><b>📖 X Reader</b><span id="pos"></span><span id="bmstate"></span><span id="key" style="opacity:.6;font-size:16px"></span></header>
        <main id="main"></main>
        <footer>
          <span><kbd>←</kbd>戻る <kbd>→</kbd>次へ</span>
          <span><kbd>fn←</kbd><kbd>fn→</kbd>リプライ</span>
          <span><kbd>fn↑</kbd><kbd>fn↓</kbd>ブックマーク</span>
          <span><kbd>↑</kbd><kbd>↓</kbd>スクロール</span>
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
    el.key = root.getElementById('key');
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
    const atDetail = () => location.pathname.includes('/status/' + it.id);
    log('enterThread click', it.url);
    link.click(); // SPA遷移で投稿詳細へ
    let navigated = await waitFor(atDetail, 1500);
    if (!navigated) {
      // クリックで遷移しない場合は履歴APIでXのルーターを直接動かす
      log('enterThread fallback pushState');
      history.pushState({}, '', it.url);
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
      navigated = await waitFor(atDetail, 3000);
    }
    const focal = navigated && await waitFor(() => findArticle(it.id), 6000);
    log('enterThread navigated', !!navigated, 'focal', !!focal, 'path', location.pathname);
    if (!focal) {
      const f = state.stack.pop(); state.items = f.items; state.index = f.index; state.busy = false;
      if (navigated) history.back();
      toast('リプライを開けませんでした（🐞ログ参照）', 3000);
      return;
    }
    await sleep(700);
    state.items = [];
    collect();
    state.index = Math.max(0, state.items.findIndex((x) => x.id === it.id));
    if (state.index + 1 >= state.items.length) await loadMore();
    log('enterThread items', state.items.length, 'focalIndex', state.items.findIndex((x) => x.id === it.id));
    state.index = Math.min(state.index + 1, state.items.length - 1);
    state.busy = false;
    toast(state.items.length > 1 ? '💬 リプライ' : 'リプライはありません', 1500);
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
  const textOf = (e) => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim();
  const firstLine = (e) => (e.innerText || e.textContent || '').split('\n').map((s) => s.trim()).find(Boolean) || '';
  const findByText = (rootEl, sel, re) => [...rootEl.querySelectorAll(sel)].find((e) => re.test(textOf(e)));
  const RE_FOLDER = /フォルダ|folder/i;

  // Xのダイアログ（任意で本文の正規表現で絞り込む）
  function currentDialog(re) {
    return [...document.querySelectorAll('[data-testid="sheetDialog"], [role="dialog"]')]
      .find((d) => !re || re.test(textOf(d))) || null;
  }

  // 開いているメニュー/ダイアログをすべて閉じる
  async function dismissAll() {
    for (let i = 0; i < 3; i++) {
      const d = currentDialog() || document.querySelector('[role="menu"]');
      if (!d) break;
      const close = d.querySelector('[aria-label="閉じる"], [aria-label="Close"], [data-testid="app-bar-close"]');
      const mask = document.querySelector('[data-testid="mask"]');
      if (close) close.click();
      else if (mask) mask.click();
      else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      await sleep(250);
    }
  }

  function bookmarkButton(article) {
    return article.querySelector('[data-testid="bookmark"], [data-testid="removeBookmark"]');
  }
  const isBookmarked = (article) => !!article.querySelector('[data-testid="removeBookmark"]');

  async function openShareMenu(article) {
    // aria-label は「共有」「ポストを共有」「Share post」など表記ゆれがある
    let share = [...article.querySelectorAll('button, [role="button"]')]
      .find((b) => /共有|share/i.test(b.getAttribute('aria-label') || ''));
    if (!share) {
      // 見つからなければアクションバー（返信/リポスト/いいね/…）の最後のボタン
      const group = article.querySelector('[role="group"]');
      const btns = group ? [...group.querySelectorAll('button')] : [];
      share = btns[btns.length - 1] || null;
      log('share button fallback', !!share);
    }
    if (!share) { log('share button not found'); return null; }
    share.click();
    const menu = await waitFor(() => document.querySelector('[role="menu"]'));
    if (menu) log('share menu:', [...menu.querySelectorAll('[role="menuitem"]')].map(textOf).join(' | '));
    else log('share menu did not open');
    return menu;
  }

  async function openFolderDialog(article, retried) {
    const menu = await openShareMenu(article);
    if (!menu) return null;
    const item = findByText(menu, '[role="menuitem"]', RE_FOLDER);
    if (!item) {
      await dismissAll();
      // 「フォルダに追加」はブックマーク済みの投稿にしか出ないことがある → 先にブックマークして再試行
      if (!retried && !isBookmarked(article)) {
        log('no folder item; bookmark first then retry');
        bookmarkButton(article)?.click();
        await sleep(800);
        // ブックマーク直後のトースト内に「フォルダに追加」リンクがあればそれを使う
        const toastLink = [...document.querySelectorAll('[data-testid="toast"] a, [data-testid="toast"] [role="button"]')]
          .find((e) => RE_FOLDER.test(textOf(e)));
        if (toastLink) {
          toastLink.click();
          const d = await waitFor(() => currentDialog(RE_FOLDER), 3000);
          if (d) return d;
        }
        return openFolderDialog(article, true);
      }
      log('folder menu item not found');
      return null;
    }
    item.click();
    const dialog = await waitFor(() => currentDialog(RE_FOLDER), 3000);
    if (!dialog) log('folder dialog did not open');
    else log('folder dialog text:', textOf(dialog).slice(0, 200));
    return dialog;
  }

  // フォルダ名として扱わない行（見出し・ボタン・件数表示）
  const SKIP_LABEL = /^(完了|キャンセル|閉じる|戻る|新しいブックマークフォルダ|新しいフォルダ|フォルダを(新規)?作成|フォルダに追加|ブックマークフォルダ|ブックマークに追加|Done|Cancel|Close|Back|New folder|Create|Add to Folders?|Bookmark Folders?|\d+\s*(件|posts?|items?)\b)/i;

  // フォルダ行は role 属性が付かない場合があるため、ダイアログの表示テキスト行から拾う
  function folderNames(dialog) {
    const seen = new Set();
    return (dialog.innerText || '').split('\n').map((s) => s.trim())
      .filter((s) => s && s.length < 60 && !SKIP_LABEL.test(s) && !seen.has(s) && seen.add(s));
  }

  // 表示テキストが name と一致する最も内側の要素を探し、その行（クリック可能な祖先）を返す
  function findFolderRow(dialog, name) {
    const hits = [...dialog.querySelectorAll('*')].filter((e) => textOf(e) === name || firstLine(e) === name);
    const inner = hits.find((e) => !hits.some((o) => o !== e && e.contains(o)));
    if (!inner) return null;
    const row = inner.closest('[role="button"], [role="menuitem"], [role="checkbox"], [role="radio"], [role="option"], button, label, [tabindex="0"]');
    return row && row !== dialog ? row : inner;
  }

  async function fetchFolders(article) {
    const dialog = await openFolderDialog(article);
    if (!dialog) return null;
    log('dialog lines:', (dialog.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean).join(' | '));
    const names = folderNames(dialog);
    await dismissAll();
    log('folders', names.join(','));
    return names;
  }

  async function addToFolder(article, name) {
    const dialog = await openFolderDialog(article);
    if (!dialog) return false;
    const target = findFolderRow(dialog, name);
    if (!target) { log('folder row not found', name); await dismissAll(); return false; }
    log('click folder row', name, target.tagName, target.getAttribute('role') || '');
    target.click();
    await sleep(500);
    const done = currentDialog(RE_FOLDER);
    const doneBtn = done && findByText(done, '[role="button"], button', /^(完了|Done)$/i);
    if (doneBtn) doneBtn.click();
    await sleep(300);
    await dismissAll();
    return true;
  }

  async function bookmarkDefault(article) {
    // 未登録なら登録、登録済みなら解除（Xのブックマークボタンと同じトグル）
    const btn = bookmarkButton(article);
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
    if (!a) log('refreshFolders: article not found', it.id);
    const names = a ? await fetchFolders(a) : null;
    state.busy = false;
    if (state.picker) {
      state.picker.loading = false;
      if (names && names.length) { state.folders = names; store.save(); }
      else toast('フォルダを取得できませんでした（🐞ログを送ってください）', 3500);
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

  // fn+矢印（Mac）は Home/End/PageUp/PageDown として届く。環境差を吸収するため key / code / keyCode を全部見る。
  // 代替として Shift+矢印でも同じ動作にする。
  function normKey(e) {
    const k = e.key, c = e.code, n = e.keyCode;
    if (k === 'PageUp' || c === 'PageUp' || n === 33 || (e.shiftKey && k === 'ArrowUp')) return 'PageUp';
    if (k === 'PageDown' || c === 'PageDown' || n === 34 || (e.shiftKey && k === 'ArrowDown')) return 'PageDown';
    if (k === 'End' || c === 'End' || n === 35 || (e.shiftKey && k === 'ArrowRight')) return 'End';
    if (k === 'Home' || c === 'Home' || n === 36 || (e.shiftKey && k === 'ArrowLeft')) return 'Home';
    return k;
  }

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
    const k = normKey(e);
    // 押したキーをヘッダーとログに出す（動作しないときの切り分け用）
    const mods = [e.metaKey && '⌘', e.ctrlKey && 'ctrl', e.altKey && 'alt', e.shiftKey && 'shift'].filter(Boolean).join('+');
    el.key.textContent = `key: ${mods ? mods + '+' : ''}${e.key} (${e.code}/${e.keyCode}) → ${k}`;
    log('key', e.key, e.code, e.keyCode, mods, '->', k, state.busy ? '(busy)' : '');
    if (state.busy) return;
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

    // Mac: fn+→ = End / fn+← = Home / fn+↓ = PageDown / fn+↑ = PageUp（Windows は各キーそのもの）
    if (k === 'End') { replyMove(1); return; }
    if (k === 'Home') { replyMove(-1); return; }
    if (k === 'PageDown' || k === 'PageUp') { openPicker(); return; }
    if (k === 'ArrowRight') go(1);
    else if (k === 'ArrowLeft') go(-1);
    else if (k === 'ArrowUp' || k === 'ArrowDown') el.main.scrollBy({ top: (k === 'ArrowDown' ? 1 : -1) * state.fontSize * 3, behavior: 'smooth' }); // 長文のスクロール
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
      mk(`v${VERSION}`, 'リリースノート', () => alert(`## v0.4.1 (2026-10-03)\n- fn+矢印が効かない環境向けにキー判定を強化、Shift+矢印でも同じ操作が可能に\n- 押したキーをヘッダーに表示\n\n## v0.4.0 (2026-10-03)\n- リプライ移動を fn+←→、ブックマーク選択を fn+↑↓ に変更\n- ↑↓ で長文をスクロール\n\n## v0.3.0 (2026-10-03)\n- リプライの送り/戻りを fn+↓ / fn+↑（PageDown / PageUp）に変更\n\n## v0.2.2 (2026-10-03)\n- 既存のブックマークフォルダが一覧に出ない問題を修正\n\n## v0.2.1 (2026-10-03)\n- リプライ表示・ブックマークフォルダ取得が動かない問題を修正\n\n## v0.2.0 (2026-10-03)\n- ⌘+←→でリプライの送り/戻りを追加\n\n## v0.1.0 (2026-10-03)\n- 初回リリース\n- 1記事1画面の全画面リーダー\n- ←→で送り/戻り、↑↓でブックマーク選択（J/K移動・X選択・Enter決定）`)),
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
