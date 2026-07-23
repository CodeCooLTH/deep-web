'use client'

/**
 * AiSuggestPanel — แผง "AI ช่วยร่างคำตอบ" เหนือช่องพิมพ์ (feature 00018 composer improvement #3)
 *
 * เปิดแล้วดึงคำแนะนำทันที (POST .../ai-suggest — Gemini อ่านบทสนทนาล่าสุดฝั่ง server) แสดง 3 ร่าง
 * คลิกร่าง → เติมลง composer (parent). ปุ่มรีเฟรช = ขอชุดใหม่, ปุ่มปิด = ซ่อนแผง.
 *
 * accent เขียว (success token) ตาม reference ผู้ใช้ (Hard Rule 6 — asset/สีตาม ref) — ไม่ hardcode hex
 * ใช้ text-success/bg-success token. Paces primitive เท่านั้น (HR7). Base: theme/paces card + list rows.
 *
 * layout (user สั่ง 2026-07-23): "ไม่อยากให้เป็น panel ลอย ๆ ไม่มี shadow ไม่ให้ดูเป็น popover"
 * เดิมเป็น `absolute bottom-full ... rounded-lg border shadow-lg` = การ์ดลอยทับพื้นที่ข้อความ
 * ตอนนี้เป็น **แถบในสายเลย์เอาต์** (in-flow) ของ composer: full-bleed ด้วย -mx/-mt ลบ padding ของ
 * composer ออกแล้วใส่กลับเอง → เต็มความกว้างชนขอบการ์ด, ไม่มี shadow/z-index/rounded, คั่นด้วย
 * เส้นประ border-dashed ชุดเดียวกับที่การ์ดนี้ใช้อยู่ (border-default-300) พื้น bg-success/5 บาง ๆ
 * พอให้รู้ว่าเป็นโซน AI. ผลพลอยได้: ไม่บังข้อความอีกต่อไป (ดันเนื้อหาขึ้นแทนการทับ)
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
    <div className="border-default-300 bg-success/5 -mx-4 -mt-3 mb-3 border-b border-dashed px-4 py-2 sm:-mx-6 sm:-mt-3.75 sm:px-6">
      {/* header — ไม่มีเส้นคั่นในตัวแล้ว (แถบทั้งก้อนถูกคั่นจาก composer ด้วยเส้นประด้านล่างพอ) */}
      <div className="flex items-center justify-between pb-1.5">
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

      {/* body — max-h กันร่างยาว ๆ 3 อันดันช่องข้อความหายไปทั้งจอ (แถบนี้อยู่ในสายเลย์เอาต์แล้ว
          ความสูงของมันกินพื้นที่เธรดจริง ต่างจากตอนเป็น popover ลอย) */}
      <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
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
              className="bg-card border-default-200 hover:border-success rounded-lg border px-3 py-2.5 text-left text-sm text-default-800 transition-colors"
            >
              {s}
            </button>
          ))
        )}
      </div>

      {/* footer disclaimer — ไม่มีเส้นคั่นในตัว (ดูเหตุผลที่ header) */}
      <div className="text-default-400 pt-1.5 text-2xs">
        AI สร้างคำแนะนำ — ตรวจทานก่อนส่งทุกครั้ง
      </div>
    </div>
  )
}
