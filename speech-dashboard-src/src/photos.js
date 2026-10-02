export const PHOTO_PREFIX = 'speech-dashboard.photos.v1.';
const isPhoto = value => typeof value === 'string' && value.length <= 60000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value);
export function readPhotos(namespace) {
  try {
    const raw = JSON.parse(localStorage.getItem(PHOTO_PREFIX + namespace) || '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).filter(([name, value]) => name.length > 0 && name.length <= 80 && isPhoto(value)).slice(0, 100));
  } catch { return {}; }
}
export function writePhoto(namespace, current, name, photo) {
  if (!name || name.length > 80 || (photo !== null && !isPhoto(photo))) throw new Error('INVALID_PHOTO');
  const next = Object.fromEntries(Object.entries(current).filter(([key]) => key !== name));
  if (photo !== null) Object.defineProperty(next, name, { value: photo, enumerable: true, configurable: true, writable: true });
  if (Object.keys(next).length > 100) throw new Error('PHOTO_LIMIT');
  localStorage.setItem(PHOTO_PREFIX + namespace, JSON.stringify(next));
  return next;
}
export function cropBounds(width, height, x, y, size) {
  const side = Math.max(1, Math.min(width, height) * size / 100);
  return { x: Math.max(0, Math.min(width - side, width * x / 100 - side / 2)), y: Math.max(0, Math.min(height - side, height * y / 100 - side / 2)), side };
}

export function writePhotos(namespace, current, rows) {
  const next = { ...current }, names = new Set();
  for (const { name, photo } of rows) {
    if (!name || name.length > 80 || !isPhoto(photo) || names.has(name)) throw new Error('INVALID_PHOTOS');
    names.add(name); Object.defineProperty(next, name, { value: photo, enumerable: true, configurable: true, writable: true });
  }
  if (Object.keys(next).length > 100) throw new Error('PHOTO_LIMIT');
  localStorage.setItem(PHOTO_PREFIX + namespace, JSON.stringify(next));
  return next;
}
