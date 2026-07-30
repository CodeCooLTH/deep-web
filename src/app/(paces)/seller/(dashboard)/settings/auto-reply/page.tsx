/**
 * ตอบแชทอัตโนมัติ — รายการกลุ่มคำ /settings/auto-reply (feature 00023, S-13 หน้า 1)
 *
 * SSOT: docs/20 - Features/00023 - Chat Auto-Reply/{UI-DESIGN-SPEC.md §3, BRD.md §18.1, API.md}
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/ai/page.tsx (โครง RSC + PageBreadcrumb +
 *   card > card-header `bg-light/15 border-dashed` section header) ซึ่ง Base เดิมมาจาก
 *   theme/paces/Admin/TS/src/app/(admin)/apps/users/account-settings/page.tsx
 *
 * Server component — auth guard อยู่ที่ (dashboard)/layout.tsx แล้ว; อ่านผ่าน service ตรง
 * ไม่ self-fetch API ของตัวเอง (pattern เดียวกับ settings/ai และ settings/channels)
 *
 * canEdit ตัดสินจาก role (OWNER/ADMIN แก้ได้, STAFF อ่านอย่างเดียว — AC-004-01/02) แต่เป็นแค่
 * การซ่อน UI: ทุก endpoint ตรวจ role ซ้ำฝั่ง server เสมอ ไม่เชื่อค่าที่ client ส่งกลับมา
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { getConfig } from '@/services/auto-reply-config.service'
import { listKeywords } from '@/services/auto-reply-rule.service'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import AutoReplyListClient from './AutoReplyListClient'

export const metadata: Metadata = { title: 'ตอบแชทอัตโนมัติ' }

const EDITABLE_ROLES = ['OWNER', 'ADMIN']

export default async function AutoReplySettingsPage() {
  const session = await getServerSession(authOptions)
  const user = (session as { user?: { id: string; activeShopId?: string | null } } | null)?.user
  if (!user) return null

  const activeCtx = await resolveActiveShopContext({
    user: { id: user.id, activeShopId: user.activeShopId ?? null },
  })
  // defensive fallback เท่านั้น (ร้านถูกลบ/หลุดสิทธิ์กลางอากาศ) — auth guard เต็มอยู่ที่ layout
  if (!activeCtx) return null

  const [config, keywords] = await Promise.all([
    getConfig(activeCtx.shopId),
    listKeywords(activeCtx.shopId),
  ])

  return (
    <>
      <PageBreadcrumb
        title="ตอบแชทอัตโนมัติ"
        trail={[{ label: 'ตั้งค่า', href: '/settings' }, { label: 'ตอบแชทอัตโนมัติ' }]}
      />

      <AutoReplyListClient
        initialConfig={{ isEnabled: config.isEnabled }}
        initialKeywords={keywords.map((k) => ({
          id: k.id,
          name: k.name,
          matchType: k.matchType,
          priority: k.priority,
          status: k.status,
          phraseCount: k.phraseCount,
          testThreadCount: k.testThreadCount,
          ruleCount: k.ruleCount,
          updatedAt: k.updatedAt.toISOString(),
        }))}
        canEdit={EDITABLE_ROLES.includes(activeCtx.role)}
      />
    </>
  )
}
