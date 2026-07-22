/**
 * ChatRail — เมนูซ้ายโหมดแชท (feat 00018 T2) แทนที่ AppMenu ที่ตำแหน่ง <aside> เดิม
 * เมื่อ path เริ่มด้วย /inbox บน desktop ≥1024px (ดูกลไก sidenavOverride ที่
 * `src/app/(paces)/seller/(dashboard)/layout.tsx` → `VerticalLayout` → `Sidenav`)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/chat/components/ContactList.tsx
 * (โครงสร้าง sidebar แชท: search header เหนือ contact list ที่ scroll ได้ในตัว)
 * ปุ่ม "กลับเมนูหลัก" เป็นของใหม่ (theme ไม่มี — ตามสเปก §กลไกหลัก "ทางออกจากโหมดแชท")
 *
 * reuse InboxList (T3) ทั้งชุด — มี search/channel tabs/ตัวกรองเพจ/badge/แถวสนทนาครบแล้ว
 * (ตามคำสั่ง Controller ห้ามทำ list ใหม่) ChatRail ทำแค่ fetch ข้อมูลชุดเดียวกับที่
 * `inbox/page.tsx` fetch (ทำซ้ำในไฟล์นี้เพราะขอบเขตงาน T2 ห้ามแก้ page.tsx เพื่อแชร์ helper
 * ข้าม task ที่ทำขนานกันอยู่ — ดู .superpowers/sdd/t2-report.md หมายเหตุ known-gap)
 *
 * ความกว้าง 320px คุมที่ CSS (.seller-chat-shell scoped var — safepay-overrides.css)
 * ไม่ใช่ที่ component นี้
 */
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { prisma } from '@/lib/prisma'
import { listConversationsForShop } from '@/services/chat.service'
import { listChannels } from '@/services/shop-channel.service'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import { getChannelDisplay } from './ChannelBadge'
import InboxList, { type ConversationListItem, type ChannelFilterOption } from './InboxList'

export default async function ChatRail({ shopId }: { shopId: string }) {
  // ── channels (ตัวกรอง "เพจ") — fail-closed เหมือน inbox/page.tsx ──
  let channels: ChannelFilterOption[] = []
  try {
    const rows = await listChannels(shopId)
    channels = rows.map((c) => ({ id: c.id, label: `${getChannelDisplay(c.provider).label} · ${c.name}` }))
  } catch (e) {
    console.error('[ChatRail] listChannels failed', e)
  }

  // ── conversations หน้าแรก + enrich counterparty (buyer/externalContact) เหมือน inbox/page.tsx ──
  let items: ConversationListItem[] = []
  let nextCursor: string | null = null
  let loadFailed = false

  try {
    const result = await listConversationsForShop(shopId, { take: 20 })

    const buyerIds = [...new Set(result.items.map((i) => i.buyerUserId).filter((id): id is string => id !== null))]
    const buyers =
      buyerIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: buyerIds } },
            select: { id: true, displayName: true, avatar: true },
          })
        : []
    const buyerMap = new Map(buyers.map((b) => [b.id, b]))

    const externalContactIds = [
      ...new Set(result.items.map((i) => i.externalContactId).filter((id): id is string => id !== null)),
    ]
    const externalContacts =
      externalContactIds.length > 0
        ? await prisma.externalContact.findMany({
            where: { id: { in: externalContactIds } },
            select: { id: true, name: true },
          })
        : []
    const contactMap = new Map(externalContacts.map((c) => [c.id, c]))

    items = result.items.map((c) => {
      const buyer = c.buyerUserId ? buyerMap.get(c.buyerUserId) : undefined
      const contact = c.externalContactId ? contactMap.get(c.externalContactId) : undefined
      const counterparty = buyer
        ? { displayName: buyer.displayName, avatar: buyer.avatar }
        : contact
          ? { displayName: contact.name ?? 'ผู้ติดต่อ', avatar: null }
          : null
      return {
        id: c.id,
        buyerUserId: c.buyerUserId,
        shopId: c.shopId,
        channel: c.channel,
        lastMessageAt: c.lastMessageAt.toISOString(),
        lastMessagePreview: c.lastMessagePreview,
        lastSenderRole: c.lastSenderRole,
        buyerLastReadAt: c.buyerLastReadAt ? c.buyerLastReadAt.toISOString() : null,
        shopLastReadAt: c.shopLastReadAt ? c.shopLastReadAt.toISOString() : null,
        createdAt: c.createdAt.toISOString(),
        counterparty,
      }
    })
    nextCursor = result.nextCursor
  } catch (e) {
    console.error('[ChatRail] listConversationsForShop failed', e)
    loadFailed = true
  }

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

      {loadFailed ? (
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
        <InboxList initialItems={items} initialNextCursor={nextCursor} channels={channels} />
      )}
    </>
  )
}
