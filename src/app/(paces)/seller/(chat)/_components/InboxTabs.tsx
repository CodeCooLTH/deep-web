'use client'

/**
 * InboxTabs — สลับระหว่าง "ข้อความ" กับ "ความคิดเห็น" ในกล่องข้อความ (feature 00029)
 *
 * user สั่ง 2026-08-03 พร้อมภาพ Meta Business Suite: แท็บอยู่เหนือรายการ ไม่ใช่เมนูซ้ายแยก
 * — คนทำงานอยู่ในกล่องเดียว สลับดูว่าใครทักมา/ใครคอมเมนต์มา โดยไม่เปลี่ยนหน้า
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/chat — ชุด nav-link/nav-tabs ของ Paces
 * (โปรเจกต์ใช้ pattern เดียวกันนี้ที่ ChatbotTabs.tsx ของ settings/chatbot) ใช้ token ล้วน
 * ไม่มี arbitrary value
 *
 * badge "ยังไม่ตอบ" (user สั่ง 2026-08-04): เดิมตัวเลขมาทาง prop จาก RSC ของหน้า /inbox/comments
 * เท่านั้น → ตอนอยู่แท็บ "ข้อความ" เลยไม่เห็นเลย ต้องกดเข้าไปถึงจะรู้ว่ามีค้าง ซึ่งกลับหัวกับหน้าที่
 * ของ badge. ตอนนี้คอมโพเนนต์ดึงเลขเองจาก /api/chat/comments/unanswered ทุกที่ที่ถูก mount
 * โดย prop กลายเป็นแค่ค่าตั้งต้นกัน badge กระพริบตอนหน้า comments เพิ่งเรนเดอร์
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { subscribeShopComments } from '@/lib/comment-realtime'

const TABS = [
  { href: '/inbox', label: 'ข้อความ', icon: 'message-2' },
  { href: '/inbox/comments', label: 'ความคิดเห็น', icon: 'message-circle-2' },
] as const

/** ทุก 60 วิ เท่ากับ throttle ของ badge สแปม/พัสดุมีปัญหาใน InboxList — ตัวเลขนี้ไม่ใช่ realtime */
const REFRESH_MS = 60_000

/**
 * แคชระดับโมดูล + ชุดผู้ติดตาม
 *
 * ทำไมต้องมี: InboxTabs ถูก mount พร้อมกันได้ถึง 2 ตัวเสมอ (ChatRail ฝั่ง ≥1024px และในหน้า
 * /inbox สำหรับ <1024px ซึ่ง `lg:hidden` แค่ซ่อนด้วย CSS ไม่ได้ unmount) ปล่อยให้ต่างคนต่างยิง
 * = 2 request ต่อรอบโดยได้เลขเดียวกัน ทั้งที่ query เป็น COUNT ข้ามตาราง
 */
let cachedCount = 0
let fetchedAt = 0
let inFlight: Promise<void> | null = null
const listeners = new Set<(n: number) => void>()

async function refreshUnanswered(force = false) {
  if (!force && Date.now() - fetchedAt < REFRESH_MS) return
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      const res = await fetch('/api/chat/comments/unanswered', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { count?: number }
      if (typeof data.count !== 'number') return
      fetchedAt = Date.now()
      cachedCount = data.count
      listeners.forEach((fn) => fn(cachedCount))
    } catch {
      // เงียบ — badge เป็นข้อมูลเสริม ไม่คุ้มที่จะรบกวนผู้ใช้เมื่อดึงไม่สำเร็จ
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

export default function InboxTabs({
  unansweredCount,
  shopId = null,
}: {
  unansweredCount?: number
  /**
   * ร้านที่กำลังใช้งาน — ใช้ subscribe `comments:shop:{shopId}` ให้ badge ขยับทันทีที่มีคอมเมนต์
   * เข้ามา ไม่ต้องรอรอบ 60 วิ. ไม่ส่ง = ตกไปใช้ poll อย่างเดียว (ยังถูกต้อง แค่ช้ากว่า)
   *
   * trigger ตัวเดียวกับที่หน้าความคิดเห็นใช้อยู่แล้ว — comment ใน migration
   * 20260803180000 ระบุไว้ตรง ๆ ว่า channel นี้มีไว้ให้ "รายการโพสต์/ตัวนับยังไม่ตอบ" อัปเดต
   * แม้ยังไม่ได้เปิดโพสต์นั้น ตอนนี้แค่มีคนใช้ครบตามที่ออกแบบไว้
   */
  shopId?: string | null
}) {
  const pathname = usePathname()
  // /inbox/[conversationId] ยังถือว่าอยู่แท็บ "ข้อความ" — เทียบ prefix ไม่ใช่ค่าเป๊ะ
  const isComments = pathname?.startsWith('/inbox/comments') ?? false
  // prop = ค่าที่ RSC นับมาแล้ว (สดกว่าแคชเสมอ) จึงถือเป็นค่าตั้งต้นและยัดเข้าแคชเลย
  const [count, setCount] = useState(unansweredCount ?? cachedCount)

  useEffect(() => {
    if (typeof unansweredCount === 'number') {
      cachedCount = unansweredCount
      fetchedAt = Date.now()
      setCount(unansweredCount)
    }
  }, [unansweredCount])

  useEffect(() => {
    listeners.add(setCount)
    void refreshUnanswered()
    // poll = ทางสำรองเวลา socket หลุด ไม่ใช่ทางหลัก — หยุดตอนแท็บไม่ได้อยู่หน้าจอ (ไม่มีใครดู
    // ก็ไม่ต้องยิง) จังหวะเดียวกับ fallback ของ CommentsClient
    const timer = setInterval(() => {
      if (!document.hidden) void refreshUnanswered()
    }, REFRESH_MS)
    return () => {
      listeners.delete(setCount)
      clearInterval(timer)
    }
  }, [])

  // realtime: คอมเมนต์ใหม่เข้า → badge ขยับทันที ไม่ต้องรอรอบ poll (force=true ข้าม throttle
  // เพราะสัญญาณนี้แปลว่า "ตัวเลขเปลี่ยนแน่แล้ว" ไม่ใช่การเดา)
  useEffect(() => {
    if (!shopId) return
    return subscribeShopComments(shopId, () => void refreshUnanswered(true))
  }, [shopId])

  return (
    <div className="border-default-200 flex gap-1 border-b px-4 pt-3">
      {TABS.map((t) => {
        const active = t.href === '/inbox/comments' ? isComments : !isComments
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-sm font-medium ${
              active
                ? 'border-primary text-primary'
                : 'text-default-700 hover:text-default-800 border-transparent'
            }`}
          >
            <Icon icon={t.icon} className="text-base" />
            {t.label}
            {t.href === '/inbox/comments' && count > 0 && (
              <span
                className="bg-danger flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs text-white"
                aria-label={`ยังไม่ตอบ ${count} ความคิดเห็น`}
              >
                {count > 99 ? '99+' : count}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
