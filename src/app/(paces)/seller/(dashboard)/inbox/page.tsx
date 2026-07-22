/**
 * Seller Inbox — /inbox (feat 00011 Deep Chat, S-11)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/chat/components/ContactList.tsx:44-57
 * (row markup: card > card-body divide-y row — avatar + ชื่อ + preview + timestamp/unread)
 * ตัด search + "เขียนแชทใหม่" (seller ไม่ initiate — UX-Design-Spec.md §S-11)
 *
 * RSC shell — fetch หน้าแรกผ่าน listConversationsForShop ตรง (ไม่ self-fetch API ของตัวเอง,
 * pattern เดียวกับ inventory/movements/[productId]/page.tsx) แล้วส่งต่อให้ InboxList (client)
 * ทำ sentinel pagination ต่อผ่าน GET /api/chat/conversations (cursor เดิม)
 *
 * B1 (route enrich, UX-Design-Spec.md): counterparty (identity ผู้ซื้อ) ไม่อยู่ใน
 * ConversationSummary (FROZEN CONTRACT, SDS §5) — enrich ที่นี่ด้วย batch query prisma.user
 * (ก็อปโครงเดียวกับ enrichWithBuyerCounterparty ใน src/app/api/chat/conversations/route.ts
 * เพื่อให้ shape ตรงกับที่ InboxList รับต่อจาก GET pagination — ต้องตรง field name เป๊ะ
 * {displayName, avatar} ไม่ใช่ {name, avatar})
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
import PageBreadcrumb from '@/components/PageBreadcrumb'
import SellerEmptyState from '../_shared/SellerEmptyState'
import SellerErrorState from '../_shared/SellerErrorState'
import InboxList, { type ConversationListItem } from './components/InboxList'

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

  // ── data fetch (try/catch แยกจาก JSX construction — react-hooks/error-boundaries) ──
  let items: ConversationListItem[] = []
  let nextCursor: string | null = null
  let loadFailed = false

  try {
    const result = await listConversationsForShop(shop.id, { take: 20 })

    // B1 enrich — batch query buyer identity (ดู comment หัวไฟล์)
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

    // serialize ก่อนข้าม RSC boundary — Date → ISO string (pattern movements/[productId]/page.tsx)
    items = result.items.map((c) => {
      const buyer = c.buyerUserId ? buyerMap.get(c.buyerUserId) : undefined
      return {
        id: c.id,
        buyerUserId: c.buyerUserId,
        shopId: c.shopId,
        lastMessageAt: c.lastMessageAt.toISOString(),
        lastMessagePreview: c.lastMessagePreview,
        lastSenderRole: c.lastSenderRole,
        buyerLastReadAt: c.buyerLastReadAt ? c.buyerLastReadAt.toISOString() : null,
        shopLastReadAt: c.shopLastReadAt ? c.shopLastReadAt.toISOString() : null,
        createdAt: c.createdAt.toISOString(),
        counterparty: buyer ? { displayName: buyer.displayName, avatar: buyer.avatar } : null,
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
        />
      </>
    )
  }

  return (
    <>
      {breadcrumb}
      <InboxList initialItems={items} initialNextCursor={nextCursor} />
    </>
  )
}
