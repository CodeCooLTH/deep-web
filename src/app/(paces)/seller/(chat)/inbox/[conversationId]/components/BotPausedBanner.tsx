'use client'

/**
 * แบนเนอร์ "บอทถูกพักอยู่" + ปุ่มให้กลับมาทำงาน (feature 00023)
 *
 * user 2026-08-01: "ui ในการ take over ไม่ขึ้นให้เห็นหรอ" — กลไกพักบอทเมื่อพนักงานพิมพ์เอง
 * ทำงานมาตั้งแต่แรกและ API ปลดพักก็มี แต่ไม่เคยมีอะไรบอกบนหน้าจอเลย ร้านจึงเห็นแค่ว่า
 * "บอทไม่ตอบ" โดยไม่มีทางรู้สาเหตุ — ต้องไล่ดูฐานข้อมูลถึงจะเจอ (เกิดขึ้นจริงวันนี้)
 *
 * Base: ChatThread.tsx แบนเนอร์ 24h window (โครง div + Icon + span + ปุ่มขวา, token เดียวกัน)
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'

type Props = {
  conversationId: string
  /** ISO — บอทถูกพักถึงเมื่อไร (null = ไม่ได้พักด้วยเหตุนี้) */
  pausedUntil: string | null
  /** ISO — ส่งต่อให้คนดูแลแล้ว หยุดไม่มีกำหนดจนกว่าจะสั่งคืน */
  handoffAt: string | null
  handoffReason: string | null
}

/** เหตุผลที่ระบบบันทึกไว้ แปลเป็นสิ่งที่ร้านอ่านแล้วรู้ว่าต้องทำอะไรต่อ */
const HANDOFF_LABEL: Record<string, string> = {
  HUMAN_TAKEOVER: 'คุณเข้ามาตอบเอง',
  HUMAN_TAKEOVER_UNTIL_RESOLVED: 'คุณเข้ามาตอบเอง',
  MAX_REPLIES_REACHED: 'บอทตอบครบจำนวนสูงสุดต่อห้องแล้ว',
}

export default function BotPausedBanner({ conversationId, pausedUntil, handoffAt, handoffReason }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const pausedMs = pausedUntil ? new Date(pausedUntil).getTime() - Date.now() : 0
  const isPaused = pausedMs > 0
  const isHandedOff = Boolean(handoffAt)
  if (!isPaused && !isHandedOff) return null

  // เหลือกี่นาที — ปัดขึ้นเพราะ "อีก 0 นาที" อ่านแล้วเหมือนพร้อมแล้วทั้งที่ยังไม่ถึงเวลา
  const minsLeft = Math.ceil(pausedMs / 60_000)
  const until = pausedUntil
    ? new Intl.DateTimeFormat('th-TH', {
        timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date(pausedUntil))
    : null

  async function resume() {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}/auto-reply`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // ส่งทั้งสองอย่างเสมอ: ห้องหนึ่งอาจติดทั้งพักชั่วคราวและส่งต่อคนพร้อมกัน
        // ปลดทีละอย่างแปลว่าผู้ใช้กดปุ่มแล้วบอทยังเงียบ ซึ่งอ่านไม่ต่างจากปุ่มพัง
        body: JSON.stringify({ clearPause: true, clearHandoff: true }),
      })
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(b?.error ?? 'ให้บอทกลับมาทำงานไม่สำเร็จ')
      }
      pacesToast.success('บอทกลับมาตอบห้องนี้แล้ว')
      router.refresh()
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'ให้บอทกลับมาทำงานไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  // ระยะห่างรอบแบนเนอร์อยู่ "ในตัวคอมโพเนนต์" ไม่ใช่ที่ caller (user report 2026-08-02:
  // เจอ div ว่างสูง 16px คั่นอยู่เหนือแบนเนอร์อื่น) — เดิม ChatThread ห่อ <div className="px-4 pt-4">
  // ไว้ข้างนอกโดยใช้เงื่อนไข (pausedUntil || handoffAt) ซึ่ง "ไม่ตรง" กับเงื่อนไขที่คอมโพเนนต์นี้
  // ใช้ตัดสินว่าจะแสดงไหม (pausedUntil ที่หมดเวลาแล้ว = ยังไม่ null แต่ไม่ต้องแสดง) พอ return null
  // ปลอกที่มี padding จึงค้างเป็นช่องว่างเปล่า. รวมการตัดสินใจไว้ที่เดียวแล้วบั๊กแบบนี้เกิดซ้ำไม่ได้
  return (
    <div className="px-4 pt-4">
    <div className="bg-warning/15 text-warning flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
      <Icon icon="robot-off" className="mt-0.5 shrink-0 text-lg" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        {isHandedOff ? (
          <>
            บอทหยุดตอบห้องนี้แล้ว — {HANDOFF_LABEL[handoffReason ?? ''] ?? 'ห้องนี้ถูกส่งต่อให้คนดูแล'}
            <span className="block text-xs">จะไม่กลับมาเองจนกว่าคุณจะสั่ง</span>
          </>
        ) : (
          <>
            บอทพักตอบห้องนี้อยู่ เพราะคุณเข้ามาตอบเอง
            <span className="block text-xs">
              กลับมาเองตอน {until} น. (อีก {minsLeft.toLocaleString('th-TH')} นาที)
            </span>
          </>
        )}
      </span>
      <button
        type="button"
        onClick={resume}
        disabled={busy}
        className="btn btn-sm bg-card text-default-700 min-h-11 shrink-0 sm:min-h-0"
      >
        ให้บอทตอบต่อ
      </button>
    </div>
    </div>
  )
}
