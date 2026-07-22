'use client'

/**
 * ChatRailClient — เมนูซ้ายโหมดแชท (bug fix: Chat Rail ไม่สลับเมนู, feat 00018) แทนที่
 * ChatRail.tsx เดิม (server component) ที่ query DB ตอน layout render — ปัญหาคือ layout
 * ไม่ re-render ตอน soft nav (ดู comment หัวไฟล์ SidenavContent.tsx) จึงย้ายมา fetch เองที่
 * client แทน ให้ mount ใหม่ทุกครั้งที่ SidenavContent สลับเป็นโหมดแชท (pathname เปลี่ยน)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/chat/components/ContactList.tsx
 * (โครงสร้าง sidebar แชท: search header เหนือ contact list ที่ scroll ได้ในตัว — ของเดิมที่
 * ChatRail.tsx อ้างไว้; ปุ่ม "กลับเมนูหลัก" เป็นของใหม่เหมือนเดิม theme ไม่มี)
 *
 * reuse InboxList (T3) ทั้งชุดเหมือน ChatRail.tsx เดิม — ห้ามแก้ไฟล์นั้น (ขอบเขตงาน fix นี้)
 *
 * data fetch: GET /api/channels (ตัวกรอง "เพจ") + GET /api/chat/conversations (รายการเริ่มต้น)
 * — contract ดู .superpowers/sdd/t1-report.md; response ของ /api/chat/conversations enrich
 * counterparty มาแล้วที่ route (ตรง ConversationListItem ทุก field ไม่ต้อง map เพิ่ม)
 *
 * ความกว้าง 320px คุมที่ CSS (.seller-chat-shell scoped var — safepay-overrides.css, toggle
 * โดย SidenavContent) ไม่ใช่ที่ component นี้
 *
 * feat 00018 (Chat Rail topbar): ส่ง railMode ให้ InboxList — ช่องค้นหาย้ายขึ้น topbar แล้ว
 * (ChatSearchBox.tsx ผ่าน ChatSearchContext) ไม่ให้ InboxList render ช่องค้นหาซ้ำในนี้อีก
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import { SellerInboxSkeleton } from '../../_shared/SellerCardSkeleton'
import { getChannelDisplay } from './ChannelBadge'
import InboxList, { type ConversationListItem, type ChannelFilterOption } from './InboxList'

type ChannelsApiResponse = { items: { id: string; provider: string; name: string }[] }
type ConversationsApiResponse = { items: ConversationListItem[]; nextCursor: string | null }

export default function ChatRailClient() {
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [items, setItems] = useState<ConversationListItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [channels, setChannels] = useState<ChannelFilterOption[]>([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setLoadFailed(false)
      try {
        // 2 endpoint แยกกัน — ตัวกรอง "เพจ" ไม่ควรทำให้ list ล่มถ้าโหลดไม่สำเร็จ (pattern
        // เดียวกับ ChatRail.tsx เดิม/inbox/page.tsx: try/catch แยก ไม่ block กัน)
        let channelOptions: ChannelFilterOption[] = []
        try {
          const channelsRes = await fetch('/api/channels')
          if (channelsRes.ok) {
            const channelsData: ChannelsApiResponse = await channelsRes.json()
            channelOptions = channelsData.items.map((c) => ({
              id: c.id,
              label: `${getChannelDisplay(c.provider).label} · ${c.name}`,
            }))
          }
        } catch (e) {
          console.error('[ChatRailClient] load channels failed', e)
        }

        const conversationsRes = await fetch('/api/chat/conversations?take=20')
        if (!conversationsRes.ok) throw new Error('load conversations failed')
        const conversationsData: ConversationsApiResponse = await conversationsRes.json()

        if (cancelled) return
        setChannels(channelOptions)
        setItems(conversationsData.items)
        setNextCursor(conversationsData.nextCursor)
      } catch (e) {
        if (cancelled) return
        console.error('[ChatRailClient] load conversations failed', e)
        setLoadFailed(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      {/* แถวบนสุด — ทางออกเดียวที่ต้องมีเสมอ (ห้ามพึ่ง breadcrumb/back ของ browser) */}
      <div className="px-4 pt-4 pb-2">
        <Link
          href="/dashboard"
          className="btn bg-light text-dark btn-sm flex w-full items-center justify-start gap-2"
        >
          <Icon icon="arrow-left" className="text-base" />
          <span>กลับเมนูหลัก</span>
        </Link>
      </div>

      {loading ? (
        <div className="px-4 pb-4">
          <SellerInboxSkeleton />
        </div>
      ) : loadFailed ? (
        <div className="px-4 pb-4">
          <SellerEmptyState compact icon="alert-circle" title="โหลดรายการแชทไม่สำเร็จ" description="ลองรีเฟรชหน้าใหม่อีกครั้ง" />
        </div>
      ) : items.length === 0 ? (
        <div className="px-4 pb-4">
          <SellerEmptyState
            compact
            icon="message-circle"
            title="ยังไม่มีข้อความ"
            description="เมื่อลูกค้าทักแชทมาที่ร้าน จะแสดงในหน้านี้"
          />
        </div>
      ) : (
        <InboxList initialItems={items} initialNextCursor={nextCursor} channels={channels} railMode />
      )}
    </>
  )
}
