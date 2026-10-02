// Normalize visible Zoom labels; keep group prefixes and synthetic IDs.
export function participantName(value = '') {
 let name = value.normalize('NFKC').trim()
  .replace(/\.(m4a|mp3|wav|mp4|webm|ogg|flac|srt|vtt|txt|png|jpe?g|webp)$/i, '')
  .replace(/^audio\s*/i, '').replace(/\s+/g, '');
 // A-01 and similar explicit IDs are not recording-number suffixes.
 if (!/^[A-Za-z]+[-_]?\d+$/.test(name)) name = name.replace(/\d+$/, '');
 return name || value.trim();
}
export const normalizeParticipants = records => records.map(r => ({...r, speaker: participantName(r.speaker)}));
