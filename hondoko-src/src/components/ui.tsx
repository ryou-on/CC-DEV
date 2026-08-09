import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className={`bg-white w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} max-h-[92dvh] sm:max-h-[85dvh] rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200 shrink-0">
          <h2 className="font-bold text-stone-800 text-base truncate">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-stone-100 text-stone-500">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  )
}

export function Tag({ label, onClick, active }: { label: string; onClick?: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border transition-colors ${
        active
          ? 'bg-amber-700 text-white border-amber-700'
          : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
      } ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      #{label}
    </button>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-stone-500">
      <div className="w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full animate-spin" />
      {label && <p className="text-sm whitespace-pre-line text-center">{label}</p>}
    </div>
  )
}

export const inputCls =
  'w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white'
export const btnPrimary =
  'bg-amber-700 hover:bg-amber-800 text-white font-medium rounded-lg px-4 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
export const btnSecondary =
  'bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 font-medium rounded-lg px-4 py-2 text-sm disabled:opacity-40 transition-colors'
