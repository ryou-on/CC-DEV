export function selectRecordings(recordings, { day = 'all', room = 'all' } = {}) {
  return recordings.filter(r => (day === 'all' || r.day === day) && (room === 'all' || r.room === room));
}
export function summarize(recordings, axis = 'speaker') {
  const groups = new Map();
  for (const r of recordings) {
    const key = r[axis];
    const group = groups.get(key) || { name: key, seconds: 0, count: 0 };
    for (const u of r.utterances) { group.seconds += u.speechSeconds; group.count++; }
    groups.set(key, group);
  }
  const total = [...groups.values()].reduce((sum, g) => sum + g.seconds, 0);
  return [...groups.values()].map(g => ({ ...g, share: total ? g.seconds / total * 100 : 0, average: g.count ? g.seconds / g.count : 0 })).sort((a, b) => axis === 'day' ? a.name.localeCompare(b.name, undefined, { numeric: true }) : b.seconds - a.seconds);
}
export function totals(recordings) {
  const rows = summarize(recordings);
  const seconds = rows.reduce((n, r) => n + r.seconds, 0), count = rows.reduce((n, r) => n + r.count, 0);
  return { seconds, count, average: count ? seconds / count : 0, people: rows.length };
}
export const time = n => { const s = Math.round(Math.max(0, n)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export function timelineGroups(recordings) {
  const groups = new Map();
  for (const r of recordings) {
    const key = JSON.stringify([r.day, r.session, r.room]);
    if (!groups.has(key)) groups.set(key, { key, label: `${r.day} / ${r.session} / ${r.room}`, recordings: [] });
    groups.get(key).recordings.push(r);
  }
  return [...groups.values()];
}
