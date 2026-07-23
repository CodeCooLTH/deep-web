'use client'

/**
 * AiSuggestPanel — แผง "AI ช่วยร่างคำตอบ" เหนือช่องพิมพ์ (feature 00018 composer improvement #3)
 *
 * เปิดแล้วดึงคำแนะนำทันที (POST .../ai-suggest — Gemini อ่านบทสนทนาล่าสุดฝั่ง server) แสดง 3 ร่าง
 * คลิกร่าง → เติมลง composer (parent). ปุ่มรีเฟรช = ขอชุดใหม่, ปุ่มปิด = ซ่อนแผง.
 *
 * accent เขียว (success token) ตาม reference ผู้ใช้ (Hard Rule 6 — asset/สีตาม ref) — ไม่ hardcode hex
 * ใช้ text-success/bg-success token. Paces primitive เท่านั้น (HR7). Base: theme/paces card + list rows.
 */
import { useCallback, useEffect, useState } from 'react'
import Icon from '@/components/wrappers/Icon'

type Props = {
  conversationId: string
  onPick: (text: string) => void
  onClose: () => void
}

export default function AiSuggestPanel({ conversationId, onPick, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])

  const fetchSuggestions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}/ai-suggest`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? 'ขอคำแนะนำไม่สำเร็จ ลองใหม่อีกครั้ง')
        setSuggestions([])
        return
      }
      setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : [])
    } catch {
      setError('ขอคำแนะนำไม่สำเร็จ ลองใหม่อีกครั้ง')
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [conversationId])

  useEffect(() => {
    fetchSuggestions()
  }, [fetchSuggestions])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="bg-card border-success/30 absolute bottom-full left-0 right-0 z-20 mb-2 rounded-lg border shadow-lg">
      {/* header */}
      <div className="border-success/20 flex items-center justify-between border-b px-4 py-2.5">
        <span className="text-success flex items-center gap-2 text-sm font-semibold">
          <Icon icon="sparkles" className="text-base" />
          AI ช่วยร่างคำตอบ
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={fetchSuggestions}
            disabled={loading}
            className="text-default-500 hover:text-success flex size-7 items-center justify-center rounded"
            aria-label="ขอคำแนะนำใหม่"
            title="ขอคำแนะนำใหม่"
          >
            <Icon icon="refresh" className={`text-base ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-default-500 hover:text-default-800 flex size-7 items-center justify-center rounded"
            aria-label="ปิด"
          >
            <Icon icon="x" className="text-base" />
          </button>
        </div>
      </div>

      {/* body */}
      <div className="flex flex-col gap-2 p-3">
        {loading ? (
          <>
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-default-100 h-11 animate-pulse rounded-lg" />
            ))}
          </>
        ) : error ? (
          <div className="text-default-500 flex flex-col items-center gap-2 py-4 text-center text-sm">
            <Icon icon="alert-circle" className="text-warning text-2xl" />
            <span>{error}</span>
            <button type="button" onClick={fetchSuggestions} className="btn btn-sm border-default-300">
              <Icon icon="refresh" className="me-1" /> ลองใหม่
            </button>
          </div>
        ) : (
          suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onPick(s)}
              className="border-default-200 hover:border-success hover:bg-success/5 rounded-lg border px-3 py-2.5 text-left text-sm text-default-800 transition-colors"
            >
              {s}
            </button>
          ))
        )}
      </div>

      {/* footer disclaimer */}
      <div className="border-default-200 text-default-400 border-t px-4 py-2 text-2xs">
        AI สร้างคำแนะนำ — ตรวจทานก่อนส่งทุกครั้ง
      </div>
    </div>
  )
}
