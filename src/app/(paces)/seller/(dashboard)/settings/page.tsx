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

  return (
    <>
      <PageBreadcrumb title="บัญชีที่เชื่อมต่อ" trail={[{ label: 'ภาพรวม' }]} />

      <div className="card">
        {/* section header — Paces border-dashed pattern จาก account-settings theme */}
        <div className="card-header">
          <h5 className="bg-light/15 border-default-300 flex items-center gap-1.5 rounded border border-dashed p-1.25 text-sm uppercase w-full justify-center">
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
