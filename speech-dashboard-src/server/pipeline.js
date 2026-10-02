import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { activeIntervals, makeUtterances, assignText } from './domain.js';
import { transcribe, classify } from './providers.js';
const exec = promisify(execFile);
const run = (name, args) => exec(name, args, { timeout: 600000, maxBuffer: 32 * 1024 * 1024 });
export async function processAudio(file, meta, directory, providers = { transcribe, classify }, progress = () => {}, budgetMs = 600000) {
  progress('録音の長さを確認中');
  const probe = await run('ffprobe', ['-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,mp3,wav,matroska,webm,ogg,flac', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file]);
  const duration = Number(JSON.parse(probe.stdout).format.duration);
  const end = meta.end === '' ? duration : meta.end;
  if (!Number.isFinite(duration) || meta.start >= duration || end > duration + 0.05 || end <= meta.start || end - meta.start > 43200.05) throw new Error('INVALID_DURATION');
  progress('全区間の音声を変換中');
  const normalized = join(directory, 'normalized.wav');
  await run('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,mp3,wav,matroska,webm,ogg,flac', '-i', file, '-ss', String(meta.start), '-t', String(end - meta.start), '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', normalized]);
  progress('全区間の発話量を計測中');
  const silence = await run('ffmpeg', ['-nostdin', '-i', normalized, '-af', 'silencedetect=noise=-35dB:d=0.35', '-f', 'null', '-']);
  const shift = meta.start + meta.offset;
  const utterances = makeUtterances(activeIntervals(silence.stderr, end - meta.start), shift);
  if (utterances.length > 50000) throw new Error('TOO_MANY_UTTERANCES');
  if (meta.analysisMode !== 'full') return { ...meta, analysisMode: 'volume', duration, end, utterances, warnings: [], status: 'complete', source: 'audio', measurement: 'ffmpeg-silencedetect-v1', transcriptionModel: null };
  const warnings = [], segments = [];
  // One shared budget bounds synchronous processing even when a provider stalls repeatedly.
  const deadline = Date.now() + budgetMs;
  if (utterances.length) {
    try {
      for (let start = 0; start < end - meta.start; start += 300) {
        if (Date.now() >= deadline) { warnings.push('ANALYSIS_TIME_LIMIT'); break; }
        progress(`文字起こし ${Math.floor(start/300)+1}/${Math.ceil((end-meta.start)/300)}区間`);
        const path = join(directory, `chunk-${start}.wav`);
        await run('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-ss', String(start), '-i', normalized, '-t', '300', '-c:a', 'pcm_s16le', path]);
        const part = await providers.transcribe(path);
        segments.push(...part.map(s => ({ ...s, start: s.start + start, end: s.end + start })));
      }
    } catch { warnings.push('TRANSCRIPTION_UNAVAILABLE'); }
    assignText(utterances, segments, shift);
    let failed = false;
    for (const u of utterances) {
      if (!u.text || failed || Date.now() >= deadline) continue;
      progress(`内容分析 ${utterances.indexOf(u)+1}/${utterances.length}発言`);
      try { u.analysis = await providers.classify(u.text); }
      catch { failed = true; warnings.push('CLASSIFICATION_UNAVAILABLE'); }
    }
    if (utterances.some(u => !u.text || !u.analysis)) warnings.push('ANALYSIS_INCOMPLETE');
  }
  return { ...meta, duration, end, utterances, warnings: [...new Set(warnings)], status: warnings.length ? 'partial' : 'complete', source: 'audio', measurement: 'ffmpeg-silencedetect-v1', transcriptionModel: 'whisper-1' };
}
