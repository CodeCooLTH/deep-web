/**
 * /i/[slug] — landing page ของลิงก์เชิญพนักงาน (feature 00012, Task 4.2)
 *
 * Base: shell = theme/paces/Admin/TS/src/app/auth/card/sign-in/page.tsx (ผ่าน AuthCardShell
 *   ที่ copy ไว้แล้วที่ src/app/(paces)/seller/auth/components/AuthCardShell.tsx — reuse ตรง ๆ
 *   ตาม UX spec, ไม่สร้าง shell ใหม่)
 * UX spec: docs/superpowers/specs/2026-07-04-shop-staff-invite-link-ux-spec.md (Screen 2)
 *
 * เป็น direct seller route (นอก (dashboard)/(fullscreen)) — ใช้ AuthCardShell เอง เหมือนหน้า auth/onboarding
 * proxy.ts ยกเว้น needsOnboarding force-redirect ให้ path `/i/` แล้ว (feature 00012 บรรทัด proxy)
 *
 * resolveInviteLink คืน valid:false ไม่แยก reason ที่หน้านี้ (ตาม design — ไม่ leak เหตุผล invalid ให้ user)
 */

import { getServerSession } from 'next-auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { authOptions } from '@/lib/auth'
import { checkApiRateLimit } from '@/lib/api-rate-limit'
import { resolveInviteLink } from '@/services/invite-link.service'
import AuthCardShell from '@/app/(paces)/seller/auth/components/AuthCardShell'
import InviteLandingClient from './components/InviteLandingClient'

export const metadata: Metadata = { title: 'คำเชิญเข้าร้าน' }

interface InviteLandingPageProps {
  params: Promise<{ slug: string }>
}

export default async function InviteLandingPage({ params }: InviteLandingPageProps) {
  const { slug } = await params

  // rate-limit per-IP กัน slug enumeration (RSC page ไม่ผ่าน guardApi ใน proxy ที่ครอบเฉพาะ /api) —
  // keyspace 62^12 ก็จริง แต่กัน brute-force ถี่ ๆ ไว้ชั้นหนึ่ง; เกิน limit → หน้า invalid กลาง ๆ (ไม่ leak)
  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown'
  if (!checkApiRateLimit(`i-page:${ip}`, 60, 60_000)) redirect('/i/invalid')

  const result = await resolveInviteLink(slug)
  if (!result.valid) redirect('/i/invalid')

  const session = await getServerSession(authOptions)
  const hasSession = Boolean((session as any)?.user?.id)

  return (
    <AuthCardShell>
      <InviteLandingClient
        shopName={result.shopName ?? ''}
        shopLogo={result.shopLogo ?? null}
        slug={slug}
        hasSession={hasSession}
      />
    </AuthCardShell>
  )
}
