import { useCallback, useEffect, useRef, useState } from 'react'
import { ref as storageRef, uploadString } from 'firebase/storage'
import { storage } from '../firebase'
import type { AnalyzeResult } from '../types'
import { analyzePhoto, resizeImageToBase64 } from '../lib/api'

export interface AnalysisJob {
  id: string
  shelfId: string
  row: number
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

  const startJob = useCallback((shelfId: string, row: number, file: File) => {
    const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    setJobs((prev) => [...prev, { id, shelfId, row, status: 'processing', startedAt: Date.now() }])
    ;(async () => {
      try {
        const base64 = await resizeImageToBase64(file)
        const path = `hondoko/photos/${shelfId}_${row}_${Date.now()}.jpg`
        // アップロードと解析を並行実行(アップロード失敗は解析結果に影響させない)
        const [result] = await Promise.all([
          analyzePhoto(base64),
          uploadString(storageRef(storage, path), base64, 'base64', { contentType: 'image/jpeg' })
            .catch((e) => console.warn('photo upload failed:', e)),
        ])
        patch(id, { status: 'ready', result, storagePath: path })
      } catch (e) {
        patch(id, { status: 'error', error: e instanceof Error ? e.message : '解析に失敗しました' })
      }
    })()
    return id
  }, [])

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
