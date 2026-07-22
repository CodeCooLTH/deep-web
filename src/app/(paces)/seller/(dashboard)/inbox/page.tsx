/**
 * Seller Inbox — /inbox (feat 00011 Deep Chat, S-11; feat 00018 T3 badge/filter/search)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/chat/components/ContactList.tsx:44-57
 * (row markup: card > card-body divide-y row — avatar + ชื่อ + preview + timestamp/unread)
 * ตัด "เขียนแชทใหม่" (seller ไม่ initiate — UX-Design-Spec.md §S-11); search กลับมาใน T3
 * (ดู docs/superpowers/specs/2026-07-22-facebook-chat-ui-design.md §Chat Rail)
 *
 * RSC shell — fetch หน้าแรกผ่าน listConversationsForShop ตรง (ไม่ self-fetch API ของตัวเอง,
 * pattern เดียวกับ inventory/movements/[productId]/page.tsx) แล้วส่งต่อให้ InboxList (client)
 * ทำ sentinel pagination + filter refetch ต่อผ่าน GET /api/chat/conversations (cursor เดิม)
 *
 * B1 (route enrich, UX-Design-Spec.md): counterparty (identity คู่สนทนา) ไม่อยู่ใน
 * ConversationSummary (FROZEN CONTRACT, SDS §5) — enrich ที่นี่ด้วย batch query prisma.user
 * (buyer, เธรด DEEP) + prisma.externalContact (เธรดช่องทางนอก feat 00018 — ชื่อผู้ติดต่อ
 * Messenger/Instagram; avatarUrl เป็น null เสมอ Meta ไม่ให้รูป ไม่ query มาใช้)
 * ต้องตรง field name เป๊ะกับที่ InboxList รับต่อจาก GET pagination {displayName, avatar}
 *
 * T3: เพิ่ม `channel` field (ต่อ row — ใช้ทำ badge) + fetch `listChannels(shop.id)` ส่งลง
 * เป็น option ของตัวกรอง "เพจ" (client ทำ filter/search ต่อผ่าน GET /api/chat/conversations
 * — route มี query param channel/shopChannelId/q แล้วจาก T1 ดู .superpowers/sdd/t1-report.md)
 * known-gap: enrichWithBuyerCounterparty (route.ts, นอกขอบเขต T3) ยัง enrich เฉพาะ buyer —
 * เธรดช่องทางนอกที่โหลดผ่าน pagination/filter refetch (ไม่ใช่ initial SSR) จะได้ counterparty
 * เป็น null → InboxList fallback เป็น "ผู้ติดต่อ" เสมอ (ไม่ crash แต่ไม่เห็นชื่อจริง) — ต้องแก้
 * ที่ route.ts ใน task แยก (นอกขอบเขตไฟล์ของ T3)
 *
 * header: SellerMobileHeader (mobile, auto จาก getSellerPageTitle ผ่าน sellerMenuItems
 * '/inbox' → "ข้อความ") + PageBreadcrumb (desktop เท่านั้น) — ไม่สร้าง custom header
 */
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getShopByUserId } from '@/services/shop.service'
import { listConversationsForShop } from '@/services/chat.service'
import { listChannels } from '@/services/shop-channel.service'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import SellerEmptyState from '../_shared/SellerEmptyState'
import SellerErrorState from '../_shared/SellerErrorState'
import { getChannelDisplay } from './components/ChannelBadge'
import InboxList, { type ConversationListItem, type ChannelFilterOption } from './components/InboxList'

export const metadata: Metadata = { title: 'ข้อความ' }

export default async function SellerInboxPage() {
  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) redirect('/auth/sign-in')

  let shop: { id: string } | null = null
  try {
    shop = await getShopByUserId(user.id)
  } catch {
    shop = null
  }

  const breadcrumb = (
    <div className="hidden lg:block">
      <PageBreadcrumb title="ข้อความ" />
    </div>
  )

  if (!shop) {
    // ทุก seller ควรมีร้านอยู่แล้ว (layout.tsx auto-create) — defensive fallback เท่านั้น
    return (
      <>
        {breadcrumb}
        <SellerErrorState title="ยังไม่มีร้านค้า" message="เปิดร้านก่อนเพื่อดูข้อความจากลูกค้า" />
      </>
    )
  }

  // ── channels (ตัวกรอง "เพจ") — fail-closed แยกจาก conversation fetch (pattern pendingCount
  // ของ layout.tsx) ไม่มีเพจก็ยังดู list ได้ปกติ แค่ตัวกรองว่าง ──
  let channels: ChannelFilterOption[] = []
  let hasAnyChannel = false
  try {
    const rows = await listChannels(shop.id)
    hasAnyChannel = rows.length > 0
    channels = rows.map((c) => ({ id: c.id, label: `${getChannelDisplay(c.provider).label} · ${c.name}` }))
  } catch (e) {
    console.error('[inbox/page] listChannels failed', e)
  }

  // ── data fetch (try/catch แยกจาก JSX construction — react-hooks/error-boundaries) ──
  let items: ConversationListItem[] = []
  let nextCursor: string | null = null
  let loadFailed = false

  try {
    const result = await listConversationsForShop(shop.id, { take: 20 })

    // B1 enrich — batch query identity คู่สนทนา (ดู comment หัวไฟล์)
    // เธรดช่องทางนอก (feature 00018) buyerUserId เป็น null → กรองออกก่อน query
    const buyerIds = [...new Set(result.items.map((i) => i.buyerUserId).filter((id): id is string => id !== null))]
    const buyers =
      buyerIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: buyerIds } },
            select: { id: true, displayName: true, avatar: true },
          })
        : []
    const buyerMap = new Map(buyers.map((b) => [b.id, b]))

    // T3: เธรดช่องทางนอก (feature 00018) — ชื่อผู้ติดต่อจาก ExternalContact (avatarUrl ไม่ query
    // มาใช้ เพราะ Meta ไม่ให้รูป เป็น null เสมอตาม contract — allow-list เฉพาะ id/name)
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

    // serialize ก่อนข้าม RSC boundary — Date → ISO string (pattern movements/[productId]/page.tsx)
    // allow-list ทีละ field (RSC PII rule) — ห้าม spread ...c
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
    console.error('[inbox/page] listConversationsForShop failed', e)
    loadFailed = true
  }

  if (loadFailed) {
    return (
      <>
        {breadcrumb}
        <SellerErrorState />
      </>
    )
  }

  if (items.length === 0) {
    return (
      <>
        {breadcrumb}
        <SellerEmptyState
          icon="message-circle"
          title="ยังไม่มีข้อความ"
          description="เมื่อลูกค้าทักแชทมาที่ร้าน จะแสดงในหน้านี้"
          // edge state: ยังไม่เคยเชื่อมช่องทางนอกเลย — CTA รองไปเชื่อม (ดู Edge states ของสเปก)
          action={hasAnyChannel ? undefined : { label: 'เชื่อม Facebook Page', href: '/settings/channels' }}
        />
      </>
    )
  }

  return (
    <>
      {breadcrumb}
      {/* ≥1024px: รายการแชทย้ายไปอยู่ที่ Chat Rail (เมนูซ้าย) แล้ว — ตรงกลางต้องไม่โชว์ซ้ำ
          ไม่งั้นเห็นรายการเดียวกัน 2 ที่พร้อมกัน (user เจอจริงบน prod)
          <1024px: ไม่มี rail (เมนูซ้ายถูกซ่อนทั้งระบบ) จึงต้องคงรายการไว้ที่นี่เหมือนเดิม */}
      <div className="lg:hidden">
        <InboxList initialItems={items} initialNextCursor={nextCursor} channels={channels} />
      </div>
      <div className="hidden lg:block">
        <SellerEmptyState
          compact
          icon="message-circle"
          title="เลือกบทสนทนา"
          description="เลือกรายการแชททางซ้ายมือเพื่อเริ่มอ่านและตอบข้อความ"
        />
      </div>
    </>
  )
}
