'use client'

/**
 * AuctionCountdown — นับถอยหลังเวลาเหลือของ auction ที่กำลังประมูล (status='live')
 *
 * ใช้ร่วมกันหลายหน้า (list `/seller/auctions` วันนี้ Batch D#9 + detail `/seller/auctions/[id]`
 * ในอนาคต) จึงวางไว้ `_shared/` ระดับ dashboard (เหมือน SellerEmptyState/SellerCardSkeleton)
 * ไม่ใช่ใต้ `auctions/_shared/`
 *
 * - setInterval(1000) นับถอยหลัง HH:MM:SS, `tabular-nums` (ห้าม font-mono — Anuphan ไม่มี glyph
 *   mono → fallback Courier ผิดธีม, บทเรียน feedback_font_mono_breaks_anuphan)
 * - `text-danger` เมื่อเหลือ < 1 ชั่วโมง
 * - เมื่อนับถึง 0 → `router.refresh()` ครั้งเดียว แล้ว poll ทุก 5s จนกว่า settle cron จะเปลี่ยน
 *   status จริง (UI-DESIGN-SPEC OQ5 — settle cron อาจมี lag ไม่ตรงเป๊ะกับ endTime)
 *
 * Base: pure client logic (setInterval) — ไม่มี arbitrary CSS ใหม่ (UI-DESIGN-SPEC "Arbitrary" note)
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/utils/helpers'

type Props = {
  /** epoch ms ของเวลาปิดประมูล (Auction.endTime) */
  endTimeMs: number
  className?: string
}

function formatRemain(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

export default function AuctionCountdown({ endTimeMs, className }: Props) {
  const router = useRouter()
  const [now, setNow] = useState<number>(() => Date.now())

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  const remainMs = endTimeMs - now
  const isUnderHour = remainMs > 0 && remainMs < 60 * 60 * 1000
  const isDone = remainMs <= 0

  // countdown=0 → refresh ทันที + poll 5s (รอ settle cron เปลี่ยน status จริง)
  useEffect(() => {
    if (!isDone) return
    router.refresh()
    const poll = setInterval(() => router.refresh(), 5000)
    return () => clearInterval(poll)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ต้องการรันแค่ตอน isDone เปลี่ยนเป็น true
  }, [isDone])

  return (
    <span className={cn('tabular-nums', isUnderHour && 'font-semibold text-danger', className)}>
      {formatRemain(remainMs)}
    </span>
  )
}
