/* ─────────────────────────────────────────
   YT → hihaho Tab  /  popup.js
   処理は background.js が実行。popupは UI表示・起動・結果/履歴の閲覧に専念。
   進捗・結果は chrome.storage.local.job を storage.onChanged で受け取って反映する。
   ───────────────────────────────────────── */

let settings = {};
let videoData = null;     // 現在開いているYouTube動画（新規ジョブ起動用）
let currentTabId = null;
let currentJob = null;    // storage上の実行中/直近ジョブ
let stuckRecheckTimer = null;

const el = id => document.getElementById(id);

/* ── Init ── */
document.addEventListener('DOMContentLoaded', async () => {
  settings = await loadSettings();
  applyTheme(settings.theme);
  applySettingsToForm();

  // バージョンバッジ
  el('versionBadge').textContent = 'v' + chrome.runtime.getManifest().version;

  // 使い方モーダル
  el('usageBtn').addEventListener('click', () => { el('modal-usage').hidden = false; });
  el('usageBtn2').addEventListener('click', () => { el('modal-usage').hidden = false; });
  // リリースノートモーダル
  el('versionBadge').addEventListener('click', () => { el('modal-relnotes').hidden = false; });
  // モーダルを閉じる
  document.querySelectorAll('.modal-close-btn').forEach(btn => {
    btn.addEventListener('click', () => { el(btn.dataset.close).hidden = true; });
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.hidden = true; });
  });

  // popupを開いた＝バッジ確認済み → バッジを消す
  chrome.runtime.sendMessage({ type: 'ackBadge' }).catch(() => {});

  const stored = await chrome.storage.local.get('job');
  currentJob = stored.job || null;

  // 現在のタブがYouTube動画なら動画情報を抽出（新規ジョブ用）
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url?.match(/youtube\.com\/watch\?.*v=/)) {
    currentTabId = tab.id;
    try {
      videoData = await extractYTData(tab.id);
      if (videoData?.videoId) {
        const slug = 'yt-' + videoData.videoId;
        el('videoTitle').textContent = videoData.title;
        el('slugInput').value = slug;
        el('slugPreview').textContent = slug;
      }
    } catch (_) { /* 抽出失敗は無視（履歴/実行中は見られる） */ }
  }

  // 実行中ジョブがあれば最優先で復元（別ページに遷移して開き直しても継続表示）
  if (currentJob?.status === 'running') { renderProcessing(currentJob); return; }

  // それ以外は通常フロー
  if (videoData?.videoId) showState(hasRequiredSettings() ? 'ready' : 'settings');
  else showState('no-yt');
});

/* ── storage.onChanged でジョブ進捗をライブ反映 ── */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.job) {
    currentJob = changes.job.newValue || null;
    if (!currentJob) return;
    if (currentJob.status === 'running') renderProcessing(currentJob);
    else if (currentJob.status === 'done') renderDone(currentJob.result);
    else if (currentJob.status === 'error') renderError(currentJob);
  }
  if (changes.history && !el('state-history').hidden) renderHistory();
});

/* ── 状態切替 ── */
function showState(state) {
  ['no-yt', 'loading', 'ready', 'settings', 'processing', 'done', 'error', 'history'].forEach(s => {
    const node = el('state-' + s);
    if (node) node.hidden = s !== state;
  });
}

/* ── 各ビューのレンダリング ── */
function renderProcessing(j) {
  el('processingTitle').textContent = j.title || '—';
  el('stepHihaho').style.display = j.useHihaho ? '' : 'none';

  const currentStep = j.step || 0;
  const progress = j.progress || 0;
  const elapsed = Date.now() - (j.stepStartedAt || Date.now());
  const isStuck = j.status === 'running' && elapsed > 90000 && progress < 95;

  document.querySelectorAll('.step').forEach((s, idx) => {
    s.classList.remove('active', 'done', 'stuck');
    const bar = s.querySelector('.step-bar-fill');
    const pct = s.querySelector('.step-pct');
    if (idx < currentStep) {
      s.classList.add('done');
      if (bar) bar.style.width = '100%';
    } else if (idx === currentStep) {
      s.classList.add('active');
      if (isStuck) s.classList.add('stuck');
      if (pct) pct.textContent = progress + '%';
      if (bar) bar.style.width = progress + '%';
    } else {
      if (bar) bar.style.width = '0%';
    }
  });

  const lbl = document.querySelector('.step[data-step="0"] .step-lbl');
  if (lbl) lbl.textContent = (currentStep === 0 && j.stepLabel) ? j.stepLabel : '文字起こし取得';

  showState('processing');
  startStuckRecheck();
}

function startStuckRecheck() {
  if (stuckRecheckTimer) return;
  stuckRecheckTimer = setInterval(() => {
    if (!currentJob || currentJob.status !== 'running') {
      clearInterval(stuckRecheckTimer); stuckRecheckTimer = null;
    } else {
      renderProcessing(currentJob);
    }
  }, 5000);
}

function renderDone(result) {
  if (!result) return;
  el('tabUrl').textContent = result.tabUrl;
  el('tabUrl').href = result.tabUrl;

  const auto = result.mode === 'auto';
  el('playerUrlBox').hidden = !auto;
  if (auto) {
    el('playerUrl').textContent = result.playerUrl || '(player URL不明)';
    el('playerUrl').href = result.playerUrl || '#';
  }

  el('iframeWarnBox').hidden = !result.iframeWarnMsg;
  if (result.iframeWarnMsg) el('iframeWarnMsg').textContent = result.iframeWarnMsg;

  el('setupBox').hidden = !result.setupText;
  if (result.setupText) {
    el('setupLabel').textContent = result.setupLabel || '';
    el('hihahoSetup').textContent = result.setupText;
  }
  showState('done');
}

function renderError(j) {
  el('errorMsg').textContent = j.error || 'エラーが発生しました。';
  el('retryBtn').hidden = false;
  showState('error');
}

async function renderHistory() {
  const { history = [] } = await chrome.storage.local.get('history');
  const list = el('historyList');
  if (!history.length) {
    list.innerHTML = '<div class="msg" style="padding:24px 4px"><div class="emoji">🕘</div>履歴はまだありません</div>';
    return;
  }
  list.innerHTML = history.map(h => `
    <div class="result-box">
      <div class="video-title" style="font-size:13px;margin-bottom:5px">${esc(h.title || h.videoId)}</div>
      <div class="input-hint" style="margin-bottom:9px">${fmtDate(h.createdAt)}</div>
      <a class="result-url" href="${esc(h.tabUrl)}" target="_blank">🌐 タブURL</a><br>
      ${h.playerUrl ? `<a class="result-url" href="${esc(h.playerUrl)}" target="_blank" style="display:inline-block;margin-top:5px">🎬 プレイヤー</a><br>` : ''}
      <a class="result-url" href="${esc(h.ytUrl)}" target="_blank" style="display:inline-block;margin-top:5px;color:var(--text-faint)">▶️ 元動画</a>
    </div>`).join('');
}

function fmtDate(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch (_) { return ''; }
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── Theme ── */
function applyTheme(theme) {
  document.body.dataset.theme = theme;
  el('themeToggleBtn').textContent = theme === 'light' ? '🌙' : '☀️';
  el('themeToggleBtn').title = theme === 'light' ? 'ダークモードに切り替え' : 'ライトモードに切り替え';
}

/* ── Settings ── */
async function loadSettings() {
  return new Promise(r => chrome.storage.local.get(
    ['claudeKey', 'openaiKey', 'githubToken', 'githubRepo',
     'hihahoClientId', 'hihahoClientSecret', 'hihahoUsername', 'hihahoPassword',
     'hihahoFolderId', 'hihahoToken', 'hihahoTokenExpiry', 'theme'],
    d => r({
      claudeKey:          d.claudeKey          || '',
      openaiKey:          d.openaiKey          || '',
      githubToken:        d.githubToken        || '',
      githubRepo:         d.githubRepo         || 'ryou-on/CC-DEV',
      hihahoClientId:     d.hihahoClientId     || '',
      hihahoClientSecret: d.hihahoClientSecret || '',
      hihahoUsername:     d.hihahoUsername     || '',
      hihahoPassword:     d.hihahoPassword     || '',
      hihahoFolderId:     d.hihahoFolderId     || '',
      hihahoToken:        d.hihahoToken        || '',
      hihahoTokenExpiry:  d.hihahoTokenExpiry  || 0,
      theme:              d.theme              || 'dark',
    })
  ));
}

function applySettingsToForm() {
  el('claudeKeyInput').value          = settings.claudeKey;
  el('openaiKeyInput').value          = settings.openaiKey;
  el('githubTokenInput').value        = settings.githubToken;
  el('repoInput').value               = settings.githubRepo;
  el('hihahoClientIdInput').value     = settings.hihahoClientId;
  el('hihahoClientSecretInput').value = settings.hihahoClientSecret;
  el('hihahoUsernameInput').value     = settings.hihahoUsername;
  el('hihahoPasswordInput').value     = settings.hihahoPassword;
  el('hihahoFolderIdInput').value     = settings.hihahoFolderId;
}

function collectAndSaveSettings() {
  const prevCreds = [settings.hihahoClientId, settings.hihahoClientSecret, settings.hihahoUsername, settings.hihahoPassword].join('|');
  settings.claudeKey          = el('claudeKeyInput').value.trim();
  settings.openaiKey          = el('openaiKeyInput').value.trim();
  settings.githubToken        = el('githubTokenInput').value.trim();
  settings.githubRepo         = el('repoInput').value.trim() || 'ryou-on/CC-DEV';
  settings.hihahoClientId     = el('hihahoClientIdInput').value.trim();
  settings.hihahoClientSecret = el('hihahoClientSecretInput').value.trim();
  settings.hihahoUsername     = el('hihahoUsernameInput').value.trim();
  settings.hihahoPassword     = el('hihahoPasswordInput').value;
  settings.hihahoFolderId     = el('hihahoFolderIdInput').value.trim();
  const newCreds = [settings.hihahoClientId, settings.hihahoClientSecret, settings.hihahoUsername, settings.hihahoPassword].join('|');
  if (prevCreds !== newCreds) { settings.hihahoToken = ''; settings.hihahoTokenExpiry = 0; }
  chrome.storage.local.set(settings);
}

function hasRequiredSettings() {
  return !!(settings.claudeKey && settings.githubToken && settings.githubRepo);
}
function hasHihahoSettings() {
  return !!(settings.hihahoClientId && settings.hihahoClientSecret && settings.hihahoUsername && settings.hihahoPassword);
}

/* ── YouTube動画情報の抽出（表示・起動用） ── */
async function extractYTData(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      const videoId = new URLSearchParams(location.search).get('v');
      if (!videoId) return null;

      let pr = null;
      try {
        const mp = document.getElementById('movie_player');
        if (mp && typeof mp.getPlayerResponse === 'function') pr = mp.getPlayerResponse();
      } catch (_) {}
      if (pr?.videoDetails?.videoId !== videoId) {
        const init = window.ytInitialPlayerResponse;
        pr = (init?.videoDetails?.videoId === videoId) ? init : (pr || init || {});
      }

      const title = pr?.videoDetails?.title
        || document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent?.trim()
        || document.title.replace(/ - YouTube$/, '');

      const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      let captionUrl = null;
      if (tracks.length) {
        const t = tracks.find(t => t.languageCode === 'ja' && t.kind !== 'asr')
               || tracks.find(t => t.languageCode === 'ja')
               || tracks.find(t => t.languageCode === 'en' && t.kind !== 'asr')
               || tracks.find(t => t.languageCode === 'en')
               || tracks[0];
        captionUrl = t.baseUrl;
      }

      let duration = Number(pr?.videoDetails?.lengthSeconds) || 0;
      if (!duration) {
        const v = document.querySelector('video');
        if (v && isFinite(v.duration)) duration = Math.floor(v.duration);
      }

      const formats = pr?.streamingData?.adaptiveFormats || [];
      const audioFormats = formats.filter(f => f.mimeType?.startsWith('audio/'));
      audioFormats.sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0));
      const bestAudio = audioFormats[0];
      let audioStreamUrl = null;
      if (bestAudio) {
        if (bestAudio.url) audioStreamUrl = bestAudio.url;
        else if (bestAudio.signatureCipher || bestAudio.cipher) {
          audioStreamUrl = new URLSearchParams(bestAudio.signatureCipher || bestAudio.cipher).get('url') || null;
        }
      }

      return { title, captionUrl, videoId, duration, audioStreamUrl };
    },
  });
  return results?.[0]?.result ?? null;
}

/* ── 生成開始（処理は background へ委譲） ── */
el('generateBtn').addEventListener('click', () => {
  collectAndSaveSettings();
  if (!hasRequiredSettings()) { showState('settings'); return; }
  if (!videoData?.videoId) { showState('no-yt'); return; }

  const slug = el('slugInput').value.trim() || 'yt-' + videoData.videoId;
  const useHihaho = hasHihahoSettings();

  // 楽観的に processing 表示（直後に background が job を更新して上書き）
  currentJob = { status: 'running', step: 0, stepLabel: '', useHihaho, title: videoData.title, videoId: videoData.videoId, stepStartedAt: Date.now(), progress: 0 };
  renderProcessing(currentJob);

  chrome.runtime.sendMessage({ type: 'startJob', tabId: currentTabId, videoData, slug, useHihaho }).catch(() => {});
});

/* ── 処理を破棄（詰まった時の脱出） ── */
el('discardBtn').addEventListener('click', () => {
  if (stuckRecheckTimer) { clearInterval(stuckRecheckTimer); stuckRecheckTimer = null; }
  chrome.runtime.sendMessage({ type: 'discardJob' }).catch(() => {});
  currentJob = null;
  showState(videoData?.videoId ? 'ready' : 'no-yt');
});

/* ── 履歴 ── */
el('historyToggleBtn').addEventListener('click', () => { renderHistory(); showState('history'); });
el('historyBackBtn').addEventListener('click', () => {
  if (currentJob?.status === 'running') renderProcessing(currentJob);
  else showState(videoData?.videoId ? 'ready' : 'no-yt');
});
el('historyClearBtn').addEventListener('click', () => {
  chrome.storage.local.set({ history: [] });
  renderHistory();
});

/* ── テーマ / 設定 ── */
el('themeToggleBtn').addEventListener('click', () => {
  settings.theme = document.body.dataset.theme === 'light' ? 'dark' : 'light';
  chrome.storage.local.set({ theme: settings.theme });
  applyTheme(settings.theme);
});
el('settingsToggleBtn').addEventListener('click', () => showState('settings'));
el('settingsSaveBtn').addEventListener('click', () => {
  collectAndSaveSettings();
  showState(videoData?.videoId ? (hasRequiredSettings() ? 'ready' : 'settings') : 'no-yt');
});
el('settingsCancelBtn').addEventListener('click', () => {
  showState(videoData?.videoId ? (hasRequiredSettings() ? 'ready' : 'settings') : 'no-yt');
});

/* ── done / error の操作 ── */
el('retryBtn').addEventListener('click', () => showState(videoData?.videoId ? 'ready' : 'no-yt'));
el('backBtn').addEventListener('click', () => showState(videoData?.videoId ? 'ready' : 'no-yt'));

el('copyLogBtn').addEventListener('click', () => {
  const text = [
    `=== YT→hihaho Tab v${chrome.runtime.getManifest().version} エラーログ ===`,
    `動画: ${currentJob?.videoId ? 'https://www.youtube.com/watch?v=' + currentJob.videoId : '-'}`,
    `エラー: ${currentJob?.error || el('errorMsg').textContent}`,
    '',
    ...(currentJob?.dbg || []),
  ].join('\n');
  navigator.clipboard.writeText(text).then(() => {
    const btn = el('copyLogBtn');
    btn.textContent = '✓ コピー完了';
    setTimeout(() => { btn.textContent = '📋 エラーログをコピー'; }, 1800);
  });
});

el('copyBtn').addEventListener('click', () => {
  const text = !el('iframeWarnBox').hidden ? el('iframeWarnMsg').textContent : el('hihahoSetup').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = el('copyBtn');
    btn.textContent = '✓ コピー完了';
    setTimeout(() => { btn.textContent = '📋 手順をコピー'; }, 1800);
  });
});

el('slugInput').addEventListener('input', e => { el('slugPreview').textContent = e.target.value || '...'; });
