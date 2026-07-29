/**
 * Settings page — บัญชีที่เชื่อมต่อ (FR-LO-16)
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
import { ConnectedAccountsClient } from './ConnectedAccountsClient'
import ShippingSettingsRow from './ShippingSettingsRow'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { getConnection } from '@/services/iship.service'

export const metadata: Metadata = { title: 'บัญชีที่เชื่อมต่อ' }

// ไม่ต้องตั้ง force-dynamic — getServerSession อ่าน cookie ทำให้หน้า dynamic อยู่แล้ว
// (เหมือน badges/page.tsx — force-dynamic บน Paces child ทำ MenuToggler crash)

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)
  const user = (session as { user?: { id: string } } | null)?.user
  if (!user) return null

  // ดึง AuthAccount + passwordHash — mask เป็น boolean ก่อนส่ง client
  // ทำไม select เฉพาะ provider: กันส่ง providerAccountId/accessToken เข้า RSC flight
  const [accounts, dbUser] = await Promise.all([
    prisma.authAccount.findMany({
      where: { userId: user.id },
      select: { provider: true },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    }),
  ])

  // ทำไม Set: O(1) lookup ตอน render provider rows ข้างล่าง
  const linkedProviders = new Set(accounts.map((a) => a.provider))

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
      <PageBreadcrumb title="บัญชีที่เชื่อมต่อ" trail={[{ label: 'ภาพรวม' }]} />

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

      <div className="card">
        {/* section header — Paces border-dashed pattern จาก account-settings theme */}
        <div className="card-header">
          <h5 className="bg-light/15 border-default-300 flex items-center gap-1.5 rounded border border-dashed p-1.25 text-sm font-medium w-full justify-center">
            {/* icon link — Paces Icon wrapper ไม่ used ที่นี่ (server component — ใช้ svg inline แทน) */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
              <path d="M10 14a3.5 3.5 0 0 0 5 0l4 -4a3.5 3.5 0 0 0 -5 -5l-1.5 1.5" />
              <path d="M14 10a3.5 3.5 0 0 0 -5 0l-4 4a3.5 3.5 0 0 0 5 5l1.5 -1.5" />
            </svg>
            บัญชีที่เชื่อมต่อ
          </h5>
        </div>

        {/* ConnectedAccountsClient รับ boolean props เท่านั้น — ไม่มี PII */}
        <ConnectedAccountsClient
          facebookLinked={linkedProviders.has('FACEBOOK')}
          lineLinked={linkedProviders.has('LINE')}
          instagramLinked={linkedProviders.has('INSTAGRAM')}
          hasPassword={dbUser?.passwordHash != null}
        />
      </div>
    </>
  )
}
