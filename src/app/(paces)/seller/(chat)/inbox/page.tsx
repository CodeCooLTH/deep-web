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
 * rewrite (chat-standalone, .superpowers/sdd/chat-standalone.md): ย้ายมาจาก
 * (dashboard)/inbox/page.tsx → (chat)/inbox/page.tsx — หน้าแชทตอนนี้เป็นเต็มจอของตัวเอง
 * (ไม่มี Sidenav/TopBar ของ seller อีกต่อไป, ดู (chat)/layout.tsx) header/back button/search
 * ย้ายไป ChatHeader.tsx (mount ที่ layout); Chat Rail ย้ายไปเป็นคอลัมน์แรกที่ layout เช่นกัน
 * (ChatRail.tsx) แทนการสลับเข้า Sidenav — หน้านี้ (children ของ layout) จึงคุมแค่คอลัมน์กลาง+ขวา
 * เหมือนเดิมทุกประการ (ไม่เปลี่ยน logic data fetch) เปลี่ยนแค่ height strategy (ดู comment
 * ที่ JSX ด้านล่าง — ใช้ h-full แทนสูตร dvh-minus-topbar เดิม เพราะตอนนี้พ่อแม่คุม
 * ความสูงที่เหลือให้แล้วผ่าน flex h-dvh ที่ layout.tsx ไม่ต้องคำนวณ viewport เองอีกต่อไป)
 * _shared/* imports เปลี่ยนจาก relative (../_shared) เป็น alias เพราะย้ายข้าม route group แล้ว
 * (_shared ยังอยู่ที่ (dashboard)/_shared/ เดิม — ใช้ร่วมกับ ChatWidget ฯลฯ ที่ยังอยู่ (dashboard))
 *
 * bug fix (แชทไม่แยกตามร้าน, user report prod): getShopByUserId คืนร้าน PERSONAL เสมอ ไม่สนว่า
 * session กำลัง active อยู่ร้านไหน (feature 00008 shop switcher) — สลับไปร้าน B แล้วยังเห็นแชทของ
 * PERSONAL ค้างอยู่. เปลี่ยนเป็น resolveActiveShopContext (re-verify membership เสมอ, ห้าม trust
 * JWT เปล่า ๆ) — resolve ไม่ได้ (ร้านถูกลบ/หลุดสิทธิ์) → error state ตรง ๆ ห้าม fallback เงียบ ๆ
 * กลับ PERSONAL (นั่นคือบั๊กเดิม)
 */
import type { Metadata } from 'next'
import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { listConversationsForShop, countUnreadByConversation } from '@/services/chat.service'
import { listChannels } from '@/services/shop-channel.service'
import { listChatGroups } from '@/services/chat-group.service'
import { enrichWithOrderStage } from '@/services/order-stage.service'
import { syncShipmentStatuses } from '@/services/iship.service'
import SellerEmptyState from '@/app/(paces)/seller/(dashboard)/_shared/SellerEmptyState'
import SellerErrorState from '@/app/(paces)/seller/(dashboard)/_shared/SellerErrorState'
import InboxList, { type ConversationListItem, type ChannelFilterOption } from './components/InboxList'

export const metadata: Metadata = { title: 'ข้อความ' }

export default async function SellerInboxPage() {
  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) redirect('/auth/sign-in')

  // bug fix: resolve ร้านที่ active จริง (Personal หรือ Business ตาม session.user.activeShopId,
  // re-verify membership เสมอ) — ห้ามใช้ getShopByUserId (คืน PERSONAL เสมอ, คือบั๊กเดิม)
  const activeCtx = await resolveActiveShopContext({
    user: { id: user.id as string, activeShopId: (user.activeShopId as string | null | undefined) ?? null },
  })

  if (!activeCtx) {
    // resolve ไม่ได้ (ร้านถูกลบ/หลุดสิทธิ์) → error state ตรง ๆ ห้าม fallback เงียบ ๆ ไป PERSONAL
    return (
      <SellerErrorState
        title="ไม่พบร้านที่กำลังใช้งาน"
        message="ร้านนี้อาจถูกลบหรือคุณไม่มีสิทธิ์เข้าถึงแล้ว ลองสลับร้านหรือรีเฟรชหน้าใหม่"
      />
    )
  }
  const shop = { id: activeCtx.shopId }

  // ── channels (ตัวกรอง "เพจ") — fail-closed แยกจาก conversation fetch (pattern pendingCount
  // ของ layout.tsx) ไม่มีเพจก็ยังดู list ได้ปกติ แค่ตัวกรองว่าง ──
  // feat 00018 งาน 2: ไม่ประกอบ label สำเร็จรูปอีกต่อไป — ส่ง provider/name/avatarUrl ดิบให้
  // PageFilterDropdown ประกอบเอง (ต้องใช้ avatarUrl ทำ avatar แถว + provider ทำ badge ไอคอน)
  let channels: ChannelFilterOption[] = []
  let hasAnyChannel = false
  try {
    const rows = await listChannels(shop.id)
    hasAnyChannel = rows.length > 0
    channels = rows.map((c) => ({ id: c.id, provider: c.provider, name: c.name, avatarUrl: c.avatarUrl }))
  } catch (e) {
    console.error('[inbox/page] listChannels failed', e)
  }

  // กลุ่ม/แท็บจัดหมวดแชท (feature 00018) — non-fatal (list ยังแสดงได้แม้โหลดกลุ่มพลาด)
  let groups: { id: string; name: string; sortOrder: number }[] = []
  try {
    groups = await listChatGroups(shop.id)
  } catch (e) {
    console.error('[inbox/page] listChatGroups failed', e)
  }

  // ── data fetch (try/catch แยกจาก JSX construction — react-hooks/error-boundaries) ──
  let items: ConversationListItem[] = []
  // ร้านเชื่อม iShip แล้วหรือยัง — ใช้ซ่อนหัวข้อ "พัสดุ" ในตัวกรองสำหรับร้านที่ไม่ได้ใช้
  // ถามจาก DB ที่นี่ (RSC) ไม่ต้องให้ client ยิง API เพิ่มอีกรอบ
  const shippingAccount = await prisma.shopShippingAccount.findUnique({
    where: { shopId: shop.id },
    select: { status: true },
  })
  const hasShipping = shippingAccount?.status === 'ACTIVE'

  let nextCursor: string | null = null
  let loadFailed = false

  try {
    // status ต้องตรงกับ DEFAULT_CHAT_FILTER ของ InboxList เสมอ — รายการที่เห็นตอนเข้าหน้า
    // ครั้งแรกคือชุดนี้ (client ยังไม่ refetch จนกว่าตัวกรองจะเปลี่ยน) ถ้าไม่ตรงกันจะเกิดอาการ
    // "เธรดที่ปิดงานแล้วหายไปตอนเข้าครั้งแรก แต่กดสลับแท็บไปกลับแล้วโผล่" (user report 2026-07-31)
    const result = await listConversationsForShop(shop.id, { take: 20, status: 'all' })

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

    // T3: เธรดช่องทางนอก (feature 00018) — ชื่อ/รูปผู้ติดต่อจาก ExternalContact
    // avatarUrl: IG คืน profile_pic จริง (เก็บ URL cdninstagram) — Messenger เป็น null (App Review
    // block profile_pic) → BuyerAvatar ตกไป initials เอง. allow-list: id/name/avatarUrl/tags/salesStatus
    const externalContactIds = [
      ...new Set(result.items.map((i) => i.externalContactId).filter((id): id is string => id !== null)),
    ]
    const externalContacts =
      externalContactIds.length > 0
        ? await prisma.externalContact.findMany({
            where: { id: { in: externalContactIds } },
            select: { id: true, name: true, avatarUrl: true, tags: true, salesStatus: true },
          })
        : []
    const contactMap = new Map(externalContacts.map((c) => [c.id, c]))

    // unreadCount — badge ตัวเลขใน inbox list (user request 2026-07-23) นับสดจาก ChatMessage
    // (data model เก็บ read-state ระดับห้องเท่านั้น — ดู comment ที่ countUnreadByConversation)
    const unreadMap = await countUnreadByConversation(result.items.map((c) => c.id))

    // ดึงสถานะพัสดุจาก iShip ก่อน enrich (feature 00022) — อยู่ใน after() จึงไม่หน่วงการโหลดหน้า
    // รอบนี้ป้ายอาจยังเป็นค่าเดิม แล้ว safety-poll 20 วิของ InboxList จะพาค่าที่ sync แล้วมาเอง
    // service กันความถี่ไว้ 15 นาที เปิดหน้าถี่แค่ไหนก็ไม่ยิง iShip เกินรอบ
    const syncShopId = shop.id
    after(async () => {
      try {
        await syncShipmentStatuses(syncShopId)
      } catch (e) {
        console.error('[inbox] sync สถานะพัสดุล้มเหลว', e instanceof Error ? e.message : e)
      }
    })

    // ป้ายขั้นตอนออเดอร์ล่าสุด (user request 2026-07-29) — service เดียวกับที่ GET /api/chat/conversations
    // ใช้ ไม่งั้นหน้าแรกกับหน้าที่โหลดจากการกรองจะแสดงไม่เหมือนกัน (ของเดิม enrich อยู่ใน route ทางเดียว
    // ชิปเลยไม่ขึ้นตอนโหลดหน้าแรก แล้วค่อยโผล่หลัง client refetch)
    const stageMap = new Map(
      (await enrichWithOrderStage(result.items, shop.id)).map((r) => [r.id, r.orderStage]),
    )

    // serialize ก่อนข้าม RSC boundary — Date → ISO string (pattern movements/[productId]/page.tsx)
    // allow-list ทีละ field (RSC PII rule) — ห้าม spread ...c
    items = result.items.map((c) => {
      const buyer = c.buyerUserId ? buyerMap.get(c.buyerUserId) : undefined
      const contact = c.externalContactId ? contactMap.get(c.externalContactId) : undefined
      const counterparty = buyer
        ? { displayName: buyer.displayName, avatar: buyer.avatar }
        : contact
          ? { displayName: contact.name ?? 'ผู้ติดต่อ', avatar: contact.avatarUrl ?? null }
          : null
      return {
        id: c.id,
        buyerUserId: c.buyerUserId,
        shopId: c.shopId,
        channel: c.channel,
        // shopChannelId: ใช้หา "รูปเพจ" ฝั่ง client จาก channels ที่ส่งไปด้วยกัน (ไม่ query เพิ่ม)
        shopChannelId: c.shopChannelId,
        lastMessageAt: c.lastMessageAt.toISOString(),
        lastMessagePreview: c.lastMessagePreview,
        lastSenderRole: c.lastSenderRole,
        buyerLastReadAt: c.buyerLastReadAt ? c.buyerLastReadAt.toISOString() : null,
        shopLastReadAt: c.shopLastReadAt ? c.shopLastReadAt.toISOString() : null,
        createdAt: c.createdAt.toISOString(),
        // S-7 (ตัวกรอง/จัดการเธรด) — pin indicator + badge "ปิดงานแล้ว"
        isPinned: c.isPinned,
        resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
        chatGroupId: c.chatGroupId, // โชว์ชิปโฟลเดอร์ในแถวตอนอยู่แท็บ "ทั้งหมด" (user สั่ง 2026-07-24)
        isSpam: c.isSpam, // feature 00018 — spam (user สั่ง 2026-07-24)
        // feature 00018 CRM — alias (ชื่อในแชท) + tag/สถานะขาย ของผู้ติดต่อ (badge ใน list)
        alias: c.alias,
        contactTags: contact?.tags ?? [],
        contactSalesStatus: contact?.salesStatus ?? 'UNSPECIFIED',
        counterparty,
        unreadCount: unreadMap.get(c.id) ?? 0,
        // feature 00018 E5 — ชิป `ad_id.…` ในแถว (ร้านดูได้ว่าโฆษณาไหนพาลูกค้าคนนี้มา)
        referralAdId: c.referralAdId,
        orderStage: stageMap.get(c.id) ?? null,
      }
    })
    nextCursor = result.nextCursor
  } catch (e) {
    console.error('[inbox/page] listConversationsForShop failed', e)
    loadFailed = true
  }

  if (loadFailed) {
    return <SellerErrorState />
  }

  if (items.length === 0) {
    return (
      <SellerEmptyState
        icon="message-circle"
        title="ยังไม่มีข้อความ"
        description="เมื่อลูกค้าทักแชทมาที่ร้าน จะแสดงในหน้านี้"
        // edge state: ยังไม่เคยเชื่อมช่องทางนอกเลย — CTA รองไปเชื่อม (ดู Edge states ของสเปก)
        action={hasAnyChannel ? undefined : { label: 'เชื่อม Facebook Page', href: '/settings/channels' }}
      />
    )
  }

  return (
    <>
      {/* ≥1024px: รายการแชทย้ายไปอยู่ที่ Chat Rail (เมนูซ้าย) แล้ว — ตรงกลางต้องไม่โชว์ซ้ำ
          ไม่งั้นเห็นรายการเดียวกัน 2 ที่พร้อมกัน (user เจอจริงบน prod)
          <1024px: ไม่มี rail (เมนูซ้ายถูกซ่อนทั้งระบบ) จึงต้องคงรายการไว้ที่นี่เหมือนเดิม */}
      {/* railMode: ในเลย์เอาต์ (chat) ChatHeader แสดงช่องค้นหาให้ทุกจอแล้ว (เขียนลง ChatSearchContext)
          → InboxList ต้องอ่านจาก context ไม่ render ช่องของตัวเอง ไม่งั้นมือถือเห็นช่องค้นหาซ้ำ 2 อัน
          (user เจอจริงบน prod) — prop ชื่อ railMode คงเดิม แต่ความหมายตอนนี้ = "ค้นหาอยู่ที่ header" */}
      <div className="lg:hidden">
        <InboxList
          initialItems={items}
          initialNextCursor={nextCursor}
          channels={channels}
          initialGroups={groups}
          hasShipping={hasShipping}
          shopId={shop.id}
          railMode
        />
      </div>
      {/* bug fix: ≥1024px ต้องเป็น 3 คอลัมน์ตั้งแต่หน้าแรก [rail][กลาง][ขวา] — เดิมมีแค่ 2
          (rail อยู่ที่ (chat)/layout.tsx แล้ว — ChatRail.tsx; ที่นี่คุมแค่กลาง+ขวา) ต้อง mirror
          โครง flex ของ /inbox/[conversationId]/page.tsx เป๊ะ (ไม่มี gap, ขวา w-96 shrink-0) ไม่งั้น
          เลย์เอาต์กระตุกตอนสลับหน้า — h-full: parent ({'children'} slot ของ layout.tsx) เป็น
          flex item ใน `flex min-h-0 flex-1` ที่ layout.tsx คุมความสูงที่เหลือ (100dvh ลบ header)
          ให้แล้ว ไม่ต้องคำนวณ viewport เองที่นี่อีก (ต่างจากเดิมก่อน rewrite ที่ต้องมี HR7
          carve-out คำนวณ dvh ลบ topbar-height เอง — ตอนนี้ h-full เป็น Tailwind scale ปกติ
          ไม่ใช่ arbitrary value แล้ว) */}
      <div className="hidden h-full lg:flex">
        <div className="card flex h-full min-w-0 flex-1 items-center justify-center">
          <SellerEmptyState
            compact
            icon="message-circle"
            title="เลือกบทสนทนา"
            description="เลือกรายการแชททางซ้ายมือเพื่อเริ่มอ่านและตอบข้อความ"
          />
        </div>
        <div className="h-full w-96 shrink-0">
          <div className="card flex h-full items-center justify-center">
            <SellerEmptyState
              compact
              icon="user-circle"
              title="เลือกบทสนทนาเพื่อดูข้อมูลลูกค้า"
            />
          </div>
        </div>
      </div>
    </>
  )
}
