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
 * ── badge ทั้ง 2 แท็บ ───────────────────────────────────────────────────────────
 * "ความคิดเห็น" = คอมเมนต์ที่ยังไม่ตอบ (user สั่ง 2026-08-04) — เดิมตัวเลขมาทาง prop จาก RSC ของ
 * หน้า /inbox/comments เท่านั้น อยู่แท็บข้อความจึงไม่เห็นเลย ต้องกดเข้าไปถึงจะรู้ว่ามีค้าง
 * "ข้อความ" = เธรดที่ยังไม่อ่าน (user สั่ง 2026-08-04 รอบถัดมา: "ตอนนี้มีแต่ความคิดเห็น")
 *
 * ทั้งคู่ดึงจาก /api/chat/inbox-tab-counts ครั้งเดียว แล้วอัปเดตทันทีด้วย realtime 2 ช่อง
 * (`chat:shop:{id}` = ลูกค้าทักมา, `comments:shop:{id}` = คอมเมนต์ใหม่) โดยมี poll เป็นตัวสำรอง
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { subscribeShopChat } from '@/lib/chat-shop-realtime'
import { subscribeShopComments } from '@/lib/comment-realtime'

const TABS = [
  { href: '/inbox', label: 'ข้อความ', icon: 'message-2' },
  { href: '/inbox/comments', label: 'ความคิดเห็น', icon: 'message-circle-2' },
] as const

/** ทุก 60 วิ เท่ากับ throttle ของ badge สแปม/พัสดุมีปัญหาใน InboxList — ตัวเลขนี้ไม่ใช่ realtime */
const REFRESH_MS = 60_000

type Counts = { unread: number; unanswered: number }

/**
 * แคชระดับโมดูล + ชุดผู้ติดตาม
 *
 * ทำไมต้องมี: InboxTabs ถูก mount พร้อมกันได้ถึง 2 ตัวเสมอ (ChatRail ฝั่ง ≥1024px และในหน้า
 * /inbox สำหรับ <1024px ซึ่ง `lg:hidden` แค่ซ่อนด้วย CSS ไม่ได้ unmount) ปล่อยให้ต่างคนต่างยิง
 * = 2 request ต่อรอบโดยได้เลขเดียวกัน ทั้งที่เป็น COUNT ข้ามตาราง 2 ชุด
 */
let cached: Counts = { unread: 0, unanswered: 0 }
let fetchedAt = 0
let inFlight: Promise<void> | null = null
const listeners = new Set<(c: Counts) => void>()

async function refreshCounts(force = false) {
  if (!force && Date.now() - fetchedAt < REFRESH_MS) return
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      const res = await fetch('/api/chat/inbox-tab-counts', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as Partial<Counts>
      if (typeof data.unread !== 'number' || typeof data.unanswered !== 'number') return
      fetchedAt = Date.now()
      cached = { unread: data.unread, unanswered: data.unanswered }
      listeners.forEach((fn) => fn(cached))
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
  /** ค่าที่ RSC ของหน้า comments นับมาแล้ว — ใช้เป็นค่าตั้งต้นกัน badge กระพริบตอนเพิ่งเรนเดอร์ */
  unansweredCount?: number
  /**
   * ร้านที่กำลังใช้งาน — ใช้ subscribe `chat:shop:{id}` + `comments:shop:{id}` ให้ badge ขยับ
   * ทันทีที่มีของใหม่ ไม่ต้องรอรอบ 60 วิ. ไม่ส่ง = ตกไปใช้ poll อย่างเดียว (ยังถูก แค่ช้ากว่า)
   *
   * trigger ตัวเดียวกับที่รายการแชท/หน้าความคิดเห็นใช้อยู่แล้ว — comment ใน migration
   * 20260803180000 ระบุไว้ตรง ๆ ว่า channel คอมเมนต์มีไว้ให้ "ตัวนับยังไม่ตอบ" อัปเดตด้วย
   */
  shopId?: string | null
}) {
  const pathname = usePathname()
  // /inbox/[conversationId] ยังถือว่าอยู่แท็บ "ข้อความ" — เทียบ prefix ไม่ใช่ค่าเป๊ะ
  const isComments = pathname?.startsWith('/inbox/comments') ?? false
  const [counts, setCounts] = useState<Counts>(() =>
    typeof unansweredCount === 'number' ? { ...cached, unanswered: unansweredCount } : cached,
  )

  useEffect(() => {
    if (typeof unansweredCount !== 'number') return
    cached = { ...cached, unanswered: unansweredCount }
    setCounts(cached)
  }, [unansweredCount])

  useEffect(() => {
    listeners.add(setCounts)
    void refreshCounts()
    // poll = ทางสำรองเวลา socket หลุด ไม่ใช่ทางหลัก — หยุดตอนแท็บไม่ได้อยู่หน้าจอ (ไม่มีใครดู
    // ก็ไม่ต้องยิง) จังหวะเดียวกับ fallback ของ CommentsClient
    const timer = setInterval(() => {
      if (!document.hidden) void refreshCounts()
    }, REFRESH_MS)
    return () => {
      listeners.delete(setCounts)
      clearInterval(timer)
    }
  }, [])

  /**
   * เปลี่ยน route ในกล่องข้อความ = เพิ่งเปิด/ปิดเธรดไป → ตัวเลข "ยังไม่อ่าน" เปลี่ยนแน่นอน
   *
   * ต้องมีเพราะการ "อ่าน" ไม่มี broadcast ให้ subscribe (trigger ยิงตอนมีข้อความใหม่เท่านั้น)
   * ไม่มีบรรทัดนี้ = กดเข้าอ่านเธรดแล้วเลขบนแท็บยังค้างอยู่จนกว่าจะครบ 60 วิ ซึ่งดูเหมือนระบบพัง
   */
  useEffect(() => {
    void refreshCounts(true)
  }, [pathname])

  // realtime: ลูกค้าทักมา / คอมเมนต์ใหม่ → badge ขยับทันที (force=true ข้าม throttle เพราะ
  // สัญญาณนี้แปลว่า "ตัวเลขเปลี่ยนแน่แล้ว" ไม่ใช่การเดา)
  useEffect(() => {
    if (!shopId) return
    const offChat = subscribeShopChat(shopId, () => void refreshCounts(true))
    const offComments = subscribeShopComments(shopId, () => void refreshCounts(true))
    return () => {
      offChat()
      offComments()
    }
  }, [shopId])

  return (
    <div className="border-default-200 flex gap-1 border-b px-4 pt-3">
      {TABS.map((t) => {
        const active = t.href === '/inbox/comments' ? isComments : !isComments
        const count = t.href === '/inbox/comments' ? counts.unanswered : counts.unread
        const badgeLabel =
          t.href === '/inbox/comments' ? `ยังไม่ตอบ ${count} ความคิดเห็น` : `ยังไม่อ่าน ${count} แชท`
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
            {count > 0 && (
              <span
                className="bg-danger flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs text-white"
                aria-label={badgeLabel}
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
