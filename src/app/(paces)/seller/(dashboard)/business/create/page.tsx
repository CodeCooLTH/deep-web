/**
 * /business/create — สร้าง Business ใหม่ (owner ที่มี subscription ACTIVE + ยังไม่เต็มโควตา)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/pages/pricing/page.tsx
 *   (gate/empty-state card shell: card > card-body p-7.5 text-center > title/subtitle > CTA area px-15 pt-3.75 pb-7.5)
 * In-app precedent (chase เดียวกัน — ดู Base line ของไฟล์เหล่านี้เอง):
 *   - src/app/(paces)/seller/(dashboard)/inventory/page.tsx + .../inventory/components/InventoryGate.tsx
 *     (gate-before-form pattern: NOT_SUBSCRIBED/LOCKED → adapt เป็น NO_ACTIVE_PACKAGE/QUOTA_EXCEEDED ของ feature นี้;
 *     TFR-007 "gate ไม่ leak data" — return ก่อน query อื่นใด)
 *   - src/app/(paces)/seller/(fullscreen)/products/new-v2/page.tsx (empty-state "ยังไม่มีร้านค้า" card, บรรทัด 41-60)
 * Design Spec: docs/superpowers/specs/2026-07-02-00008-business-ui-design-spec.md §3
 *
 * Gate logic (TFR-006 mirror, read-only — ห้าม mutate ที่นี่):
 *   1. session guard → ไม่ login → /auth/sign-in
 *   2. subscription = getSubscriptionStatus(ownerId); ไม่มี/ไม่ ACTIVE → gate การ์ด "ยังไม่มีแพ็กเกจ ACTIVE"
 *   3. count = จำนวน Business shop (kind=BUSINESS, deletedAt=null) ของ owner (รวม LOCKED ตาม TFR-006 ข้อ 2)
 *      >= maxBusinesses (tier ปัจจุบัน) → gate การ์ด "ครบโควตาธุรกิจ"
 *   4. ผ่านทั้งคู่ → redirect ไป /business?create=1 (modal 4 ขั้นทับหน้ารายการ — feature 00030)
 */

import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { shouldHidePayments } from '@/lib/app-shell-server'
import Link from 'next/link'
import type { Metadata } from 'next'
import Icon from '@/components/wrappers/Icon'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getSubscriptionStatus } from '@/services/business-package.service'
import { BUSINESS_PACKAGE_TIER_CONFIG, type BusinessPackageTier } from '@/lib/business-package'
import PageBreadcrumb from '@/components/PageBreadcrumb'

export const metadata: Metadata = { title: 'สร้างธุรกิจใหม่' }

export default async function CreateBusinessPage() {
  /**
   * 🛑 เปิดจากในแอป iOS → เด้งกลับ (App Store Guideline 3.1.1)
   *
   * หน้านี้เป็นทางเข้าที่ **มองเห็นได้จริงในแอป**: เมนูสลับบัญชีมีปุ่ม "สร้างธุรกิจใหม่" ชี้มาที่นี่
   * และเมื่อยังไม่มีแพ็กเกจ/โควตาเต็ม หน้านี้แสดงการ์ด "สมัครแพ็กเกจ Business ก่อน" พร้อมปุ่ม
   * **"ไปเลือกแพ็กเกจ"** ซึ่งเป็นคำเชิญให้ซื้อตรงตัว — ข้อที่เคยโดนตีกลับมาแล้ว 2026-08-04
   *
   * `/business` กับ `/subscriptions` กันไว้ตั้งแต่รอบนั้น แต่ route นี้เป็นคนละไฟล์จึงหลุดมา
   * (layout ของ (dashboard) กรองแค่ "เมนู" ไม่ได้กันทั้งซับทรี)
   */
  if (await shouldHidePayments()) redirect('/dashboard')

  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) redirect('/auth/sign-in')

  const ownerId = user.id as string

  // 1. subscription — fail-closed: error ใด ๆ ระหว่าง resolve ถือว่าไม่ ACTIVE (กันฟอร์มเปิดผิดพลาด)
  let sub: Awaited<ReturnType<typeof getSubscriptionStatus>> = null
  try {
    sub = await getSubscriptionStatus(ownerId)
  } catch {
    sub = null
  }

  if (!sub || sub.status !== 'ACTIVE') {
    return (
      <>
        <PageBreadcrumb title="สร้างธุรกิจใหม่" trail={[{ label: 'ธุรกิจ', href: '/business' }]} />
        <GateCard
          icon="lock"
          title="ยังไม่มีแพ็กเกจ ACTIVE"
          description="สมัครแพ็กเกจ Business ก่อน ถึงจะสร้างธุรกิจเพิ่มได้"
          ctaLabel="ไปเลือกแพ็กเกจ"
        />
      </>
    )
  }

  // 2. quota — TFR-006 ข้อ 2: นับเฉพาะที่ยังไม่ soft-deleted แต่รวม LOCKED (locked ≠ deleted ยังกินโควตาอยู่)
  const tier = sub.tier as BusinessPackageTier
  const maxBusinesses = BUSINESS_PACKAGE_TIER_CONFIG[tier].maxBusinesses
  let count = 0
  try {
    count = await prisma.shop.count({ where: { userId: ownerId, kind: 'BUSINESS', deletedAt: null } })
  } catch {
    count = maxBusinesses ?? 0 // fail-closed: นับไม่ได้ = ถือว่าเต็มโควตา
  }

  if (maxBusinesses !== null && count >= maxBusinesses) {
    return (
      <>
        <PageBreadcrumb title="สร้างธุรกิจใหม่" trail={[{ label: 'ธุรกิจ', href: '/business' }]} />
        <GateCard
          icon="building-store"
          title={`ครบโควตาธุรกิจ (${count}/${maxBusinesses})`}
          description="อัพเกรดแพ็กเกจเพื่อเปิดธุรกิจเพิ่ม"
          ctaLabel="อัพเกรดแพ็กเกจ"
        />
      </>
    )
  }

  /**
   * feature 00030 — ผ่าน gate แล้วส่งไปเปิด modal ทับหน้ารายการธุรกิจแทนการ render ฟอร์มที่นี่
   * (user สั่ง 2026-08-04: "เป็น Modal หลังเบลอ"). คง route นี้ไว้ไม่ลบ เพราะ:
   *   - ลิงก์/บุ๊กมาร์กเดิมยังใช้ได้
   *   - gate ฝั่ง server (แพ็กเกจ ACTIVE + โควตา) ยังทำงานที่นี่เหมือนเดิมทุกบรรทัด
   *     ถ้าไม่ผ่านจะเห็น GateCard ที่อธิบายเหตุผล ไม่ใช่เด้งไปหน้าอื่นแล้วงงว่าทำไมเปิดไม่ได้
   */
  redirect('/business?create=1')
}

/** GateCard — empty-state ก่อนฟอร์ม (Base: theme pricing/page.tsx card>card-body p-7.5 text-center) */
function GateCard({
  icon,
  title,
  description,
  ctaLabel,
}: {
  icon: string
  title: string
  description: string
  ctaLabel: string
}) {
  return (
    <div className="card mx-auto max-w-md rounded-md">
      <div className="card-body p-7.5 text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-warning/15 text-warning">
            <Icon icon={icon} className="size-7" aria-hidden="true" />
          </div>
        </div>
        <h3 className="mb-1.25 text-xl font-bold">{title}</h3>
        <p className="text-default-400">{description}</p>
      </div>
      <div className="px-15 pt-3.75 pb-7.5">
        <Link
          href="/business"
          className="btn bg-primary text-white hover:bg-primary-hover inline-flex w-full items-center justify-center gap-1.5"
        >
          {ctaLabel}
          <Icon icon="chevron-right" className="text-base" aria-hidden="true" />
        </Link>
      </div>
    </div>
  )
}
