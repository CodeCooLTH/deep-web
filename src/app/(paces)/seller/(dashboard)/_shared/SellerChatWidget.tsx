'use client'

/**
 * SellerChatWidget — floating chat bubble + panel มุมขวาล่าง (feat 00011 Deep Chat, ChatWidget task)
 *
 * UX-Design-Spec-Bubble.md "Seller skin": bubble custom `<button bg-primary text-white
 * rounded-full>` (Base SellerBottomNav.tsx:234-263 center-FAB markup — shadow arbitrary + comment
 * ตาม HR7) + unread badge (Base SellerBottomNav.tsx:210-226 .nbadge) · panel `.card` + header
 * ทับ `bg-primary text-white` (token composition, HR7-ok) · list=ChatWidgetList,
 * thread=ChatWidgetThreadPanel (เรียก useSellerChatThread hook เดียวกับ full-page)
 *
 * แสดงเฉพาะ `≥lg` (`hidden lg:flex`) — `<lg` ใช้ SellerBottomNav "แชท" แทน (OQ1, resolved)
 * state (open/view/activeConversation) persist ข้าม client-navigation เพราะ mount ที่ layout.tsx
 * ซึ่งเป็น RSC ที่ไม่ remount ทุกครั้งที่ path เปลี่ยนใน App Router (OQ3, resolved)
 *
 * click-away/Esc pattern: reuse จาก src/components/safepay/FilterDropdown.tsx
 * (custom React ไม่ใช่ Preline hs-dropdown — กัน opacity ค้าง 0 บทเรียน OrderCardMenu 2026-06-15)
 *
 * activeConversationId ผูกกับ chatWidgetActiveThread module-level store (OQ2) — ChatToastListener
 * เช็คว่า panel เปิด thread นี้ค้างอยู่หรือไม่ กันเด้ง toast ซ้ำตอนกำลังคุยอยู่ในตัว panel เอง
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import ChatWidgetList, { type ConversationListItem } from './ChatWidgetList'
import ChatWidgetThreadPanel from './ChatWidgetThreadPanel'
import { setChatWidgetActiveConversationId } from './chatWidgetActiveThread'

type ActiveConversation = {
  id: string
  buyerName: string
  buyerAvatar: string | null
}

type Props = {
  /** unread count เริ่มต้นจาก getUnreadCountForShop (server, ดู layout.tsx) */
  initialUnreadCount: number
}

function isUnread(c: ConversationListItem): boolean {
  return c.shopLastReadAt === null || new Date(c.lastMessageAt) > new Date(c.shopLastReadAt)
}

export default function SellerChatWidget({ initialUnreadCount }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'list' | 'thread'>('list')
  const [activeConversation, setActiveConversation] = useState<ActiveConversation | null>(null)
  // unreadCount local — ลดทันทีเมื่อเปิดห้องที่ unread (optimistic, ไม่ต้อง refetch ทั้งก้อน)
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)

  const rootRef = useRef<HTMLDivElement>(null)

  const badgeText = unreadCount >= 100 ? '99+' : String(unreadCount)

  // ── click-outside + Escape ปิด panel (คง state view/activeConversation ไว้) ──
  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  // ── sync activeConversationId (OQ2 dedup) ให้ ChatToastListener อ่าน ─────
  useEffect(() => {
    const id = open && view === 'thread' ? activeConversation?.id ?? null : null
    setChatWidgetActiveConversationId(id)
    // เคลียร์ตอน unmount (กัน stale id ค้างถ้า widget หาย)
    return () => setChatWidgetActiveConversationId(null)
  }, [open, view, activeConversation])

  const handleSelectConversation = useCallback((conversation: ConversationListItem) => {
    if (isUnread(conversation)) {
      setUnreadCount((prev) => Math.max(0, prev - 1))
    }
    setActiveConversation({
      id: conversation.id,
      buyerName: conversation.counterparty?.displayName ?? 'ผู้ซื้อ',
      buyerAvatar: conversation.counterparty?.avatar ?? null,
    })
    setView('thread')
  }, [])

  const handleBack = useCallback(() => setView('list'), [])

  const handleExpand = useCallback(() => {
    setOpen(false)
    if (view === 'thread' && activeConversation) {
      router.push(`/inbox/${activeConversation.id}`)
    } else {
      router.push('/inbox')
    }
  }, [router, view, activeConversation])

  return (
    // ครอบทั้งก้อน hidden lg:flex — mobile ใช้ SellerBottomNav "แชท" แทน (OQ1)
    <div ref={rootRef} className="hidden lg:flex">
      {/* panel — เปิดขึ้นบนจาก bubble (top-end จาก bottom-right) */}
      {open && (
        <div
          role="dialog"
          aria-label="แชท"
          // h-auto ทับ `.card` (h-fit ปกติ) — panel ใช้ fixed top-24+bottom-24 ให้ browser
          // คำนวณความสูงเองจาก viewport (เลี่ยง arbitrary calc แบบ ChatThread.tsx h-[calc(...)])
          className="card fixed bottom-24 right-6 top-24 z-40 flex h-auto w-96 flex-col overflow-hidden"
        >
          {/* header — bg-primary text-white ทับ card-header (token composition, HR7-ok) */}
          <div className="card-header !border-0 bg-primary text-white">
            <div className="flex min-w-0 items-center gap-2">
              {view === 'thread' && (
                <button
                  type="button"
                  onClick={handleBack}
                  aria-label="กลับ"
                  className="flex size-7.5 shrink-0 items-center justify-center rounded-lg bg-white/15 hover:bg-white/25"
                >
                  <Icon icon="arrow-left" className="text-lg" />
                </button>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight">
                  {view === 'thread' ? activeConversation?.buyerName : 'ข้อความ'}
                </p>
                {view === 'list' && unreadCount > 0 && (
                  <p className="truncate text-2xs font-medium leading-tight opacity-85">
                    {badgeText} ยังไม่อ่าน
                  </p>
                )}
              </div>
            </div>

            <div className="ms-auto flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={handleExpand}
                aria-label="ขยายเต็มหน้า"
                className="flex size-7.5 items-center justify-center rounded-lg bg-white/15 hover:bg-white/25"
              >
                <Icon icon="arrows-maximize" className="text-base" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="ปิด"
                className="flex size-7.5 items-center justify-center rounded-lg bg-white/15 hover:bg-white/25"
              >
                <Icon icon="x" className="text-lg" />
              </button>
            </div>
          </div>

          {/* body — list ↔ thread (แต่ละ component คุม scroll/padding เอง) */}
          <div className="min-h-0 grow">
            {view === 'list' ? (
              <ChatWidgetList onSelect={handleSelectConversation} />
            ) : activeConversation ? (
              <ChatWidgetThreadPanel
                conversationId={activeConversation.id}
                buyerName={activeConversation.buyerName}
                buyerAvatar={activeConversation.buyerAvatar}
              />
            ) : null}
          </div>
        </div>
      )}

      {/* bubble (FAB) — Base: SellerBottomNav.tsx center raised button markup */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? 'ปิดแชท' : 'เปิดแชท'}
        aria-expanded={open}
        className={[
          'fixed bottom-6 right-6 z-40',
          'flex size-14 items-center justify-center rounded-full bg-primary text-white',
          /* arbitrary: FAB drop shadow — Paces ไม่มี token shadow ทรงลอยขนาดนี้ (เหมือน
             SellerBottomNav.tsx center FAB ที่ comment ไว้แบบเดียวกัน) */
          'shadow-[0_10px_26px_-6px_rgba(35,109,201,0.55)]',
          'transition-transform hover:-translate-y-0.5',
        ].join(' ')}
      >
        <Icon icon="message-circle" className="text-2xl" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className={[
              'absolute -top-1 -right-1 min-w-5 h-5 px-1',
              /* arbitrary: badge ring 2px ขาว — เหตุผลเดียวกับ SellerBottomNav.tsx badge comment
                 (ไม่มี Paces/Tailwind token outline white สำหรับ ring บน badge ลอย) */
              'rounded-full bg-danger text-white text-2xs font-bold flex items-center justify-center',
              'shadow-[0_0_0_2px_white]',
            ].join(' ')}
          >
            {badgeText}
          </span>
        )}
      </button>
    </div>
  )
}
