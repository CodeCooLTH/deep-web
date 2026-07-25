/**
 * ตั้งค่าผู้ช่วยร่างคำตอบ AI — /settings/ai (feature 00019)
 *
 * SSOT: docs/20 - Features/00019 - AI Reply Assistant/{BRD.md FR-001..FR-003, API.md §4.1}
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
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { getAiSetting } from '@/services/ai-setting.service'
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
        />
      </div>
    </>
  )
}
