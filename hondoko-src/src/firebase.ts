import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

// authDomain は配信元と same-origin にすること(iOS Safari の ITP 対策)
// GCP の OAuth クライアントに https://cc-dev-ps7.web.app/__/auth/handler を登録済み
const firebaseConfig = {
  apiKey: 'AIzaSyDPlsAhtxbJBihy-EAHck9P7XbuMdzV0ds',
  authDomain: 'cc-dev-ps7.web.app',
  projectId: 'cc-dev-ps7',
  storageBucket: 'cc-dev-ps7.firebasestorage.app',
  messagingSenderId: '1029579090333',
  appId: '1:1029579090333:web:799b0a2df9d37cd87f2774',
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
export const db = getFirestore(app)
export const storage = getStorage(app)

export const OWNER_EMAIL = 'junpei.omote@gmail.com'
// Hosting rewrite (/api/...) は60秒でタイムアウトするため、解析は関数URLを直接叩く(関数側は300秒)
export const ANALYZE_ENDPOINT = 'https://asia-northeast1-cc-dev-ps7.cloudfunctions.net/hondokoAnalyze'
