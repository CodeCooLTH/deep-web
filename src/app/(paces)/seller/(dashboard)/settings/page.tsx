/**
 * Settings page — การจัดส่งของร้าน (feature 00022 iShip)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/users/account-settings/page.tsx
 *   — card + card-header border-dashed section header pattern
 *
 * Server component — auth guard อยู่ที่ (dashboard)/layout.tsx แล้ว
 * ส่งเฉพาะ boolean linked status ลง client component (ห้าม serialize PII ดิบ — RSC PII rule)
 */

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import type { Metadata } from 'next'
import ShippingSettingsRow from './ShippingSettingsRow'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { getConnection } from '@/services/iship.service'

export const metadata: Metadata = { title: 'การจัดส่ง' }

// ไม่ต้องตั้ง force-dynamic — getServerSession อ่าน cookie ทำให้หน้า dynamic อยู่แล้ว
// (เหมือน badges/page.tsx — force-dynamic บน Paces child ทำ MenuToggler crash)

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)
  const user = (session as { user?: { id: string } } | null)?.user
  if (!user) return null

  // feature 00022 — การ์ดทางเข้าหน้าตั้งค่าการจัดส่ง
  // แสดงเฉพาะร้าน vertical = GENERAL: ร้านบ้านพักไม่มีพัสดุให้ส่ง การมีเมนูค้างอยู่
  // คือความรกที่ทำให้เจ้าของที่พักสงสัยว่าต้องไปตั้งค่าอะไรหรือเปล่า (BR-ISHIP-01)
  const activeCtx = await resolveActiveShopContext({
    user: { id: user.id, activeShopId: (user as { activeShopId?: string | null }).activeShopId ?? null },
  })
  const shop = activeCtx
    ? await prisma.shop.findUnique({
        where: { id: activeCtx.shopId },
        select: { vertical: true },
      })
    : null
  const showShipping = shop?.vertical === 'GENERAL'
  const connection = showShipping && activeCtx ? await getConnection(activeCtx.shopId) : null

  // ค่าตั้งต้นดึงมาพร้อมหน้าเลย (ไม่ lazy) — โมดัลตั้งค่าจะได้เปิดแล้วเห็นข้อมูลทันที
  // ไม่มี spinner คั่น; เป็นข้อมูลของร้านเอง ไม่ใช่ PII ลูกค้า จึงไม่ติดกฎ neutralize-at-source
  const shippingSettings =
    connection?.connected && activeCtx
      ? await (await import('@/services/iship.service')).getSettings(activeCtx.shopId)
      : null

  // ส่งเฉพาะข้อมูลที่ต้องใช้แสดงผล — ไม่มี token ในนี้ทุกกรณี (view type ของ service
  // ไม่มี field token ตั้งแต่ระดับ type) หน้า seller อยู่ใต้ client layout → ทุกอย่างที่ส่ง
  // ถูก serialize เข้า flight payload
  const shipping = connection && {
    connected: connection.connected,
    status: connection.status,
    tokenLast4: connection.tokenLast4,
    lastVerifiedAt: connection.lastVerifiedAt?.toISOString() ?? null,
    senderComplete: connection.senderComplete,
    settingsComplete: connection.settingsComplete,
    createMode: connection.createMode,
  }
  const isOwner = activeCtx?.role === 'OWNER'

  return (
    <>
      <PageBreadcrumb title="การจัดส่ง" trail={[{ label: 'ภาพรวม' }]} />

      {showShipping && shipping && (
        <div className="card mb-4">
          <div className="card-header">
            <h5 className="bg-light/15 border-default-300 flex items-center gap-1.5 rounded border border-dashed p-1.25 text-sm font-medium w-full justify-center">
              การจัดส่ง
            </h5>
          </div>
          <div className="card-body">
            {/* user request 2026-07-29: ยกเลิกหน้า /settings/shipping — ทุก action อยู่ที่แถวนี้
                ผ่านโมดัลแยกตามงาน (เชื่อมต่อ / เรียกรถ / ตั้งค่า 3 แท็บ) */}
            <ShippingSettingsRow
              isOwner={isOwner}
              initialConnection={shipping}
              initialSettings={shippingSettings}
            />
          </div>
        </div>
      )}

      {/* feature 00026 (user เคาะ 2026-08-02): การ์ด "บัญชีที่เชื่อมต่อ" (วิธี login ของ user)
          ย้ายไป /account แล้ว — มันผูกกับ "ตัวคน" ไม่ผูกกับร้าน การวางไว้ในกลุ่มเมนู "ร้านค้า"
          ทำให้ไม่มีใครหาเจอ (user รายงานเองว่าอยากได้ฟีเจอร์ที่มีอยู่แล้ว)
          หน้านี้จึงเหลือเฉพาะเรื่องของร้าน = การจัดส่ง */}
      {!showShipping && (
        <div className="card">
          <div className="card-body text-center">
            <div className="mb-3 flex justify-center">
              <div className="bg-primary/15 text-primary flex size-14 items-center justify-center rounded-full">
                {/* inline SVG (tabler truck-delivery) — server component ใช้ Icon wrapper
                    ที่ห่อ @iconify/react ไม่ได้ ตามคอมเมนต์เดิมของไฟล์นี้ */}
                <svg xmlns="http://www.w3.org/2000/svg" width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                  <path d="M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
                  <path d="M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
                  <path d="M5 17h-2v-11a1 1 0 0 1 1 -1h9v12m-4 0h6m4 0h2v-6h-8m0 -5h5l3 5" />
                </svg>
              </div>
            </div>
            <h5 className="mb-1 text-base font-semibold">ร้านนี้ยังไม่มีการตั้งค่าการจัดส่ง</h5>
            <p className="text-default-400 text-sm">
              การเชื่อมต่อขนส่งใช้ได้กับร้านที่ขายสินค้าจัดส่งเท่านั้น
            </p>
          </div>
        </div>
      )}
    </>
  )
}
