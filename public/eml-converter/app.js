import PostalMime from './vendor/postal-mime.js';

const APP_ID = 'eml-converter';
const APP_VERSION = '1.0.0';
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const HOME_URL = 'https://cc-dev-ps7.web.app/';
const RELEASE_NOTES = Object.freeze([
  {
    ver: 'v1.0.0',
    date: '2026-10-26',
    changes: [
      'EMLのドラッグ＆ドロップと文字コードを考慮したメール解析に対応',
      '件名・差出人・宛先・日時・本文の確認と編集、TXT保存を追加',
      '日本語を文字選択できる印刷PDFへの変換に対応',
      '添付ファイルの一覧表示と個別保存に対応',
      'ブラウザ内だけで処理するプライバシー設計を採用'
    ]
  }
]);

const HOW_TO_USE = Object.freeze([
  { heading: 'このアプリの目的', text: 'EML形式で保存された1通のメールを読みやすく確認し、プレーンテキストまたはPDFとして保管するためのアプリです。' },
  { heading: '1. EMLを読み込む', text: '中央へ.emlファイルをドロップするか、「EMLを選ぶ」を押します。最大50MBまで、1通ずつ処理できます。' },
  { heading: '2. 内容を確認する', text: '件名、差出人、宛先、日時と本文が表示されます。本文欄は必要に応じて編集できます。' },
  { heading: '3. TXTまたはPDFで保存する', text: '「TXTを保存」で直接ダウンロードできます。「PDFに変換」では印刷画面が開くため、送信先で「PDFとして保存」を選んでください。' },
  { heading: '添付ファイル', text: '添付はPDF/TXTに埋め込まれません。必要なものは添付一覧から個別に保存してください。' },
  { heading: '注意事項', text: '内容はサーバーへ送信せずブラウザ内だけで処理します。暗号化・署名付きEML、破損ファイル、特殊なメールでは一部を正しく展開できない場合があります。' }
]);

const state = {
  file: null,
  email: null,
  attachmentUrls: [],
  lastErrorCode: '',
  modalOpener: null,
  toastTimer: 0
};

const el = Object.fromEntries([
  'file-input', 'choose-button', 'replace-button', 'drop-zone', 'upload-stage', 'result-stage',
  'file-name', 'file-size', 'meta-subject', 'meta-from', 'meta-to', 'meta-cc', 'meta-date',
  'body-editor', 'character-count', 'attachment-list', 'attachment-empty', 'attachment-count',
  'download-txt', 'save-pdf', 'clear-button', 'status-panel', 'status-message', 'toast',
  'info-modal', 'modal-title', 'modal-body', 'modal-x', 'modal-close',
  'feedback-modal', 'feedback-x', 'feedback-close', 'feedback-copy', 'feedback-type', 'feedback-message',
  'manual-button', 'version-button', 'feedback-button', 'debug-button',
  'print-subject', 'print-from', 'print-to', 'print-cc', 'print-cc-row', 'print-date', 'print-body'
].map(id => [id.replaceAll('-', '_'), document.getElementById(id)]));

function showToast(message) {
  clearTimeout(state.toastTimer);
  el.toast.textContent = message;
  el.toast.classList.add('show');
  state.toastTimer = window.setTimeout(() => el.toast.classList.remove('show'), 2500);
}

function setStatus(message = '', code = '') {
  state.lastErrorCode = code;
  el.status_message.textContent = message;
  el.status_panel.hidden = !message;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** index);
  return `${value.toFixed(index === 0 || value >= 10 ? 0 : 1)} ${units[index]}`;
}

function sanitizeFilename(value, extension) {
  const cleaned = String(value || 'メール')
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90) || 'メール';
  return `${cleaned}.${extension}`;
}

function flattenAddresses(items) {
  const output = [];
  for (const item of items || []) {
    if (Array.isArray(item.group)) {
      const members = flattenAddresses(item.group);
      output.push(item.name ? `${item.name}: ${members}` : members);
      continue;
    }
    const name = String(item.name || '').trim();
    const address = String(item.address || '').trim();
    if (name && address) output.push(`${name} <${address}>`);
    else if (address || name) output.push(address || name);
  }
  return output.join(', ');
}

function formatSingleAddress(item) {
  return flattenAddresses(item ? [item] : []);
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'long',
    timeStyle: 'medium',
    timeZone: 'Asia/Tokyo'
  }).format(date);
}

function htmlToText(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  doc.querySelectorAll('script,style,noscript,template,iframe,object,embed').forEach(node => node.remove());
  doc.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
  doc.querySelectorAll('p,div,li,tr,h1,h2,h3,h4,h5,h6,blockquote').forEach(node => node.append('\n'));
  return (doc.body.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function emailView() {
  const email = state.email || {};
  return {
    subject: String(email.subject || '（件名なし）'),
    from: formatSingleAddress(email.from) || '—',
    to: flattenAddresses(email.to) || '—',
    cc: flattenAddresses(email.cc) || '',
    date: formatDate(email.date) || '—',
    body: el.body_editor.value
  };
}

function buildPlainText() {
  const view = emailView();
  const lines = [
    `件名: ${view.subject}`,
    `差出人: ${view.from}`,
    `宛先: ${view.to}`
  ];
  if (view.cc) lines.push(`CC: ${view.cc}`);
  lines.push(`日時: ${view.date}`, '', view.body || '');
  return lines.join('\n');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function revokeAttachmentUrls() {
  state.attachmentUrls.forEach(url => URL.revokeObjectURL(url));
  state.attachmentUrls = [];
}

function attachmentBlob(attachment) {
  const content = attachment.content;
  if (content instanceof Blob) return content;
  if (content instanceof ArrayBuffer) return new Blob([content], { type: attachment.mimeType || 'application/octet-stream' });
  if (ArrayBuffer.isView(content)) return new Blob([content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength)], { type: attachment.mimeType || 'application/octet-stream' });
  if (typeof content === 'string') {
    const binary = atob(content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: attachment.mimeType || 'application/octet-stream' });
  }
  return new Blob([], { type: attachment.mimeType || 'application/octet-stream' });
}

function renderAttachments() {
  revokeAttachmentUrls();
  el.attachment_list.replaceChildren();
  const attachments = Array.isArray(state.email?.attachments) ? state.email.attachments : [];
  el.attachment_count.textContent = `${attachments.length}件`;
  el.attachment_empty.hidden = attachments.length > 0;

  attachments.forEach((attachment, index) => {
    const blob = attachmentBlob(attachment);
    const url = URL.createObjectURL(blob);
    state.attachmentUrls.push(url);

    const item = document.createElement('li');
    item.className = 'attachment-item';
    const description = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'attachment-name';
    name.textContent = attachment.filename || `添付ファイル-${index + 1}`;
    const meta = document.createElement('div');
    meta.className = 'attachment-meta';
    meta.textContent = `${attachment.mimeType || 'application/octet-stream'} · ${formatBytes(blob.size)}`;
    description.append(name, meta);
    const button = document.createElement('button');
    button.className = 'mini-button';
    button.type = 'button';
    button.textContent = '保存';
    button.addEventListener('click', () => {
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.filename || `attachment-${index + 1}`;
      link.click();
      showToast('添付ファイルを保存しました');
    });
    item.append(description, button);
    el.attachment_list.append(item);
  });
}

function renderEmail() {
  const email = state.email;
  const body = String(email.text || '').trim() || htmlToText(email.html) || '（本文を抽出できませんでした）';
  const view = {
    subject: String(email.subject || '（件名なし）'),
    from: formatSingleAddress(email.from) || '—',
    to: flattenAddresses(email.to) || '—',
    cc: flattenAddresses(email.cc) || '—',
    date: formatDate(email.date) || '—'
  };

  el.file_name.textContent = state.file.name;
  el.file_size.textContent = `${formatBytes(state.file.size)} · ブラウザ内で処理済み`;
  el.meta_subject.textContent = view.subject;
  el.meta_from.textContent = view.from;
  el.meta_to.textContent = view.to;
  el.meta_cc.textContent = view.cc;
  el.meta_date.textContent = view.date;
  el.body_editor.value = body;
  updateCharacterCount();
  renderAttachments();
  el.upload_stage.hidden = true;
  el.result_stage.hidden = false;
  setStatus();
  el.body_editor.focus();
}

function parserMessage(error) {
  const code = String(error?.code || 'EPARSE');
  if (code === 'EMAXHEADERSIZE') return 'メールヘッダーが大きすぎるため、安全に読み込めませんでした。';
  if (code.includes('MAX') || code.includes('DEPTH')) return 'メールの構造が複雑すぎるため、安全上の制限で処理を止めました。';
  return 'EMLの内容を解析できませんでした。ファイルが破損していないか確認してください。';
}

async function loadFile(file) {
  setStatus();
  if (!(file instanceof File)) return;
  const hasEmlExtension = file.name.toLowerCase().endsWith('.eml');
  const hasEmlType = file.type === 'message/rfc822';
  if (!hasEmlExtension && !hasEmlType) {
    setStatus('拡張子が.emlのファイルを選んでください。', 'EFILETYPE');
    return;
  }
  if (!file.size) {
    setStatus('空のファイルは読み込めません。', 'EEMPTY');
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    setStatus('50MBを超えるEMLは読み込めません。', 'EFILESIZE');
    return;
  }

  setBusy(true);
  try {
    const email = await PostalMime.parse(file, {
      maxHeadersSize: 1024 * 1024,
      maxNestingDepth: 30,
      maxRfc822NestingDepth: 3,
      maxPartCount: 600,
      maxForwardedAddresses: 1000
    });
    state.file = file;
    state.email = email;
    renderEmail();
    showToast('EMLを読み込みました');
  } catch (error) {
    console.error('EML parse failed', error?.code || 'EPARSE');
    setStatus(parserMessage(error), String(error?.code || 'EPARSE'));
  } finally {
    setBusy(false);
    el.file_input.value = '';
  }
}

function setBusy(isBusy) {
  el.choose_button.disabled = isBusy;
  el.choose_button.textContent = isBusy ? '読み込み中…' : 'EMLを選ぶ';
  el.drop_zone.setAttribute('aria-busy', String(isBusy));
}

function updateCharacterCount() {
  el.character_count.textContent = `${el.body_editor.value.length.toLocaleString('ja-JP')}文字`;
}

function resetApp() {
  revokeAttachmentUrls();
  state.file = null;
  state.email = null;
  el.body_editor.value = '';
  el.attachment_list.replaceChildren();
  el.result_stage.hidden = true;
  el.upload_stage.hidden = false;
  setStatus();
  el.choose_button.focus();
}

function preparePrint() {
  const view = emailView();
  el.print_subject.textContent = view.subject;
  el.print_from.textContent = view.from;
  el.print_to.textContent = view.to;
  el.print_cc.textContent = view.cc;
  el.print_cc_row.hidden = !view.cc;
  el.print_date.textContent = view.date;
  el.print_body.textContent = view.body;
  document.title = sanitizeFilename(view.subject, 'pdf').replace(/\.pdf$/, '');
}

function openOverlay(overlay, opener) {
  state.modalOpener = opener || document.activeElement;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  window.setTimeout(() => overlay.querySelector('button, a, input, select, textarea')?.focus(), 0);
}

function closeOverlay(overlay) {
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  state.modalOpener?.focus?.();
  state.modalOpener = null;
}

function modalFocusable(overlay) {
  return [...overlay.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter(node => !node.hidden && node.offsetParent !== null);
}

function addTextElement(parent, tag, text, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  parent.append(node);
  return node;
}

function openHowTo(opener) {
  el.modal_title.textContent = 'EMLポストの使い方';
  el.modal_body.replaceChildren();
  HOW_TO_USE.forEach(item => {
    addTextElement(el.modal_body, 'h3', item.heading);
    addTextElement(el.modal_body, 'p', item.text);
  });
  openOverlay(el.info_modal, opener);
}

function openReleaseNotes(opener) {
  el.modal_title.textContent = 'リリースノート';
  el.modal_body.replaceChildren();
  RELEASE_NOTES.forEach(release => {
    const row = document.createElement('section');
    row.className = 'release-row';
    const meta = document.createElement('div');
    meta.className = 'release-meta';
    addTextElement(meta, 'span', release.ver, 'release-tag');
    addTextElement(meta, 'span', release.date, 'release-date');
    const list = document.createElement('ul');
    release.changes.forEach(change => addTextElement(list, 'li', change));
    row.append(meta, list);
    el.modal_body.append(row);
  });
  openOverlay(el.info_modal, opener);
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    showToast(copied ? successMessage : 'コピーできませんでした');
    return copied;
  }
}

el.choose_button.addEventListener('click', () => el.file_input.click());
el.replace_button.addEventListener('click', () => el.file_input.click());
el.file_input.addEventListener('change', event => loadFile(event.target.files?.[0]));
el.body_editor.addEventListener('input', updateCharacterCount);

['dragenter', 'dragover'].forEach(type => el.drop_zone.addEventListener(type, event => {
  event.preventDefault();
  el.drop_zone.classList.add('dragover');
}));
['dragleave', 'drop'].forEach(type => el.drop_zone.addEventListener(type, event => {
  event.preventDefault();
  el.drop_zone.classList.remove('dragover');
}));
el.drop_zone.addEventListener('drop', event => loadFile(event.dataTransfer?.files?.[0]));

el.download_txt.addEventListener('click', () => {
  if (!state.email) return;
  const subject = emailView().subject;
  downloadBlob(new Blob(['\uFEFF', buildPlainText()], { type: 'text/plain;charset=utf-8' }), sanitizeFilename(subject, 'txt'));
  showToast('TXTを保存しました');
});

el.save_pdf.addEventListener('click', () => {
  if (!state.email) return;
  preparePrint();
  window.setTimeout(() => window.print(), 40);
});

window.addEventListener('afterprint', () => {
  document.title = 'EMLポスト — EMLをテキスト・PDFに変換';
});

el.clear_button.addEventListener('click', () => {
  if (confirm('読み込んだメール内容をクリアしますか？')) resetApp();
});

el.manual_button.addEventListener('click', event => openHowTo(event.currentTarget));
el.version_button.addEventListener('click', event => openReleaseNotes(event.currentTarget));
el.modal_x.addEventListener('click', () => closeOverlay(el.info_modal));
el.modal_close.addEventListener('click', () => closeOverlay(el.info_modal));
el.info_modal.addEventListener('mousedown', event => { if (event.target === el.info_modal) closeOverlay(el.info_modal); });

el.feedback_button.addEventListener('click', event => openOverlay(el.feedback_modal, event.currentTarget));
el.feedback_x.addEventListener('click', () => closeOverlay(el.feedback_modal));
el.feedback_close.addEventListener('click', () => closeOverlay(el.feedback_modal));
el.feedback_modal.addEventListener('mousedown', event => { if (event.target === el.feedback_modal) closeOverlay(el.feedback_modal); });
el.feedback_copy.addEventListener('click', async () => {
  const message = el.feedback_message.value.trim();
  if (!message) {
    showToast('内容を入力してください');
    el.feedback_message.focus();
    return;
  }
  const safeUrl = `${location.origin}${location.pathname}`;
  const copied = await copyText(`[${el.feedback_type.value}] ${message}\n\nappId: ${APP_ID}\nversion: ${APP_VERSION}\nurl: ${safeUrl}`, '目安箱の内容をコピーしました');
  if (copied) closeOverlay(el.feedback_modal);
});

el.debug_button.addEventListener('click', () => {
  const debug = [
    `appId: ${APP_ID}`,
    `version: ${APP_VERSION}`,
    `url: ${location.origin}${location.pathname}`,
    `time: ${new Date().toISOString()}`,
    `state: ${state.email ? 'email-loaded' : 'empty'}`,
    `fileSize: ${state.file?.size || 0}`,
    `attachments: ${state.email?.attachments?.length || 0}`,
    `lastErrorCode: ${state.lastErrorCode || 'none'}`,
    `viewport: ${innerWidth}x${innerHeight}`,
    `userAgent: ${navigator.userAgent.replace(/[\r\n]/g, ' ').slice(0, 240)}`
  ].join('\n');
  copyText(debug, '診断情報をコピーしました');
});

document.addEventListener('keydown', event => {
  const modal = document.querySelector('.modal-overlay.open');
  if (event.key === 'Escape' && modal) {
    closeOverlay(modal);
    return;
  }
  if (event.key === 'Tab' && modal) {
    const items = modalFocusable(modal);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

window.addEventListener('beforeunload', revokeAttachmentUrls);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

Object.assign(window, {
  __EML_POST_TEST__: {
    getState: () => ({ loaded: Boolean(state.email), subject: state.email?.subject || '', attachments: state.email?.attachments?.length || 0 }),
    buildPlainText,
    homeUrl: HOME_URL
  }
});
