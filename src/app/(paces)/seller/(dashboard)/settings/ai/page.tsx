/**
 * ตั้งค่าผู้ช่วยร่างคำตอบ AI — /settings/ai (feature 00019 + extension 2026-07-29 usage-limit)
 *
 * SSOT: docs/20 - Features/00019 - AI Reply Assistant/{BRD.md FR-001..FR-003, API.md §4.1,
 *   EXTENSIONS-2026-07-29-usage-limit.md FR-AIQ-09}
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/channels/page.tsx (โครง RSC + PageBreadcrumb +
 *   card > card-header `bg-light/15 border-dashed` section header) ซึ่ง Base เดิมมาจาก
 *   theme/paces/Admin/TS/src/app/(admin)/apps/users/account-settings/page.tsx
 *
 * Server component — auth guard อยู่ที่ (dashboard)/layout.tsx แล้ว; อ่านการตั้งค่าผ่าน service ตรง
 * ไม่ self-fetch API ของตัวเอง (pattern เดียวกับ channels/page.tsx และ inbox/page.tsx)
 *
 * canEdit ตัดสินจาก role ที่ resolveActiveShopContext คืนมา (OWNER/ADMIN แก้ได้, STAFF อ่านอย่างเดียว
 * — BR-AI-02) แต่เป็นแค่การซ่อน UI: ฝั่ง PUT ตรวจ role ซ้ำเสมอ ไม่เชื่อค่าที่ client ส่งกลับมา
 *
 * isPaidPlan resolve ที่ server ด้วย isOwnerPaidPlan(shopId) (contract จาก
 * src/services/ai-suggest-quota.service.ts — เจ้าของ backend dev คนละคน) แล้วส่งเป็น prop ลง
 * AiSettingForm เท่านั้น — ห้ามให้ client ยิงเช็คเอง (FR-AIQ-09 หมายเหตุ implement)
 *
 * subscriptionLapsed: เช็คแยกจาก isOwnerPaidPlan เพราะ contract นั้นคืนแค่ boolean — ต้อง query
 * เจ้าของร้าน (Shop.userId) แล้วอ่านสถานะจริงผ่าน getSubscriptionStatus (service เดิม มีอยู่แล้ว
 * จาก feature 00008) เพื่อแยก "ไม่เคยสมัคร" กับ "เคยสมัครแต่ LOCKED_RENEWAL_FAILED" — ใช้เลือก
 * ข้อความ badge เท่านั้น (ไม่ใช่ security gate) — query พังไม่ crash หน้า (fail → false, เหมือน
 * ไม่เคยสมัคร ซึ่งเป็นข้อความที่ conservative กว่า)
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { getAiSetting } from '@/services/ai-setting.service'
import { isOwnerPaidPlan } from '@/services/ai-suggest-quota.service'
import { getSubscriptionStatus } from '@/services/business-package.service'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import Icon from '@/components/wrappers/Icon'
import AiSettingForm from './AiSettingForm'

export const metadata: Metadata = { title: 'ผู้ช่วยร่างคำตอบ AI' }

const EDITABLE_ROLES = ['OWNER', 'ADMIN']

export default async function AiSettingsPage() {
  const session = await getServerSession(authOptions)
  const user = (session as { user?: { id: string; activeShopId?: string | null } } | null)?.user
  if (!user) return null

  const activeCtx = await resolveActiveShopContext({ user: { id: user.id, activeShopId: user.activeShopId ?? null } })
  // defensive fallback เท่านั้น (ร้านถูกลบ/หลุดสิทธิ์กลางอากาศ) — auth guard เต็มอยู่ที่ layout แล้ว
  if (!activeCtx) return null

  const setting = await getAiSetting(activeCtx.shopId)
  const canEdit = EDITABLE_ROLES.includes(activeCtx.role)

  // isPaidPlan — เช็คก่อนเสมอ (BR-AIQ-12) ด้วย contract function ของ backend dev
  let isPaidPlan = false
  try {
    isPaidPlan = await isOwnerPaidPlan(activeCtx.shopId)
  } catch {
    isPaidPlan = false // fail-closed — เช็คไม่ได้ = ไม่ใช่ paid plan (NFR-AIQ-Consistency)
  }

  // subscriptionLapsed — แยกคนละ query จาก isOwnerPaidPlan (ตัดสินแค่ข้อความ badge ไม่ใช่ gate จริง)
  let subscriptionLapsed = false
  if (!isPaidPlan) {
    try {
      const shop = await prisma.shop.findUnique({ where: { id: activeCtx.shopId }, select: { userId: true } })
      const subscription = shop ? await getSubscriptionStatus(shop.userId) : null
      subscriptionLapsed = subscription?.status === 'LOCKED_RENEWAL_FAILED'
    } catch {
      subscriptionLapsed = false // fail → ถือว่า "ไม่เคยสมัคร" (ข้อความ "อัพเกรดแพ็กเกจ" เป็นค่า conservative กว่า)
    }
  }

  return (
    <>
      <PageBreadcrumb
        title="ผู้ช่วยร่างคำตอบ AI"
        trail={[{ label: 'ตั้งค่า', href: '/settings' }, { label: 'ผู้ช่วยร่างคำตอบ AI' }]}
      />

      <div className="card">
        <div className="card-header">
          <h5 className="bg-light/15 border-default-300 flex w-full items-center justify-center gap-1.5 rounded border border-dashed p-1.25 text-sm uppercase">
            <Icon icon="sparkles" className="text-base" aria-hidden="true" />
            ผู้ช่วยร่างคำตอบ AI
          </h5>
        </div>

        <AiSettingForm
          initial={{
            instruction: setting.instruction,
            includeProductContext: setting.includeProductContext,
            includeCustomerContext: setting.includeCustomerContext,
            includeMediaContext: setting.includeMediaContext,
          }}
          canEdit={canEdit}
          isPaidPlan={isPaidPlan}
          subscriptionLapsed={subscriptionLapsed}
        />
      </div>
    </>
  )
}
