'use client'

/**
 * 🧪 PROTOTYPE — แถบสลับแบบ โยนทิ้งพร้อมกับ CommentThreadVariants
 *
 * ⚠️ **เบี่ยงจากคำแนะนำของ skill โดยตั้งใจ 1 ข้อ:** skill บอกให้ซ่อนแถบนี้ด้วย
 * `NODE_ENV !== 'production'` แต่ทีมนี้ทดสอบบน prod เป็นหลัก (ไม่มี staging และ user ตรวจงาน
 * บนเครื่องจริงเสมอ) ⇒ ถ้าซ่อนตาม NODE_ENV จะไม่มีใครได้เห็น prototype เลย
 *
 * ใช้เกณฑ์ที่ให้ผลเหมือนกันแทน: **แถบจะโผล่ก็ต่อเมื่อมี `?variant=` ใน URL อยู่แล้ว**
 * ⇒ ผู้ใช้ทั่วไปที่ไม่เคยพิมพ์พารามิเตอร์นี้จะไม่มีวันเห็น แม้ prototype หลุด merge ขึ้น main
 * (opt-in ล้วน ไม่มีทางโผล่เอง)
 */

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useEffect } from 'react'
import Icon from '@/components/wrappers/Icon'
import { VARIANT_NAMES } from './CommentThreadVariants'

const KEYS = Object.keys(VARIANT_NAMES)

export default function PrototypeSwitcher() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const current = params.get('variant')

  const go = (next: string) => {
    const p = new URLSearchParams(params.toString())
    p.set('variant', next)
    router.replace(`${pathname}?${p.toString()}`, { scroll: false })
  }

  useEffect(() => {
    if (!current) return
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      if (typing) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const i = KEYS.indexOf(current ?? '')
      const at = i === -1 ? 0 : i
      const next = e.key === 'ArrowRight' ? KEYS[(at + 1) % KEYS.length] : KEYS[(at - 1 + KEYS.length) % KEYS.length]
      go(next)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  if (!current) return null
  const i = Math.max(0, KEYS.indexOf(current))

  return (
    <div className="fixed bottom-4 left-1/2 z-90 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/85 px-2 py-1.5 text-white shadow-lg">
      <button
        type="button"
        aria-label="ก่อนหน้า"
        onClick={() => go(KEYS[(i - 1 + KEYS.length) % KEYS.length])}
        className="flex size-7 items-center justify-center rounded-full hover:bg-white/15"
      >
        <Icon icon="chevron-left" width={16} height={16} />
      </button>
      <span className="text-2xs px-1 whitespace-nowrap">
        <span className="font-bold">{KEYS[i]}</span> — {VARIANT_NAMES[KEYS[i]]}
      </span>
      <button
        type="button"
        aria-label="ถัดไป"
        onClick={() => go(KEYS[(i + 1) % KEYS.length])}
        className="flex size-7 items-center justify-center rounded-full hover:bg-white/15"
      >
        <Icon icon="chevron-right" width={16} height={16} />
      </button>
    </div>
  )
}
