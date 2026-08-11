import { getDownloadURL, ref as storageRef } from 'firebase/storage'
import { storage } from '../firebase'

// StorageパスのダウンロードURLをセッション内でキャッシュする
const cache = new Map<string, Promise<string>>()

export function getPhotoUrl(path: string): Promise<string> {
  let p = cache.get(path)
  if (!p) {
    p = getDownloadURL(storageRef(storage, path))
    cache.set(path, p)
    p.catch(() => cache.delete(path))
  }
  return p
}
