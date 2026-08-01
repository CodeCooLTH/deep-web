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
import { resolveActiveShopContext } from '@/lib/shop-context'
import { getProductsByShop, getBestSellerProducts } from '@/services/product.service'
import { isEntitlementActive } from '@/services/inventory-entitlement.service'
import ChatHeader from './_components/ChatHeader'
import ChatRail from './_components/ChatRail'
import { prisma } from '@/lib/prisma'
import DraftOrderProvider from './_components/DraftOrderProvider'
import type { CatalogProduct } from '@/app/(paces)/seller/(dashboard)/orders/new/components/OrderCreateForm'

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
  const activeCtx = await resolveActiveShopContext({
    user: { id: user.id, activeShopId: user.activeShopId ?? null },
  })

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
  if (activeCtx?.shopId) {
    const shopId = activeCtx.shopId
    ;[catalog, bestSellers, inventoryEnabled, hasShipping] = await Promise.all([
      getProductsByShop(shopId).then((ps) => ps.map(toCatalog)).catch(() => []),
      getBestSellerProducts(shopId, 8).then((ps) => ps.map(toCatalog)).catch(() => []),
      isEntitlementActive(shopId).catch(() => false),
      prisma.shopShippingAccount
        .findUnique({ where: { shopId }, select: { status: true } })
        .then((a) => a?.status === 'ACTIVE')
        .catch(() => false),
    ])
  }

  const shell = (
    <ChatSearchProvider>
      <div className="chat-shell flex h-dvh flex-col overflow-hidden bg-card">
        <ChatHeader />

        <div className="flex min-h-0 flex-1">
          {/* rail — desktop เท่านั้น (≥1024px); <1024px ไม่มีเมนูซ้ายให้แทนที่อยู่แล้ว (ตาม design
              เดิม) หน้า /inbox เองยัง render InboxList แบบ full-screen สำหรับจอเล็ก (lg:hidden
              ที่ inbox/page.tsx) เป็น duplication ที่ตั้งใจ — คนละ mode คนละ fetch (rail=client
              fetch ของตัวเอง, mobile list=SSR ของ page.tsx) ไม่ใช่ component เดียวกันที่ถูกซ่อน/โชว์ */}
          {/* xl:w-96 — เท่ากับ Customer Panel ฝั่งขวา (user request 2026-07-23) ให้ 2 คอลัมน์ข้างเท่ากัน
              lg:w-80 (320px) สำหรับช่วงแท็บเล็ต 1024-1279: ที่ความกว้างนั้นคอลัมน์ขวายังไม่โผล่
              (xl:block) แต่ rail 384px ยังกินพื้นที่มากเกินจำเป็นจนคอลัมน์แชทอึดอัด
              — bug fix 2026-08-01 จาก user report iPad Pro */}
          <div className="hidden shrink-0 flex-col border-e border-default-200 lg:flex lg:w-80 xl:w-96">
            <ChatRail shopId={activeCtx?.shopId ?? null} hasShipping={hasShipping} />
          </div>

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
  if (!activeCtx?.shopId) return shell
  return (
    <DraftOrderProvider
      shopId={activeCtx.shopId}
      catalog={catalog}
      bestSellers={bestSellers}
      inventoryEnabled={inventoryEnabled}
    >
      {shell}
    </DraftOrderProvider>
  )
}
