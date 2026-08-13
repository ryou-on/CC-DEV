import { useRef, useState } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { Barcode, Camera, FileSpreadsheet, PenLine } from 'lucide-react'
import { db } from '../firebase'
import type { Book, BookKind, BookStatus, Shelf } from '../types'
import { lookupIsbn } from '../lib/api'
import { BookForm } from './BookForm'
import { Modal, btnPrimary, btnSecondary, inputCls } from './ui'

// BarcodeDetector は型定義が無い環境があるため any 経由で利用
declare global {
  interface Window { BarcodeDetector?: new (opts?: { formats: string[] }) => { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> } }
}

export function AddView({
  shelves,
  books,
  onStartAppendPhoto,
}: {
  shelves: Shelf[]
  books: Book[]
  onStartAppendPhoto: (file: File) => void
}) {
  const [manualOpen, setManualOpen] = useState(false)
  const [isbnOpen, setIsbnOpen] = useState(false)
  const [csvMsg, setCsvMsg] = useState('')
  const [importing, setImporting] = useState(false)
  const csvInput = useRef<HTMLInputElement>(null)
  const appendInput = useRef<HTMLInputElement>(null)

  const exportCsv = () => {
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
    const shelfName = (b: Book) => shelves.find((s) => s.id === b.shelfId)?.name ?? ''
    const header = 'title,author,publisher,volume,isbn,kind,tags,shelf,row,status,memo'
    const lines = books.map((b) =>
      [b.title, b.author, b.publisher, b.volume, b.isbn, b.kind, b.tags.join('|'), shelfName(b), b.row ?? '', b.status, b.memo]
        .map((v) => esc(String(v))).join(',')
    )
    const blob = new Blob(['﻿' + [header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `hondoko_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importCsv = async (file: File) => {
    setImporting(true)
    setCsvMsg('')
    try {
      const text = await file.text()
      const rows = parseCsv(text)
      if (rows.length < 2) throw new Error('データ行がありません')
      const header = rows[0].map((h) => h.trim().toLowerCase())
      const idx = (name: string) => header.indexOf(name)
      if (idx('title') === -1) throw new Error('title 列が必要です')
      let count = 0
      for (const r of rows.slice(1)) {
        const get = (name: string) => (idx(name) >= 0 ? (r[idx(name)] ?? '').trim() : '')
        const title = get('title')
        if (!title) continue
        const shelfName = get('shelf')
        const shelf = shelves.find((s) => s.name === shelfName)
        const rowNum = parseInt(get('row'), 10)
        const statusRaw = get('status')
        const status: BookStatus = statusRaw === 'sold' ? 'sold' : shelf && rowNum ? 'owned' : 'unplaced'
        const kindRaw = get('kind')
        const kind: BookKind = ['book', 'comic', 'magazine', 'other'].includes(kindRaw) ? (kindRaw as BookKind) : 'book'
        await addDoc(collection(db, 'hondoko-books'), {
          title,
          author: get('author'),
          publisher: get('publisher'),
          volume: get('volume'),
          isbn: get('isbn'),
          kind,
          tags: get('tags').split(/[|;]/).map((t) => t.trim()).filter(Boolean),
          memo: get('memo'),
          status,
          shelfId: status === 'owned' ? shelf!.id : null,
          row: status === 'owned' ? rowNum : null,
          position: 999,
          confidence: 'high',
          source: 'csv',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        count++
      }
      setCsvMsg(`${count}冊をインポートしました`)
    } catch (e) {
      setCsvMsg('エラー: ' + (e instanceof Error ? e.message : String(e)))
    }
    setImporting(false)
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-500">
        棚写真からの一括登録は「マップ」タブ → 棚の段 → 「写真で更新」から。ここでは1冊ずつ・CSVで登録できます。
      </p>

      <button
        className="w-full bg-white rounded-xl border border-amber-300 p-4 text-left hover:bg-amber-50/50 flex items-center gap-3"
        onClick={() => appendInput.current?.click()}
      >
        <Camera size={22} className="text-amber-700 shrink-0" />
        <div>
          <p className="font-bold text-sm text-stone-800">本の写真から追加(AI)</p>
          <p className="text-xs text-stone-400">
            買い足した本を撮影(表紙/背表紙、複数冊OK)→ AIが書誌を抽出 → 棚・段を選んで追記。既存の本には影響しません
          </p>
        </div>
      </button>
      <input
        ref={appendInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onStartAppendPhoto(f)
          e.target.value = ''
        }}
      />

      <button
        className="w-full bg-white rounded-xl border border-stone-200 p-4 text-left hover:bg-amber-50/50 flex items-center gap-3"
        onClick={() => setIsbnOpen(true)}
      >
        <Barcode size={22} className="text-amber-700 shrink-0" />
        <div>
          <p className="font-bold text-sm text-stone-800">ISBNバーコードで登録</p>
          <p className="text-xs text-stone-400">カメラでスキャン or 番号入力 → openBD/Google Booksから書誌取得</p>
        </div>
      </button>

      <button
        className="w-full bg-white rounded-xl border border-stone-200 p-4 text-left hover:bg-amber-50/50 flex items-center gap-3"
        onClick={() => setManualOpen(true)}
      >
        <PenLine size={22} className="text-amber-700 shrink-0" />
        <div>
          <p className="font-bold text-sm text-stone-800">手動で登録</p>
          <p className="text-xs text-stone-400">タイトル・著者などを直接入力</p>
        </div>
      </button>

      <div className="w-full bg-white rounded-xl border border-stone-200 p-4 flex items-center gap-3">
        <FileSpreadsheet size={22} className="text-amber-700 shrink-0" />
        <div className="flex-1">
          <p className="font-bold text-sm text-stone-800">CSVインポート / エクスポート</p>
          <p className="text-xs text-stone-400">列: title,author,publisher,volume,isbn,kind,tags,shelf,row,status,memo</p>
          {csvMsg && <p className="text-xs mt-1 text-amber-700">{csvMsg}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <button className={btnSecondary + ' !px-3 !py-1.5 text-xs'} onClick={() => csvInput.current?.click()} disabled={importing}>
            {importing ? '取込中…' : 'インポート'}
          </button>
          <button className={btnSecondary + ' !px-3 !py-1.5 text-xs'} onClick={exportCsv}>エクスポート</button>
        </div>
        <input ref={csvInput} type="file" accept=".csv,text/csv" className="hidden"
          onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
      </div>

      {manualOpen && <BookForm book={null} shelves={shelves} onClose={() => setManualOpen(false)} />}
      {isbnOpen && <IsbnModal shelves={shelves} onClose={() => setIsbnOpen(false)} />}
    </div>
  )
}

function IsbnModal({ shelves, onClose }: { shelves: Shelf[]; onClose: () => void }) {
  const [isbn, setIsbn] = useState('')
  const [scanning, setScanning] = useState(false)
  const [looking, setLooking] = useState(false)
  const [error, setError] = useState('')
  const [formInitial, setFormInitial] = useState<Partial<Book> | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanTimer = useRef<number | undefined>(undefined)

  const stopScan = () => {
    if (scanTimer.current) window.clearInterval(scanTimer.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setScanning(false)
  }

  const startScan = async () => {
    if (!window.BarcodeDetector) {
      setError('このブラウザはバーコード検出に未対応です。番号を直接入力してください')
      return
    }
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      setScanning(true)
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
        }
      })
      const detector = new window.BarcodeDetector({ formats: ['ean_13'] })
      scanTimer.current = window.setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return
        try {
          const codes = await detector.detect(videoRef.current)
          const hit = codes.find((c) => /^97[89]\d{10}$/.test(c.rawValue))
          if (hit) {
            stopScan()
            setIsbn(hit.rawValue)
            lookup(hit.rawValue)
          }
        } catch { /* フレーム未準備など */ }
      }, 400)
    } catch {
      setError('カメラを起動できませんでした')
    }
  }

  const lookup = async (code?: string) => {
    const target = (code ?? isbn).replace(/[^0-9Xx]/g, '')
    if (!target) return
    setLooking(true)
    setError('')
    const info = await lookupIsbn(target)
    setLooking(false)
    if (!info) {
      setError('書誌情報が見つかりませんでした。手動で入力してください')
      setFormInitial({ isbn: target, source: 'isbn' })
      return
    }
    setFormInitial({ title: info.title, author: info.author, publisher: info.publisher, isbn: target, source: 'isbn' })
  }

  if (formInitial) {
    return (
      <BookForm
        book={null}
        shelves={shelves}
        initial={formInitial}
        onClose={() => { setFormInitial(null); onClose() }}
      />
    )
  }

  return (
    <Modal title="ISBNで登録" onClose={() => { stopScan(); onClose() }}>
      <div className="space-y-3">
        {scanning ? (
          <div className="space-y-2">
            <video ref={videoRef} className="w-full rounded-lg bg-black aspect-video" muted playsInline />
            <p className="text-xs text-center text-stone-500">裏表紙のバーコード(978〜)を写してください</p>
            <button className={btnSecondary + ' w-full'} onClick={stopScan}>スキャンを止める</button>
          </div>
        ) : (
          <button className={btnPrimary + ' w-full inline-flex items-center justify-center gap-2'} onClick={startScan}>
            <Barcode size={18} /> カメラでスキャン
          </button>
        )}
        <div className="flex gap-2">
          <input
            className={inputCls}
            placeholder="9784XXXXXXXXX"
            value={isbn}
            inputMode="numeric"
            onChange={(e) => setIsbn(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && lookup()}
          />
          <button className={btnSecondary} onClick={() => lookup()} disabled={looking}>
            {looking ? '検索中…' : '検索'}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  )
}

// 簡易CSVパーサ(ダブルクォート対応)
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++ } else inQuotes = false
      } else cur += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(cur); cur = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cur); cur = ''
      if (row.some((v) => v !== '')) rows.push(row)
      row = []
    } else cur += c
  }
  row.push(cur)
  if (row.some((v) => v !== '')) rows.push(row)
  // BOM除去
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^﻿/, '')
  return rows
}
