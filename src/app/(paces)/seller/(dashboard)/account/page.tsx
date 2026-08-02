/**
 * /account — ข้อมูลส่วนตัว + วิธีเข้าสู่ระบบ ของ "ตัวคน" (feature 00026 B)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/users/account-settings/page.tsx
 *   — card + card-header border-dashed section header pattern (เดียวกับที่ /settings ใช้อยู่)
 *
 * เส้นแบ่งที่สำคัญที่สุดของหน้านี้ (user ย้ำเอง 2026-08-02):
 *   "ถ้าผมอยู่ร้าน BT, ธนภัทร ก็ต้องตั้ง Profile account ของตัวเองได้"
 * → resolve จาก session.user.id เท่านั้น ห้ามเรียก requireActiveShop / อ่าน activeShopId
 *   ห้ามแสดงชื่อร้าน โลโก้ร้าน หรือ badge ร้านที่ active — ไม่งั้นหน้านี้จะกลายเป็นฝาแฝดของ /shop
 *   ซึ่งเป็นต้นเหตุที่ผู้ใช้หา "การตั้งค่าของตัวเอง" ไม่เจอตั้งแต่แรก
 *
 * Server component — auth guard อยู่ที่ (dashboard)/layout.tsx แล้ว
 * ส่งเฉพาะ boolean linked status ลง client (ห้าม serialize providerAccountId/accessToken — RSC PII rule)
 */

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import type { Metadata } from 'next'
import { ConnectedAccountsClient } from '../settings/ConnectedAccountsClient'
import ProfileForm from './components/ProfileForm'

export const metadata: Metadata = { title: 'ข้อมูลส่วนตัว' }

export default async function AccountPage() {
  const session = await getServerSession(authOptions)
  const sessionUser = (session as { user?: { id: string } } | null)?.user
  if (!sessionUser) return null

  const [accounts, dbUser] = await Promise.all([
    // select เฉพาะ provider — กันส่ง providerAccountId/accessToken เข้า RSC flight
    prisma.authAccount.findMany({ where: { userId: sessionUser.id }, select: { provider: true } }),
    prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { displayName: true, username: true, avatar: true, email: true, phone: true, passwordHash: true },
    }),
  ])
  if (!dbUser) return null

  const linkedProviders = new Set(accounts.map((a) => a.provider))

  return (
    <>
      <PageBreadcrumb title="ข้อมูลส่วนตัว" trail={[{ label: 'ภาพรวม' }]} />

      {/* สัญญาณชั้นที่ 1 (จุดแรกที่สายตาเห็น) ว่าหน้านี้ไม่ผูกกับร้าน */}
      <p className="text-default-500 -mt-2 mb-4 text-sm">
        ข้อมูลนี้เป็นของคุณโดยตรง ไม่ใช่ของร้าน — เหมือนกันไม่ว่าจะสลับไปร้านไหน
      </p>

      <ProfileForm
        user={{
          displayName: dbUser.displayName,
          username: dbUser.username,
          avatar: dbUser.avatar,
          email: dbUser.email,
          phone: dbUser.phone,
        }}
      />

      <div className="card mt-4">
        <div className="card-header">
          <h5 className="bg-light/15 border-default-300 flex items-center gap-1.5 rounded border border-dashed p-1.25 text-sm font-medium w-full justify-center">
            วิธีเข้าสู่ระบบ
          </h5>
        </div>

        {/* ย้ายมาจาก /settings ทั้งก้อน (user เคาะ Path A 2026-08-02) — เนื้อในผูกกับ user ไม่ผูกร้าน
            อยู่ในกลุ่มเมนู "ร้านค้า" มาตลอดจึงไม่มีใครหาเจอ. component เดิมไม่แก้ ใช้ตามที่มี */}
        <ConnectedAccountsClient
          facebookLinked={linkedProviders.has('FACEBOOK')}
          lineLinked={linkedProviders.has('LINE')}
          instagramLinked={linkedProviders.has('INSTAGRAM')}
          hasPassword={dbUser.passwordHash != null}
        />
      </div>
    </>
  )
}
