/* ─────────────────────────────────────────
   YT → hihaho Tab  /  popup.js
   ───────────────────────────────────────── */

let settings = {};
let videoData = null;
let currentTabId = null;

/* ── デバッグログ（エラー時にコピー可能） ── */
const DBG = [];
function dbg(label, data) {
  let detail = '';
  if (data !== undefined) {
    try { detail = ' ' + (typeof data === 'string' ? data : JSON.stringify(data)); }
    catch (_) { detail = ' [unserializable]'; }
  }
  const line = `[${new Date().toISOString().slice(11, 19)}] ${label}${detail}`;
  DBG.push(line);
  console.log('[YT2hihaho]', line);
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', async () => {
  settings = await loadSettings();
  applyTheme(settings.theme);
  applySettingsToForm();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.match(/youtube\.com\/watch\?.*v=/)) {
    showState('no-yt');
    return;
  }

  currentTabId = tab.id;
  showState('loading');
  try {
    videoData = await extractYTData(tab.id);
    dbg('extract', videoData ? {
      videoId: videoData.videoId,
      hasCaptionUrl: !!videoData.captionUrl,
      duration: videoData.duration,
      hasAudioUrl: !!videoData.audioStreamUrl,
      ...videoData._diag,
    } : 'null');
    if (!videoData?.videoId) { showState('no-yt'); return; }

    const slug = 'yt-' + videoData.videoId;
    el('videoTitle').textContent = videoData.title;
    el('processingTitle').textContent = videoData.title;
    el('slugInput').value = slug;
    el('slugPreview').textContent = slug;

    showState(hasRequiredSettings() ? 'ready' : 'settings');
  } catch (e) {
    showError('ページ読み込み中です。YouTubeを再読み込みしてから再度開いてください。', false);
  }
});

/* ── Helpers ── */
const el = id => document.getElementById(id);

function showState(state) {
  ['no-yt', 'loading', 'ready', 'settings', 'processing', 'done', 'error'].forEach(s => {
    const node = el('state-' + s);
    if (node) node.hidden = s !== state;
  });
}

function setStep(i) {
  document.querySelectorAll('.step').forEach((s, idx) => {
    s.classList.remove('active', 'done');
    if (idx < i) s.classList.add('done');
    else if (idx === i) s.classList.add('active');
  });
}

function showError(msg, canRetry = true) {
  dbg('ERROR', msg);
  el('errorMsg').textContent = msg;
  el('retryBtn').hidden = !canRetry;
  showState('error');
}

/* ── Theme ── */
function applyTheme(theme) {
  document.body.dataset.theme = theme;
  // 切り替え先のアイコンを表示（dark中=☀️→ライトへ / light中=🌙→ダークへ）
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
  const prevCreds = [settings.hihahoClientId, settings.hihahoClientSecret,
                     settings.hihahoUsername, settings.hihahoPassword].join('|');
  settings.claudeKey          = el('claudeKeyInput').value.trim();
  settings.openaiKey          = el('openaiKeyInput').value.trim();
  settings.githubToken        = el('githubTokenInput').value.trim();
  settings.githubRepo         = el('repoInput').value.trim() || 'ryou-on/CC-DEV';
  settings.hihahoClientId     = el('hihahoClientIdInput').value.trim();
  settings.hihahoClientSecret = el('hihahoClientSecretInput').value.trim();
  settings.hihahoUsername     = el('hihahoUsernameInput').value.trim();
  settings.hihahoPassword     = el('hihahoPasswordInput').value;
  settings.hihahoFolderId     = el('hihahoFolderIdInput').value.trim();
  // 認証情報が変わったらキャッシュ済みトークンを破棄
  const newCreds = [settings.hihahoClientId, settings.hihahoClientSecret,
                    settings.hihahoUsername, settings.hihahoPassword].join('|');
  if (prevCreds !== newCreds) {
    settings.hihahoToken = '';
    settings.hihahoTokenExpiry = 0;
  }
  chrome.storage.local.set(settings);
}

function hasRequiredSettings() {
  return !!(settings.claudeKey && settings.githubToken && settings.githubRepo);
}

function hasHihahoSettings() {
  return !!(settings.hihahoClientId && settings.hihahoClientSecret
         && settings.hihahoUsername && settings.hihahoPassword);
}

/* ── YouTube Data Extraction (page context) ── */
async function extractYTData(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      const videoId = new URLSearchParams(location.search).get('v');
      if (!videoId) return null;

      // SPA遷移すると ytInitialPlayerResponse は古い動画のまま残るため、
      // player API（#movie_player.getPlayerResponse）から現在の動画の情報を優先取得
      let pr = null;
      let prSource = 'none';
      try {
        const mp = document.getElementById('movie_player');
        if (mp && typeof mp.getPlayerResponse === 'function') {
          pr = mp.getPlayerResponse();
          if (pr) prSource = 'player_api';
        }
      } catch (_) { /* player未初期化 */ }
      if (pr?.videoDetails?.videoId !== videoId) {
        const init = window.ytInitialPlayerResponse;
        if (init?.videoDetails?.videoId === videoId) {
          pr = init;
          prSource = 'initial';
        } else {
          pr = pr || init || {};
          prSource += ':stale';
        }
      }

      const title = pr?.videoDetails?.title
        || document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent?.trim()
        || document.title.replace(/ - YouTube$/, '');

      // キャプショントラック（手動字幕 > 自動字幕、ja > en）
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

      // 動画の長さ（秒）: playerResponse優先、video要素フォールバック
      let duration = Number(pr?.videoDetails?.lengthSeconds) || 0;
      if (!duration) {
        const v = document.querySelector('video');
        if (v && isFinite(v.duration)) duration = Math.floor(v.duration);
      }

      // Whisperフォールバック用: 最小ビットレートの音声ストリームURL
      // signatureCipher形式も考慮（url直接 or signatureCipherのurlパラメータ）
      const formats = pr?.streamingData?.adaptiveFormats || [];
      const audioFormats = formats.filter(f => f.mimeType?.startsWith('audio/'));
      audioFormats.sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0));
      const bestAudio = audioFormats[0];
      let audioStreamUrl = null;
      if (bestAudio) {
        if (bestAudio.url) {
          audioStreamUrl = bestAudio.url;
        } else if (bestAudio.signatureCipher || bestAudio.cipher) {
          const raw = bestAudio.signatureCipher || bestAudio.cipher;
          audioStreamUrl = new URLSearchParams(raw).get('url') || null;
        }
      }

      return {
        title, captionUrl, videoId, duration, audioStreamUrl,
        _diag: {
          prSource,
          prVideoId: pr?.videoDetails?.videoId || null,
          playability: pr?.playabilityStatus?.status || null,
          tracksCount: tracks.length,
          trackLangs: tracks.slice(0, 10).map(t => t.languageCode + (t.kind === 'asr' ? ':asr' : '')),
          formatsCount: formats.length,
          audioFormatsCount: audioFormats.length,
          bestAudioMime: bestAudio?.mimeType?.split(';')[0] || null,
          cipherOnly: !!(bestAudio && !bestAudio.url && (bestAudio.signatureCipher || bestAudio.cipher)),
        },
      };
    },
  });
  return results?.[0]?.result ?? null;
}

/* ── Transcript Fetch ──
   URLに既に fmt が付いていればそのまま、無ければ json3 を要求。
   ボディを JSON3 → XML(srv1:<text> / srv3:<p>) の順で寛容にパース */
async function fetchTranscript(captionUrl) {
  const url = captionUrl.includes('fmt=') ? captionUrl : captionUrl + '&fmt=json3';
  const res = await fetch(url);
  dbg('captions:fetch', { status: res.status, fmt: /fmt=([^&]*)/.exec(url)?.[1] || '(none)' });
  if (!res.ok) throw new Error(`字幕取得失敗: HTTP ${res.status}`);
  const body = await res.text();
  dbg('captions:body', { bytes: body.length });
  if (!body.trim()) return '';

  // JSON3
  try {
    const data = JSON.parse(body);
    const text = (data.events || [])
      .filter(e => e.segs)
      .map(e => e.segs.map(s => s.utf8 || '').join('').replace(/\n/g, ' '))
      .filter(t => t.trim())
      .join(' ');
    dbg('captions:json3:text', { length: text.length });
    if (text.trim()) return text;
  } catch (_) { /* XMLへ */ }

  // XML（srv1=<text>, srv3=<p>）
  const doc = new DOMParser().parseFromString(body, 'text/xml');
  const text = Array.from(doc.querySelectorAll('text, p'))
    .map(t => t.textContent.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\n/g, ' ').trim())
    .filter(Boolean)
    .join(' ');
  dbg('captions:xml:text', { length: text.length });
  return text;
}

/* ── プレイヤーに字幕を読み込ませ、PO token付き timedtext URL を横取り ──
   timedtext は BotGuard 由来の pot パラメータ必須。自前で生成できないため、
   プレイヤー本体に字幕リクエストを発行させ Resource Timing からURLを回収する */
async function fetchCaptionUrlViaPlayer(tabId, videoId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [videoId],
    func: async (videoId) => {
      const out = {};
      try {
        // PerformanceObserver で timedtext リクエストを監視
        // （Resource Timing バッファ溢れでも検知できるよう observer を使用）
        let captured = null;
        const obs = new PerformanceObserver(list => {
          for (const e of list.getEntries()) {
            if (e.name.includes('/api/timedtext') && e.name.includes(videoId)) captured = e.name;
          }
        });
        obs.observe({ type: 'resource', buffered: true });
        await new Promise(r => setTimeout(r, 100));
        if (captured) { out.reused = true; out.url = captured; obs.disconnect(); return out; }

        // CCボタンをクリックして字幕リクエストを発火させる（人間と同じ操作）
        const btn = document.querySelector('.ytp-subtitles-button');
        out.hasBtn = !!btn;
        const wasOn = btn?.getAttribute('aria-pressed') === 'true';
        out.wasOn = wasOn;

        if (btn) {
          out.method = 'button';
          if (wasOn) {
            // ON状態なのにリクエスト履歴なし → OFF→ONで再発火
            btn.click();
            await new Promise(r => setTimeout(r, 150));
          }
          btn.click(); // CC ON
        } else {
          // ボタンが見つからない場合は player API で試行
          out.method = 'setOption';
          const mp = document.getElementById('movie_player');
          if (!mp || typeof mp.getOption !== 'function') { obs.disconnect(); return { ...out, error: 'CCボタンもplayer APIもなし' }; }
          try { mp.loadModule('captions'); } catch (_) {}
          await new Promise(r => setTimeout(r, 600));
          let tl = [];
          try { tl = mp.getOption('captions', 'tracklist') || []; } catch (_) {}
          out.tracklist = tl.length;
          const pick = tl.find(t => t.languageCode === 'ja') || tl[0];
          if (pick) { try { mp.setOption('captions', 'track', pick); } catch (_) {} }
        }

        // 最大6秒待機
        for (let i = 0; i < 30 && !captured; i++) {
          await new Promise(r => setTimeout(r, 200));
        }
        obs.disconnect();

        // 字幕表示を元の状態へ戻す（クリックでONにした場合のみOFF）
        if (btn && !wasOn) { try { btn.click(); } catch (_) {} }

        out.url = captured;
        return out;
      } catch (e) {
        out.error = String(e);
        return out;
      }
    },
  });
  const r = results?.[0]?.result;
  dbg('harvest', {
    method: r?.method || null,
    hasBtn: r?.hasBtn ?? null,
    wasOn: r?.wasOn ?? null,
    tracklist: r?.tracklist ?? null,
    reused: r?.reused || false,
    gotUrl: !!r?.url,
    error: r?.error,
  });
  return r?.url || null;
}

/* ── YouTube timedtext API（自動字幕フォールバック） ── */
async function fetchAutoCaptions(videoId) {
  const attempts = [
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=ja&kind=asr&fmt=json3`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&kind=asr&fmt=json3`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=ja&fmt=json3`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`,
  ];
  for (const url of attempts) {
    try {
      const res = await fetch(url);
      const body = res.ok ? await res.text() : '';
      dbg('timedtext', { url: url.replace(/^https:\/\/www\.youtube\.com/, ''), status: res.status, bytes: body.length });
      if (!res.ok || !body) continue;
      const data = JSON.parse(body);
      const text = (data.events || [])
        .filter(e => e.segs)
        .map(e => e.segs.map(s => s.utf8 || '').join('').replace(/\n/g, ' '))
        .filter(t => t.trim())
        .join(' ');
      if (text.trim()) return text;
    } catch (e) { dbg('timedtext:error', e.message); }
  }
  return null;
}

/* ── Whisper API（字幕なし動画フォールバック） ── */
async function fetchTranscriptViaWhisper(audioUrl) {
  const audioRes = await fetch(audioUrl);
  dbg('whisper:audio', { status: audioRes.status });
  if (!audioRes.ok) throw new Error(`YouTube音声ストリーム取得失敗 (HTTP ${audioRes.status})。\nページを再読み込みして再試行してください。`);

  const audioBlob = await audioRes.blob();
  const sizeMB = (audioBlob.size / 1024 / 1024).toFixed(1);
  dbg('whisper:blob', { sizeMB, mime: audioBlob.type });
  if (audioBlob.size > 24.5 * 1024 * 1024) {
    throw new Error(`音声ファイルが大きすぎます（${sizeMB}MB）。\nWhisper APIの上限は25MBです。約60分超の動画は対象外です。`);
  }

  const mime = audioBlob.type;
  const ext = mime.includes('webm') ? 'webm' : mime.includes('mp4') ? 'mp4' : mime.includes('mpeg') ? 'mp3' : 'webm';

  const form = new FormData();
  form.append('file', audioBlob, `audio.${ext}`);
  form.append('model', 'whisper-1');
  form.append('response_format', 'text');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${settings.openaiKey}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error('Whisper API エラー: ' + (err.error?.message || `HTTP ${res.status}`));
  }

  const text = await res.text();
  if (!text.trim()) throw new Error('Whisper の文字起こし結果が空でした。');
  return text;
}

/* ── Innertube get_transcript（ページ内「文字起こし」パネルと同じAPI・ページ文脈で実行） ──
   timedtext が PO token 必須化され空を返すため、ページ自身の ytcfg
   （INNERTUBE_API_KEY / INNERTUBE_CONTEXT）を使い page context から呼び出す */
async function fetchTranscriptViaInnertube(tabId, videoId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [videoId],
    func: async (videoId) => {
      const out = { steps: [] };
      try {
        const get = k => (window.ytcfg?.get ? window.ytcfg.get(k) : window.ytcfg?.data_?.[k]);
        const key = get('INNERTUBE_API_KEY');
        const ctx = get('INNERTUBE_CONTEXT')
          || { client: { clientName: 'WEB', clientVersion: get('INNERTUBE_CLIENT_VERSION') || '2.20250101.00.00', hl: 'ja' } };
        // ログイン状態と同じ扱いにするため SAPISIDHASH を計算（cookieから取得可能）
        const sapisidHash = async () => {
          const m = document.cookie.match(/(?:^|;\s*)(?:__Secure-3P)?SAPISID=([^;]+)/);
          if (!m) return null;
          const ts = Math.floor(Date.now() / 1000);
          const buf = await crypto.subtle.digest('SHA-1',
            new TextEncoder().encode(`${ts} ${m[1]} https://www.youtube.com`));
          const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
          return `SAPISIDHASH ${ts}_${hex}`;
        };
        const auth = await sapisidHash();

        const post = async (path, body) => {
          const headers = { 'Content-Type': 'application/json' };
          if (auth) {
            headers['Authorization'] = auth;
            headers['X-Origin'] = 'https://www.youtube.com';
          }
          if (ctx?.client?.clientName === 'WEB') headers['X-Youtube-Client-Name'] = '1';
          if (ctx?.client?.clientVersion) headers['X-Youtube-Client-Version'] = ctx.client.clientVersion;
          const r = await fetch(`https://www.youtube.com/youtubei/v1/${path}${key ? '?key=' + key : ''}`, {
            method: 'POST',
            headers,
            credentials: 'include',
            body: JSON.stringify({ context: ctx, ...body }),
          });
          const step = { path, status: r.status };
          if (!r.ok) step.body = (await r.text().catch(() => '')).slice(0, 300);
          out.steps.push(step);
          return r.ok ? r.json() : null;
        };

        // 1. next レスポンスから文字起こしパネルの params を取得
        const next = await post('next', { videoId });
        if (!next) return out;
        const m = JSON.stringify(next).match(/"getTranscriptEndpoint":\{"params":"([^"]+)"/);
        out.hasParams = !!m;
        if (!m) return out;

        // 2. get_transcript でセグメント取得
        const tr = await post('get_transcript', { params: m[1] });
        if (!tr) return out;
        const texts = [];
        (function walk(o) {
          if (!o || typeof o !== 'object') return;
          if (o.transcriptSegmentRenderer?.snippet) {
            const t = (o.transcriptSegmentRenderer.snippet.runs || []).map(r => r.text || '').join('');
            if (t.trim()) texts.push(t.trim());
            return;
          }
          for (const k in o) walk(o[k]);
        })(tr);
        out.segments = texts.length;
        out.text = texts.join(' ');
        return out;
      } catch (e) {
        out.error = String(e);
        return out;
      }
    },
  });
  const r = results?.[0]?.result;
  dbg('get_transcript', { steps: r?.steps, hasParams: r?.hasParams ?? null, segments: r?.segments || 0, error: r?.error });
  return r?.text?.trim() ? r.text : null;
}

/* ── Innertube API 経由でオーディオURL取得（streamingData 未取得時のフォールバック） ── */
async function fetchAudioUrlFallback(videoId) {
  // IOS / ANDROID クライアントは signatureCipher なしの直接URLを返しやすい
  const clients = [
    { clientName: 'IOS',     clientVersion: '19.45.4', deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.1.0.22B83' },
    { clientName: 'ANDROID', clientVersion: '19.44.38', androidSdkVersion: 30, osName: 'Android', osVersion: '11' },
    { clientName: 'TVHTML5', clientVersion: '7.20250120.19.00' },
  ];
  for (const client of clients) {
    try {
      const res = await fetch('https://www.youtube.com/youtubei/v1/player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId,
          context: { client: { ...client, hl: 'ja' } },
          contentCheckOk: true,
          racyCheckOk: true,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        dbg('innertube:' + client.clientName, { status: res.status, body: errBody.slice(0, 200) });
        continue;
      }
      const data = await res.json();
      const formats = [
        ...(data.streamingData?.adaptiveFormats || []),
        ...(data.streamingData?.formats        || []),
      ];
      const audioFormats = formats.filter(f => f.mimeType?.startsWith('audio/') && f.url);
      dbg('innertube:' + client.clientName, {
        status: res.status,
        playability: data.playabilityStatus?.status || null,
        reason: data.playabilityStatus?.reason || undefined,
        formats: formats.length,
        audioWithUrl: audioFormats.length,
      });
      if (data.playabilityStatus?.status && data.playabilityStatus.status !== 'OK') continue;
      if (!audioFormats.length) continue;
      audioFormats.sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0));
      return audioFormats[0].url;
    } catch (e) { dbg('innertube:' + client.clientName + ':error', e.message); }
  }
  return null;
}

/* ── Claude API ── */
async function callClaude(title, transcript) {
  const truncated = transcript.length > 9000 ? transcript.slice(0, 9000) + '...' : transcript;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': settings.claudeKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `YouTube動画「${title}」の文字起こしを分析し、hihaho補助教材タブ用コンテンツをJSONのみで返してください（前置き・説明文不要）。

出力形式:
{
  "summary": {
    "sections": [
      {"emoji": "📌", "heading": "セクション名", "text": "2〜3文の説明"}
    ]
  },
  "glossary": [
    {"term": "用語", "reading": "よみがな（漢字語のみ・不要なら空文字）", "definition": "1〜2文の定義"}
  ]
}

制約:
- summaryは3〜5セクション（動画の流れに沿った構成）
- glossaryは重要用語5〜15項目（内容に登場する専門用語・固有名詞を優先）
- readingは漢字熟語にのみ付与、平仮名のみの用語は空文字でOK
- 出力はJSON一つだけ

文字起こし:
${truncated}`,
      }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error('Claude API エラー: ' + (err.error?.message || `HTTP ${res.status}`));
  }

  const data = await res.json();
  const raw = data.content?.[0]?.text || '';
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AIレスポンスのJSON解析失敗。もう一度試してください。');

  try {
    return JSON.parse(match[0]);
  } catch {
    throw new Error('JSON形式が不正です。もう一度試してください。');
  }
}

/* ── HTML Escape ── */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── HTML Generator ── */
function generateHTML(title, content) {
  const { summary, glossary } = content;

  const summaryCards = (summary?.sections || []).map(s => `
        <div class="summary-card">
          <div class="s-head"><span class="s-emoji">${esc(s.emoji)}</span>${esc(s.heading)}</div>
          <div class="s-text">${esc(s.text)}</div>
        </div>`).join('') || '<p style="color:#64748b;padding:12px">要約データなし</p>';

  const glossaryItems = (glossary || []).map((g, i) => `
        <div class="acc" id="g${i}">
          <div class="acc-h" onclick="tg('g${i}')">
            <span class="acc-term">${esc(g.term)}</span>${g.reading ? `<span class="acc-rd">${esc(g.reading)}</span>` : ''}
            <span class="acc-arr">▼</span>
          </div>
          <div class="acc-body"><div class="acc-cnt">${esc(g.definition)}</div></div>
        </div>`).join('') || '<p style="color:#64748b;padding:12px">用語データなし</p>';

  return `<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=1920">
<title>${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--a:#1a56db;--ad:#1040b0;--bg:#fff;--bd:#e2e8f0;--t:#1e293b;--s:#64748b;--gold:#f59e0b}
html,body{width:1920px;height:1080px;overflow:hidden;font-family:'Noto Sans JP',sans-serif;background:transparent;color:var(--t)}
.frame{position:fixed;inset:0;pointer-events:none}
.tab-row{position:absolute;top:0;left:50%;transform:translateX(-50%);display:flex;gap:10px;z-index:20;pointer-events:none}
.tab{pointer-events:auto;background:rgba(255,255,255,.96);color:var(--ad);font-size:18px;font-weight:700;letter-spacing:.08em;padding:11px 32px;border:none;border-radius:0 0 18px 18px;box-shadow:0 5px 18px rgba(0,0,0,.3);cursor:pointer;display:flex;align-items:center;gap:8px;min-height:48px;transition:background .18s,color .18s,transform .1s;white-space:nowrap;border-top:3px solid var(--a)}
.tab:hover{background:#eff6ff}.tab:active{transform:scale(.95)}
.tc{width:14px;height:14px;transition:transform .3s;flex-shrink:0}
.frame[data-open="true"] .tab[aria-pressed="true"]{background:var(--a);color:#fff;border-top-color:var(--gold)}
.frame[data-open="true"] .tab[aria-pressed="true"] .tc{transform:rotate(180deg)}
.panel{position:absolute;top:0;left:50%;width:980px;max-height:820px;background:var(--bg);border-radius:0 0 20px 20px;box-shadow:0 14px 50px rgba(0,0,0,.4);pointer-events:auto;display:flex;flex-direction:column;z-index:10;transform:translate(-50%,-102%);transition:transform .4s cubic-bezier(.32,.72,0,1),visibility 0s linear .4s;overflow:hidden;visibility:hidden;border:1px solid var(--bd);border-top:none}
.frame[data-open="true"] .panel{transform:translate(-50%,0);visibility:visible;transition:transform .4s cubic-bezier(.32,.72,0,1),visibility 0s linear 0s}
.pi{flex:1;overflow-y:auto;padding:52px 32px 24px}
.pi::-webkit-scrollbar{width:5px}
.pi::-webkit-scrollbar-thumb{background:var(--a);border-radius:3px;opacity:.5}
.sh{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;padding-bottom:12px;border-bottom:2px solid var(--a)}
.st{font-size:20px;font-weight:700;color:var(--ad)}
.cb{width:38px;height:38px;border-radius:50%;background:#f1f5f9;border:1.5px solid var(--bd);cursor:pointer;display:flex;align-items:center;justify-content:center;color:#64748b;transition:all .15s}
.cb:hover{background:#fee2e2;border-color:#f87171;color:#ef4444}.cb:active{transform:scale(.92)}
.cb svg{width:16px;height:16px}
.sec{display:none}
.frame[data-active="summary"] .sec[data-section="summary"]{display:block}
.frame[data-active="glossary"] .sec[data-section="glossary"]{display:block}
.summary-card{background:#f8faff;border:1px solid #dbeafe;border-left:4px solid var(--a);border-radius:6px;padding:16px 20px;margin-bottom:12px}
.s-head{font-size:17px;font-weight:700;color:var(--ad);margin-bottom:8px;display:flex;align-items:center;gap:8px}
.s-emoji{font-size:20px}
.s-text{font-size:15px;line-height:1.85;color:#374151}
.acc{background:#fff;border:1px solid var(--bd);border-radius:6px;margin-bottom:8px;overflow:hidden;transition:box-shadow .15s}
.acc:hover{box-shadow:0 2px 8px rgba(26,86,219,.1)}
.acc-h{padding:14px 18px;cursor:pointer;display:flex;align-items:center;gap:12px;user-select:none;transition:background .15s}
.acc-h:hover{background:#f0f7ff}
.acc.open .acc-h{background:#eff6ff}
.acc-term{font-size:17px;font-weight:700;flex:1}
.acc-rd{font-size:12px;color:var(--s);background:#f1f5f9;padding:2px 8px;border-radius:3px;flex-shrink:0}
.acc-arr{color:var(--s);font-size:12px;transition:transform .3s;flex-shrink:0}
.acc.open .acc-arr{transform:rotate(180deg)}
.acc-body{max-height:0;overflow:hidden;transition:max-height .35s ease}
.acc.open .acc-body{max-height:300px}
.acc-cnt{padding:12px 18px 16px;font-size:15px;line-height:1.8;color:#374151;border-top:1px solid var(--bd)}
</style></head>
<body>
<div class="frame" data-open="false" data-active="summary" id="F">
  <div class="panel"><div class="pi" id="PI">
    <div class="sec" data-section="summary">
      <div class="sh">
        <div class="st">📋 要約</div>
        <button class="cb" onclick="cls()"><svg viewBox="0 0 20 20" fill="none"><path d="M5 5L15 15M15 5L5 15" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button>
      </div>
      ${summaryCards}
    </div>
    <div class="sec" data-section="glossary">
      <div class="sh">
        <div class="st">📚 用語集</div>
        <button class="cb" onclick="cls()"><svg viewBox="0 0 20 20" fill="none"><path d="M5 5L15 15M15 5L5 15" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button>
      </div>
      ${glossaryItems}
    </div>
  </div></div>
  <div class="tab-row">
    <button class="tab" data-target="summary" aria-pressed="true" onclick="tab_('summary')">
      <span>📋 要約</span>
      <svg class="tc" viewBox="0 0 16 16" fill="none"><path d="M3 6L8 11L13 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <button class="tab" data-target="glossary" aria-pressed="false" onclick="tab_('glossary')">
      <span>📚 用語集</span>
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

/* ── GitHub Deploy ── */
async function deployToGitHub(slug, html) {
  const repo = settings.githubRepo;
  const path = `public/${slug}/index.html`;
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${path}`;
  const headers = {
    'Authorization': `Bearer ${settings.githubToken}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };

  // Check if file exists (need SHA to update)
  let sha;
  try {
    const check = await fetch(apiUrl, { headers });
    if (check.ok) sha = (await check.json()).sha;
  } catch (_) { /* new file */ }

  // Base64 encode (UTF-8 safe)
  const encoded = btoa(unescape(encodeURIComponent(html)));

  const res = await fetch(apiUrl, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `feat: AI生成タブ追加 (${slug})\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`,
      content: encoded,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error('GitHub エラー: ' + (err.message || `HTTP ${res.status}`));
  }

  return `https://cc-dev-ps7.web.app/${slug}/`;
}

/* ── hihaho API ──
   docs: https://api-docs.hihaho.com/
   - OAuth password grant（トークン有効期限1年、storageにキャッシュ）
   - POST /v2/video-container/{folder}/video-from-platform で YouTube取り込み
   - POST /v2/video/{id}/interaction/batch で iFrame配置
     ※iframe型は公式ドキュメント未記載のため url / iframe_url の2形式を試行 */

const HIHAHO_API = 'https://api.hihaho.com';

async function getHihahoToken() {
  // キャッシュ有効（期限1日前マージン）ならそれを使う
  if (settings.hihahoToken && Date.now() < settings.hihahoTokenExpiry - 86400_000) {
    return settings.hihahoToken;
  }
  const body = new URLSearchParams({
    grant_type:    'password',
    client_id:     settings.hihahoClientId,
    client_secret: settings.hihahoClientSecret,
    username:      settings.hihahoUsername,
    password:      settings.hihahoPassword,
  });
  const res = await fetch(`${HIHAHO_API}/oauth/access_token`, { method: 'POST', body });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error('hihaho 認証失敗: ' + (err.message || err.error_description || `HTTP ${res.status}`) +
      '\nClient ID / Secret / ユーザー名 / パスワードを確認してください。');
  }
  const data = await res.json();
  settings.hihahoToken = data.access_token;
  settings.hihahoTokenExpiry = Date.now() + (data.expires_in || 31536000) * 1000;
  chrome.storage.local.set({
    hihahoToken: settings.hihahoToken,
    hihahoTokenExpiry: settings.hihahoTokenExpiry,
  });
  return settings.hihahoToken;
}

async function hihahoFetch(path, opts = {}) {
  const token = await getHihahoToken();
  return fetch(`${HIHAHO_API}${path}`, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      ...(opts.headers || {}),
    },
  });
}

async function resolveHihahoFolderId() {
  if (settings.hihahoFolderId) return settings.hihahoFolderId;
  // 自動検出: 既存動画の所属フォルダを流用
  const res = await hihahoFetch('/v2/video');
  if (!res.ok) throw new Error(`hihaho フォルダ自動検出失敗: HTTP ${res.status}。設定でフォルダIDを指定してください。`);
  const data = await res.json();
  const videos = data.data || [];
  if (!videos.length) throw new Error('hihahoに動画が1本もないためフォルダを自動検出できません。設定でフォルダIDを指定してください。');
  const folderId = videos[0].video_container_id;
  if (!folderId) throw new Error('フォルダIDを特定できませんでした。設定で指定してください。');
  return folderId;
}

async function listHihahoVideoIds() {
  const res = await hihahoFetch('/v2/video');
  if (!res.ok) return new Set();
  const data = await res.json();
  return new Set((data.data || []).map(v => v.id));
}

async function createHihahoVideoFromYouTube(folderId, youtubeUrl, beforeIds) {
  const body = new URLSearchParams({
    platform: 'youtube',
    platform_reference: youtubeUrl,
  });
  const res = await hihahoFetch(`/v2/video-container/${folderId}/video-from-platform`, {
    method: 'POST',
    body,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error('hihaho 動画作成失敗: ' + (err.message || `HTTP ${res.status}`) +
      (err.errors ? '\n' + JSON.stringify(err.errors) : ''));
  }

  // レスポンスに動画オブジェクトが含まれていればそれを使う
  const direct = await res.json().catch(() => null);
  if (direct?.data?.id) return direct.data;

  // 204等でボディ無し → 動画一覧の差分をポーリング（最大30秒）
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const listRes = await hihahoFetch('/v2/video');
    if (!listRes.ok) continue;
    const list = (await listRes.json()).data || [];
    const fresh = list.filter(v => !beforeIds.has(v.id));
    if (fresh.length) {
      // 複数あれば id 最大 = 最新
      const video = fresh.sort((a, b) => b.id - a.id)[0];
      // 単体取得で player_url 等の完全な情報に差し替え
      const detail = await hihahoFetch(`/v2/video/${video.id}`);
      if (detail.ok) {
        const d = await detail.json().catch(() => null);
        if (d?.data) return d.data;
      }
      return video;
    }
  }
  throw new Error('hihaho 動画作成後の検出がタイムアウトしました。studioで動画が作成されているか確認してください。');
}

async function createIframeInteraction(videoId, tabUrl, duration) {
  const base = {
    type: 'iframe',
    start_time: 0,
    end_time: duration > 0 ? duration : 3600,
    title: 'AI生成タブ',
    style: { top: '0%', left: '0%', width: '100%', height: '100%' },
  };
  // iframe型はドキュメント未記載 → URLキー2形式を順に試す
  const attempts = [
    { ...base, url: tabUrl },
    { ...base, iframe_url: tabUrl },
  ];
  let lastErr = '';
  for (const payload of attempts) {
    const res = await hihahoFetch(`/v2/video/${videoId}/interaction/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([payload]),
    });
    if (res.ok) return true;
    const err = await res.json().catch(() => ({}));
    lastErr = (err.message || `HTTP ${res.status}`) +
      (err.errors ? '\n' + JSON.stringify(err.errors, null, 1) : '');
    if (res.status !== 422) break; // 422以外（権限等）は別キーを試しても無駄
  }
  throw new Error(lastErr);
}

/* ── Main Generate Flow ── */
el('generateBtn').addEventListener('click', async () => {
  collectAndSaveSettings();
  if (!hasRequiredSettings()) { showState('settings'); return; }

  const slug = el('slugInput').value.trim() || 'yt-' + videoData.videoId;
  const useHihahoApi = hasHihahoSettings();
  el('processingTitle').textContent = videoData.title;
  el('stepHihaho').style.display = useHihahoApi ? '' : 'none';
  showState('processing');

  try {
    // Step 0: Transcript（字幕 → timedtext自動字幕 → Whisper の3段フォールバック）
    setStep(0);
    const stepLabel = () => document.querySelector('.step[data-step="0"] span:last-child');
    let transcript;

    const lbl = stepLabel();

    // 1. captionTracks から字幕取得（失敗・空なら次へフォールスルー）
    if (videoData.captionUrl) {
      try { transcript = await fetchTranscript(videoData.captionUrl); } catch (_) { /* 次へ */ }
    }

    // 2. プレイヤー経由で PO token 付き timedtext URL を回収して取得
    if (!transcript?.trim()) {
      if (lbl) lbl.textContent = 'プレイヤー経由で字幕を取得中...';
      const harvestedUrl = await fetchCaptionUrlViaPlayer(currentTabId, videoData.videoId);
      if (harvestedUrl) {
        try { transcript = await fetchTranscript(harvestedUrl); } catch (_) { /* 次へ */ }
      }
    }

    // 3. Innertube get_transcript（ページ内「文字起こし」パネルと同じAPI）
    if (!transcript?.trim()) {
      if (lbl) lbl.textContent = '文字起こしパネルから取得中...';
      transcript = await fetchTranscriptViaInnertube(currentTabId, videoData.videoId);
    }

    // 4. YouTube timedtext API（自動字幕）
    if (!transcript?.trim()) {
      if (lbl) lbl.textContent = '自動字幕を取得中...';
      transcript = await fetchAutoCaptions(videoData.videoId);
    }

    // 5. Whisper API（audioStreamUrl が null なら Innertube API でURL取得）
    if (!transcript?.trim()) {
      if (!settings.openaiKey) {
        throw new Error('この動画から字幕・自動字幕を取得できませんでした。\n設定からOpenAI API Keyを入力するとWhisper APIで文字起こしできます。');
      }
      let audioUrl = videoData.audioStreamUrl;
      if (!audioUrl) {
        if (lbl) lbl.textContent = '音声URLを取得中...';
        audioUrl = await fetchAudioUrlFallback(videoData.videoId);
      }
      if (!audioUrl) throw new Error('音声ストリームの取得に失敗しました。\nページを再読み込みして再試行してください。');
      if (lbl) lbl.textContent = 'Whisper 音声文字起こし中...';
      transcript = await fetchTranscriptViaWhisper(audioUrl);
    }

    if (!transcript?.trim()) throw new Error('文字起こしが空です。');
    dbg('transcript', { length: transcript.length });

    // Step 1: Claude
    setStep(1);
    const content = await callClaude(videoData.title, transcript);
    dbg('claude', { sections: content.summary?.sections?.length || 0, glossary: content.glossary?.length || 0 });

    // Step 2: Generate HTML
    setStep(2);
    const html = generateHTML(videoData.title, content);

    // Step 3: Deploy
    setStep(3);
    const tabUrl = await deployToGitHub(slug, html);
    dbg('deploy', tabUrl);

    const ytUrl = `https://www.youtube.com/watch?v=${videoData.videoId}`;

    // Step 4: hihaho（API設定があれば自動作成）
    let hihahoVideo = null;
    let iframeError = null;
    if (useHihahoApi) {
      setStep(4);
      const folderId = await resolveHihahoFolderId();
      dbg('hihaho:folder', folderId);
      const beforeIds = await listHihahoVideoIds();
      hihahoVideo = await createHihahoVideoFromYouTube(folderId, ytUrl, beforeIds);
      dbg('hihaho:video', { id: hihahoVideo.id, player_url: hihahoVideo.player_url || null });
      try {
        await createIframeInteraction(hihahoVideo.id, tabUrl, videoData.duration);
        dbg('hihaho:iframe', 'ok');
      } catch (e) {
        iframeError = e.message;
        dbg('hihaho:iframe:error', e.message);
      }
    }

    // Done
    setStep(5);
    el('tabUrl').textContent = tabUrl;
    el('tabUrl').href = tabUrl;

    if (hihahoVideo) {
      // 自動作成モードの結果表示
      el('playerUrlBox').hidden = false;
      el('playerUrl').textContent = hihahoVideo.player_url || '(player URL不明)';
      el('playerUrl').href = hihahoVideo.player_url || '#';

      if (iframeError) {
        el('iframeWarnBox').hidden = false;
        el('iframeWarnMsg').textContent =
`APIエラー:
${iframeError}

studioで手動追加してください:
インタラクション → iFrame
URL: ${tabUrl}
サイズ: 全画面 / 表示: 動画全体`;
        el('setupBox').hidden = true;
      } else {
        el('iframeWarnBox').hidden = true;
        el('setupBox').hidden = false;
        el('setupLabel').textContent = '✅ 残作業（studio）';
        el('hihahoSetup').textContent =
`① studio.hihaho.com で動画を開く
   「${videoData.title}」
② プレビューでタブ動作を確認
③ 公開設定を ON にする`;
      }
    } else {
      // 手動モード（hihaho API未設定）
      el('playerUrlBox').hidden = true;
      el('iframeWarnBox').hidden = true;
      el('setupBox').hidden = false;
      el('setupLabel').textContent = '📹 hihaho 設定手順';
      el('hihahoSetup').textContent =
`① hihaho 新規動画作成
   動画ソース: YouTube
   URL: ${ytUrl}

② インタラクション追加 → [iFrame]
   URL: ${tabUrl}
   サイズ: 1920 × 1080
   位置: X=0, Y=0

③ 表示設定
   表示: 動画全体（開始〜終了）
   背景透過: ON

④ 公開して player.hihaho.com で確認

💡 設定(⚙)にhihaho API情報を入れると①②も自動化されます`;
    }

    showState('done');
  } catch (e) {
    showError(e.message);
  }
});

/* ── Event Listeners ── */
el('themeToggleBtn').addEventListener('click', () => {
  settings.theme = document.body.dataset.theme === 'light' ? 'dark' : 'light';
  chrome.storage.local.set({ theme: settings.theme });
  applyTheme(settings.theme);
});

el('settingsToggleBtn').addEventListener('click', () => showState('settings'));

el('settingsSaveBtn').addEventListener('click', () => {
  collectAndSaveSettings();
  if (videoData) showState(hasRequiredSettings() ? 'ready' : 'settings');
  else showState('no-yt');
});

el('settingsCancelBtn').addEventListener('click', () => {
  if (videoData) showState(hasRequiredSettings() ? 'ready' : 'settings');
  else showState('no-yt');
});

el('retryBtn').addEventListener('click', () => {
  showState(videoData ? 'ready' : 'no-yt');
});

el('copyLogBtn').addEventListener('click', () => {
  const text = [
    `=== YT→hihaho Tab v${chrome.runtime.getManifest().version} エラーログ ===`,
    `動画: ${videoData?.videoId ? 'https://www.youtube.com/watch?v=' + videoData.videoId : '-'}`,
    `エラー: ${el('errorMsg').textContent}`,
    '',
    ...DBG,
  ].join('\n');
  navigator.clipboard.writeText(text).then(() => {
    const btn = el('copyLogBtn');
    btn.textContent = '✓ コピー完了';
    setTimeout(() => { btn.textContent = '📋 エラーログをコピー'; }, 1800);
  });
});

el('backBtn').addEventListener('click', () => showState('ready'));

el('copyBtn').addEventListener('click', () => {
  const text = !el('iframeWarnBox').hidden
    ? el('iframeWarnMsg').textContent
    : el('hihahoSetup').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = el('copyBtn');
    btn.textContent = '✓ コピー完了';
    setTimeout(() => { btn.textContent = '📋 手順をコピー'; }, 1800);
  });
});

el('slugInput').addEventListener('input', e => {
  el('slugPreview').textContent = e.target.value || '...';
});
