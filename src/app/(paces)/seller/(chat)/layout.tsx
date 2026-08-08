/**
 * (chat) route group layout — หน้าแชทเต็มจอของตัวเอง (rewrite ตาม .superpowers/sdd/chat-standalone.md)
 *
 * ทำไมต้องรื้อ: ของเดิม (feat 00018) เอา Chat Rail ไป "สลับ" แทนเนื้อหาเมนูซ้าย (Sidenav) ของ
 * seller ผ่าน SidenavContent.tsx (usePathname ตัดสินโหมด) — เป็นต้นเหตุบั๊กทั้งวัน (สลับไม่ทัน
 * soft navigation, ชนกับ token --sidenav-width, การ์ดขาวทับพื้นเมนูสีเข้ม) user ตัดสินใจ: ตัด
 * Sidenav/TopBar ของ seller ออกจากหน้าแชทไปเลย ให้ /inbox* เป็นหน้าเต็มจอสีขาวของตัวเอง
 *
 * ไม่ import VerticalLayout/Sidenav/TopBar เลย — layout นี้คุมโครงเองทั้งหมด:
 *   [ChatHeader: โลโก้+ค้นหา+ธีม+ขนาดตัวอักษร+กลับหน้าหลัก]
 *   [ChatRail (rail, ≥1024px)] [{children}: เนื้อหาของ /inbox หรือ /inbox/[conversationId]]
 *
 * Base: ไม่มี Paces "standalone chat app shell" ให้ copy ตรง (theme .../apps/chat/page.tsx เอง
 * ก็ยังอยู่ใต้ layout (admin) ของ theme ที่มี sidebar/topbar ของมันเอง) — โครง shell นี้จึงอิง
 * pattern fullscreen overlay ที่มีอยู่แล้วในโปรเจกต์ (fixed inset-0/h-dvh flex-col, ไม่มี Paces
 * .page-content/.wrapper ให้พึ่ง) ดู src/app/(paces)/seller/(fullscreen)/layout.tsx (Base เดียวกัน
 * — "ไม่มี Paces fullscreen-overlay layout ตรง ๆ" เหตุผลเดียวกัน)
 *
 * Guard: เช็ค session อย่างเดียว (ไม่ login → redirect /auth/sign-in) — ตามที่ Controller ระบุ:
 * onboarding/register gate ทำที่ proxy.ts อยู่แล้ว (ครอบทุก path ของ seller subdomain ยกเว้น
 * /auth,/api,/choose-shop,/i — ไม่ยกเว้น /inbox จึงถูก gate ไปแล้วก่อนถึง layout นี้) ไม่ต้องทำซ้ำ
 * ที่นี่ (ต่างจาก (dashboard)/layout.tsx ที่ยังต้อง requireActiveShop เพราะมีเมนู/badge ที่ต้องรู้
 * shop — หน้าแชทไม่มีความจำเป็นแบบนั้น หน้า /inbox เองมี fallback SellerErrorState ถ้าไม่มีร้านอยู่แล้ว)
 *
 * ChatSearchProvider (เดิม mount ที่ VerticalLayout.tsx ครอบทุกหน้า seller โดยไม่จำเป็น — ใช้จริง
 * แค่ /inbox*) ย้ายมา mount ที่นี่แทน — ให้ ChatHeader (เขียน) กับ ChatRail/InboxList (อ่าน) ใช้
 * state ช่องค้นหาเดียวกัน ไม่มีผลกับหน้า seller อื่นอีกต่อไป (เดิมมีผลเป็น 0 อยู่แล้วเพราะไม่มีใคร
 * consume แต่ก็ยังฉีด context ลงทุกหน้าโดยไม่จำเป็น — cleanup ระหว่างทาง)
 *
 * bg-card (โทเคน Paces — ขาวโหมด light, การ์ดเข้มโหมด dark ตาม theme/paces/.../config/_root.css)
 * ไม่ hardcode ขาว ตามที่สั่ง "ต้องถูกทั้ง light และ dark mode"
 */
import { authOptions } from '@/lib/auth'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { ChatSearchProvider } from '@/context/useChatSearchContext'
import { resolveChatScope } from '@/lib/chat-scope'
import { getProductsByShop, getBestSellerProducts } from '@/services/product.service'
import { isEntitlementActive } from '@/services/inventory-entitlement.service'
import ChatHeader from './_components/ChatHeader'
import ChatRailColumn from './_components/ChatRailColumn'
import InboxTabs from './_components/InboxTabs'
import { resolveOrderVocab } from '@/lib/seller-menu'
import { prisma } from '@/lib/prisma'
import DraftOrderProvider from './_components/DraftOrderProvider'
import type { CatalogProduct } from '@/app/(paces)/seller/(dashboard)/orders/new/components/OrderCreateForm'
// feature 00024 — บล็อกวันเข้าใช้บริการในโมดัลสร้างรายการจากแชท (user request 2026-08-05)
import { canUseAppointments, type AppointmentGranularity } from '@/lib/appointments'
import { listServiceResources } from '@/services/service-resource.service'
import { listChannelsForShops } from '@/services/shop-channel.service'
import type { ServiceResourceOption } from '@/app/(paces)/seller/(dashboard)/orders/new/components/AppointmentBlock'

// map Product → CatalogProduct (เหมือน (fullscreen)/orders/new/page.tsx) — สำหรับโมดัลสร้างคำสั่งซื้อในแชท
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toCatalog = (p: any): CatalogProduct => ({
  id: p.id,
  name: p.name,
  description: p.description ?? null,
  price: Number(p.price),
  type: p.type,
  fulfillmentMode: p.fulfillmentMode,
  image: Array.isArray(p.images) && p.images.length > 0 ? `/api/files/${p.images[0]}` : null,
  sku: p.sku ?? null,
  stockQty: p.stockQty ?? null,
})

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  const user = (session as any)?.user as { id: string; activeShopId?: string | null } | undefined
  if (!session || !user?.id) redirect('/auth/sign-in')

  // resolve ร้านที่ active เพื่อส่ง shopId ให้ ChatRail → InboxList subscribe realtime
  // `chat:shop:{shopId}` (bug fix: รายการแชทไม่อัปเดตเมื่อมีข้อความใหม่ — ดู comment หัว InboxList.tsx)
  // fail-soft: resolve ไม่ได้ = null (แค่ไม่มี realtime, list/หน้าอื่นยังทำงานปกติและมี error state
  // ของตัวเองที่ inbox/page.tsx อยู่แล้ว) — ห้าม redirect/throw ที่ layout เพราะจะพังทั้งหน้าแชท
  const scope = await resolveChatScope({
    user: { id: user.id, activeShopId: user.activeShopId ?? null },
  })

  // feature 00037 — ข้อมูลร้านในขอบเขต (badge ในแถว/หัวเธรด + ตัวเลือกร้านตอนกดสร้าง) และเพจของ
  // ทุกร้าน (ตัวกรอง "เพจ" จัดกลุ่มตามร้าน). resolve ที่นี่ที่เดียวแล้วส่งลงเป็น prop — rail เดิม
  // ยิง /api/channels เอง ซึ่งเป็น endpoint ของ "ร้านที่ active" จึงไม่มีวันเห็นเพจของร้านอื่น
  let scopeShops: { id: string; name: string; logo: string | null; vertical: string }[] = []
  let scopeChannels: {
    id: string
    provider: string
    name: string
    avatarUrl: string | null
    shopId: string
    shopName: string
  }[] = []
  if (scope) {
    const [shopRows, channelRows] = await Promise.all([
      prisma.shop.findMany({
        where: { id: { in: scope.shopIds } },
        // vertical มาด้วย — คำเรียกรายการในแถว/หัวเธรดต้องผันตามร้านของเธรดนั้น ไม่ใช่ร้าน active
        select: { id: true, shopName: true, logo: true, vertical: true },
        orderBy: { shopName: 'asc' },
      }),
      listChannelsForShops(scope.shopIds).catch(() => []),
    ])
    scopeShops = shopRows.map((r) => ({ id: r.id, name: r.shopName, logo: r.logo, vertical: r.vertical }))
    scopeChannels = channelRows.map((c) => ({
      id: c.id,
      provider: c.provider,
      name: c.name,
      avatarUrl: c.avatarUrl,
      shopId: c.shopId,
      shopName: c.shopName,
    }))
  }

  // catalog สำหรับโมดัลสร้างคำสั่งซื้อในแชท (feature 00018) — fetch ครั้งเดียวที่ layout, แชร์ทุก draft
  // fail-soft: ล้มก็ยังเปิดหน้าแชทได้ (แค่ modal ไม่มีสินค้าให้เลือก จนกว่าจะรีเฟรช)
  let catalog: CatalogProduct[] = []
  let bestSellers: CatalogProduct[] = []
  let inventoryEnabled = false
  // ร้านเชื่อม iShip แล้วหรือยัง — ใช้ตัดสินว่าจะโชว์หัวข้อ "พัสดุ" ในแผงตัวกรองของ rail ไหม
  // ต้องถามที่ layout เพราะ rail อยู่ที่นี่ ไม่ใช่ที่ inbox/page.tsx (user report 2026-07-31:
  // ตัวกรอง iShip หายไปบนเดสก์ท็อป — page.tsx ส่ง prop นี้ให้ list แบบเต็มจอของมือถืออยู่แล้ว
  // แต่ rail ไม่เคยได้รับ จึงตกไปที่ค่า default = false)
  let hasShipping = false
  // feature 00030 — คำในโมดัลสร้างรายการจากแชทต้องตรงกับประเภทกิจการเหมือนหน้า /orders
  let shopVertical = ''
  // feature 00024 — บล็อก "วันเข้าใช้บริการ" ในโมดัลสร้างรายการจากแชท (user request 2026-08-05)
  // เดิมโมดัลนี้ไม่เคยส่ง 3 ค่านี้เข้า OrderCreateForm เลย บล็อกวันนัดจึงไม่มีทางโผล่ในแชท
  // ทั้งที่หน้า /orders/new เต็มจอมีมาตั้งแต่ 00024 — ร้านบริการที่ทำงานอยู่ในแชทเป็นหลัก
  // จึงปักวันที่ลูกค้าจะเข้ามาที่ร้านไม่ได้เลย ต้องออกไปเปิดหน้าใหม่
  // (ยกวิธี fetch มาจาก (fullscreen)/orders/new/page.tsx ทั้งดุ้นเพื่อให้สองทางเข้าตรงกัน)
  let serviceResourcesEnabled = false
  let serviceResources: ServiceResourceOption[] = []
  let appointmentGranularity: AppointmentGranularity = 'DAY'
  if (scope?.activeShopId) {
    const shopId = scope.activeShopId
    let shopRow: { vertical: string; appointmentGranularity: string } | null = null
    ;[catalog, bestSellers, inventoryEnabled, hasShipping, shopRow] = await Promise.all([
      getProductsByShop(shopId).then((ps) => ps.map(toCatalog)).catch(() => []),
      getBestSellerProducts(shopId, 8).then((ps) => ps.map(toCatalog)).catch(() => []),
      isEntitlementActive(shopId).catch(() => false),
      prisma.shopShippingAccount
        .findUnique({ where: { shopId }, select: { status: true } })
        .then((a) => a?.status === 'ACTIVE')
        .catch(() => false),
      prisma.shop
        .findUnique({ where: { id: shopId }, select: { vertical: true, appointmentGranularity: true } })
        .catch(() => null),
    ])
    shopVertical = shopRow?.vertical ?? ''

    // ระบบนัดหมายเปิดให้เฉพาะ vertical=SERVICE_QUEUE (BR-RSV-01) — ร้านอื่นไม่ได้รับทรัพยากรเลย
    // ฟอร์มจึงไม่ render บล็อกวันนัด DOM เหมือนก่อนมีฟีเจอร์นี้ทุกจุด
    serviceResourcesEnabled = canUseAppointments({ kind: scope.activeKind, vertical: shopVertical })
    if (serviceResourcesEnabled) {
      appointmentGranularity = (shopRow?.appointmentGranularity as AppointmentGranularity) ?? 'DAY'
      serviceResources = await listServiceResources(shopId, { activeOnly: true })
        .then((rows) =>
          rows.map((r) => ({
            id: r.id,
            name: r.name,
            durationMinutes: r.durationMinutes,
            capacity: r.capacity,
            depositMode: r.depositMode,
            depositValue: r.depositValue.toFixed(2),
          })),
        )
        .catch(() => [])
    }
  }

  /**
   * scopeKey (bug fix 2026-08-08, user report prod) — สลับ "ร้านทั้งหมด" → "ร้านนี้" แล้วเธรดของ
   * ร้านอื่นยังค้างอยู่ในรายการจนกว่าจะรีเฟรชเอง
   *
   * ต้นเหตุ: `router.refresh()` พา RSC payload ชุดใหม่มาจริง (ขอบเขตถูกต้องแล้ว) แต่ client
   * component ที่ถือรายการไว้ใน state ไม่ได้อ่าน prop ใหม่ —
   *   · InboxList เก็บ `useState(initialItems)` ซึ่งอ่าน prop แค่ตอน mount
   *   · ChatRail ยิง fetch เองใน useEffect ที่ deps = [] จึงไม่โหลดซ้ำ
   * ทั้งคู่ "ถูกต้องอยู่แล้ว" ในบริบทเดิมที่ขอบเขตไม่มีวันเปลี่ยนระหว่างอายุของ component
   *
   * แก้รอบแรกด้วย key ที่บังคับ remount ทั้งก้อน — ได้ผลแต่ล้างตัวกรอง/แท็บ/คำค้นของผู้ใช้ไปด้วย
   * (ux gate ทักว่าเป็นหนี้) รอบนี้จึงเหลือ key ไว้เฉพาะ **ตัวที่ไม่มี state ของผู้ใช้ให้เสีย**:
   *   · InboxTabs — ถือแค่ตัวเลข badge
   *   · CommentsClient — รายการโพสต์ ไม่มีตัวกรองที่ผู้ใช้ตั้งค้างไว้แบบแท็บข้อความ
   * ส่วน InboxList/ChatRail (ที่ถือตัวกรอง แท็บ คำค้น) เปลี่ยนไปโหลดใหม่เองด้วยตัวกรองเดิม
   * เมื่อขอบเขตเปลี่ยน — ดู effect `scopeSignature` ใน InboxList.tsx
   */
  const scopeKey = `${scope?.mode ?? 'none'}:${(scope?.shopIds ?? []).join(',')}`

  const shell = (
    <ChatSearchProvider>
      <div className="chat-shell flex h-dvh flex-col overflow-hidden bg-card">
        <ChatHeader chatScopeMode={scope?.storedMode ?? 'SINGLE'} />

        {/**
         * แถบแท็บ ข้อความ/ความคิดเห็น — **พาดเต็มความกว้างเหนือทุกคอลัมน์** (user เลือกเอง
         * 2026-08-04: "ซึ่งผมชอบแบบพาดเต็มความกว้างนะ" หลังเทียบสองแท็บด้วยภาพ)
         *
         * ก่อนหน้านี้ถูก render 3 ที่: ChatRail (บนสุดของคอลัมน์ rail เดสก์ท็อป), inbox/page.tsx
         * (มือถือ), comments/page.tsx (พาดเต็มความกว้าง) — ผลคือสองแท็บมีโครงไม่เหมือนกัน
         * (ฝั่งข้อความคอลัมน์กลาง/ขวาเริ่มจากขอบบน ฝั่งความคิดเห็นถูกดันลงมา) และตัวเลข badge
         * ต้องคอย sync กัน 3 ที่
         * ย้ายมาที่นี่ที่เดียว: layout เป็นเจ้าของ "โหมดของทั้งหน้า" อยู่แล้ว (มันคือสิ่งที่สลับ
         * ทั้งหน้าไม่ใช่แค่คอลัมน์เดียว) และ InboxTabs ดึงตัวเลขเองผ่าน endpoint + cache ระดับโมดูล
         * จึงไม่ต้องส่ง unansweredCount จาก server ของแต่ละหน้าอีก
         */}
        <InboxTabs key={scopeKey} shopIds={scope?.shopIds ?? []} />

        <div className="flex min-h-0 flex-1">
          {/* rail — desktop เท่านั้น (≥1024px); <1024px ไม่มีเมนูซ้ายให้แทนที่อยู่แล้ว (ตาม design
              เดิม) หน้า /inbox เองยัง render InboxList แบบ full-screen สำหรับจอเล็ก (lg:hidden
              ที่ inbox/page.tsx) เป็น duplication ที่ตั้งใจ — คนละ mode คนละ fetch (rail=client
              fetch ของตัวเอง, mobile list=SSR ของ page.tsx) ไม่ใช่ component เดียวกันที่ถูกซ่อน/โชว์ */}
          {/* xl:w-96 — เท่ากับ Customer Panel ฝั่งขวา (user request 2026-07-23) ให้ 2 คอลัมน์ข้างเท่ากัน
              lg:w-80 (320px) สำหรับช่วงแท็บเล็ต 1024-1279: ที่ความกว้างนั้นคอลัมน์ขวายังไม่โผล่
              (xl:block) แต่ rail 384px ยังกินพื้นที่มากเกินจำเป็นจนคอลัมน์แชทอึดอัด
              — bug fix 2026-08-01 จาก user report iPad Pro */}
          {/* คอลัมน์ rail ย้ายไปอยู่ใน ChatRailColumn (client) — ต้องหายทั้งคอลัมน์เมื่ออยู่แท็บ
              "ความคิดเห็น" ไม่ใช่แค่เนื้อข้างใน (bug fix 2026-08-03 user report: แท็บซ้อน 2 ชั้น)
              layout นี้เป็น server component จึงอ่าน pathname เองไม่ได้ */}
          <ChatRailColumn
            shopIds={scope?.shopIds ?? []}
            unified={scope?.mode === 'UNIFIED'}
            activeShopId={scope?.activeShopId ?? null}
            channels={scopeChannels}
            hasShipping={hasShipping}
          />

          {/* children: /inbox (empty-state 2 คอลัมน์ desktop / list เต็มจอมือถือ) หรือ
              /inbox/[conversationId] (thread + customer panel) — overflow-y-auto กันเนื้อหา
              มือถือ (list ยาว) ล้นจอ เพราะ chat-shell ปิด overflow ที่ระดับบนสุดไปแล้ว (ต้องการ
              scroll เฉพาะโซนนี้ ไม่ใช่ทั้งหน้า แบบแอปแชทจริง) desktop ไม่มีผล (เนื้อหาพอดี h-full
              อยู่แล้ว ChatThread จัดการ scroll ภายในของตัวเองต่างหาก)
              bug fix 2026-07-23 (user report prod: "scroll ในช่องแชทแล้วด้านบนขยับตลอด"):
              บน ≥1024px คอลัมน์นี้ไม่ควรเลื่อนเองเลย — เธรดกับแผงข้อมูลลูกค้าสูง h-full และมี
              scroll ภายในของตัวเองอยู่แล้ว การเปิด overflow-y-auto ทิ้งไว้ทำให้มี scroll ซ้อนชั้น
              ที่รับ scroll ต่อจากรายการข้อความ (chaining) แล้วดันเนื้อหาทั้งคอลัมน์ขยับ →
              lg:overflow-hidden. ต่ำกว่านั้น (มือถือ/แท็บเล็ต) ยังต้องเลื่อนได้เพราะรายการแชทยาว
              จริง แต่ใส่ overscroll-contain กันไม่ให้ scroll ทะลุไปถึงหน้าเว็บ/หัวแชท */}
          <div className="min-w-0 flex-1 overflow-y-auto overscroll-contain lg:overflow-hidden">{children}</div>
        </div>
      </div>
    </ChatSearchProvider>
  )

  // ห่อด้วย DraftOrderProvider เมื่อมีร้าน active — โมดัลสร้างคำสั่งซื้อ (feature 00018) ค้างข้ามแชทได้
  // เพราะ provider อยู่เหนือ {children} (route content). ไม่มีร้าน = ไม่ต้องมีโมดัล (ไม่มี catalog/shopId)
  if (!scope?.activeShopId) return shell
  return (
    <DraftOrderProvider
      shopId={scope.activeShopId}
      shops={scopeShops}
      catalog={catalog}
      bestSellers={bestSellers}
      inventoryEnabled={inventoryEnabled}
      vocab={resolveOrderVocab(shopVertical)}
      shopVertical={shopVertical}
      serviceResourcesEnabled={serviceResourcesEnabled}
      serviceResources={serviceResources}
      appointmentGranularity={appointmentGranularity}
    >
      {shell}
    </DraftOrderProvider>
  )
}
