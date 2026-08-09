import { useCallback, useEffect, useRef, useState } from 'react'
import { getDownloadURL, ref as storageRef, uploadString } from 'firebase/storage'
import { storage } from '../firebase'
import type { AnalyzeResult, MapMatchPayload, Shelf, ShelfMap } from '../types'
import { analyzePhoto, buildMapPayload, resizeImageToBase64 } from '../lib/api'
import { shelfCode } from '../lib/diff'

export interface AnalysisJob {
  id: string
  // 対象を指定して撮った場合(カメラ+ボタン)。自動判別の場合は null
  target: { shelfId: string; row: number } | null
  status: 'processing' | 'ready' | 'error'
  result?: AnalyzeResult
  storagePath?: string
  error?: string
  startedAt: number
}

// 棚写真の「アップロード+AI解析」をバックグラウンドで実行するジョブ管理。
// モーダルを閉じてもジョブは継続し、完了するとJobBarから確認できる。
export function useAnalysisJobs() {
  const [jobs, setJobs] = useState<AnalysisJob[]>([])

  const patch = (id: string, p: Partial<AnalysisJob>) =>
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...p } : j)))

  // target あり: その段(と、写真に複数段写っていれば続きの段)として解析
  // target なし: mapCtx のマップ写真と照合して自動判別
  const startJob = useCallback(
    (file: File, target: { shelfId: string; row: number } | null, mapCtx?: { map: ShelfMap; shelves: Shelf[] }) => {
      const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      setJobs((prev) => [...prev, { id, target, status: 'processing', startedAt: Date.now() }])
      ;(async () => {
        try {
          const base64 = await resizeImageToBase64(file)
          const pathKey = target ? `${target.shelfId}_${target.row}` : 'auto'
          const path = `hondoko/photos/${pathKey}_${Date.now()}.jpg`

          // マップ照合ペイロード(自動判別時のみ)。失敗しても解析自体は続行
          let mapPayload: MapMatchPayload | undefined
          if (!target && mapCtx && mapCtx.map.regions.length > 0) {
            try {
              const url = await getDownloadURL(storageRef(storage, mapCtx.map.storagePath))
              const regions = mapCtx.map.regions
                .map((r) => {
                  const shelf = mapCtx.shelves.find((s) => s.id === r.shelfId)
                  return shelf ? { label: `${shelfCode(shelf)}-${r.row}`, x: r.x, y: r.y, w: r.w, h: r.h } : null
                })
                .filter((x): x is NonNullable<typeof x> => x !== null)
              mapPayload = await buildMapPayload(url, regions)
            } catch (e) {
              console.warn('map payload build failed:', e)
            }
          }

          // アップロードと解析を並行実行(アップロード失敗は解析結果に影響させない)
          const [result] = await Promise.all([
            analyzePhoto(base64, mapPayload),
            uploadString(storageRef(storage, path), base64, 'base64', { contentType: 'image/jpeg' })
              .catch((e) => console.warn('photo upload failed:', e)),
          ])
          patch(id, { status: 'ready', result, storagePath: path })
        } catch (e) {
          patch(id, { status: 'error', error: e instanceof Error ? e.message : '解析に失敗しました' })
        }
      })()
      return id
    },
    [],
  )

  const dismissJob = useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id))
  }, [])

  // 解析中にページを閉じそうになったら警告
  const processing = jobs.some((j) => j.status === 'processing')
  const processingRef = useRef(processing)
  processingRef.current = processing
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (processingRef.current) e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  return { jobs, startJob, dismissJob }
}
