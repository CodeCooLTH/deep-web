/**
 * ด่านร่วมของทุกหน้าบอทติดตามยอดขาย (00095 S-7) — สิทธิ์ H2 → ร้านนำร่อง + ONLINE_SALES → "เร็ว ๆ นี้"
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/auto-notify/page.tsx (gatePage + PageBreadcrumb + NoPermissionCard)
 *   theme: theme/paces/Admin/TS/src/app/(admin)/apps/users/account-settings/page.tsx
 *
 * 🛑 ลำดับสำคัญ: บทบาทไม่ถึง = NoPermissionCard (ไม่ใช่ "เร็ว ๆ นี้") · เข้า URL ตรง /new และ /[id] ของร้านที่ไม่เปิด = หน้า "เร็ว ๆ นี้" ไม่ใช่ 500/ข้อมูล (AC-FB-83)
 * 🛑 ด่านจริงของข้อมูลอยู่ที่ route/service (assertAvailable) — หน้านี้แค่ไม่ยิงบริการเมื่อรู้ว่าไม่เปิด
 */
import Link from 'next/link'
import type { ReactNode } from 'react'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import Icon from '@/components/wrappers/Icon'
import { getT } from '@/i18n/server'
import { isSalesFollowBotEnabled } from '@/lib/sales-follow-bot/gate'
import type { gatePage } from '@/lib/shop-capability'
import { viewerRolesOf } from '@/lib/viewer-roles'
import NoPermissionCard from '../../_shared/NoPermissionCard'

export type BotPageGate = { ok: true; shopId: string; t: Awaited<ReturnType<typeof getT>> } | { ok: false; node: ReactNode }

/**
 * 🛑 ผู้เรียกต้องเรียก `gatePage(session, 'H2')` ในไฟล์หน้าเอง แล้วส่งผลมาที่นี่ — ด่านสิทธิ์ของแต่ละหน้าต้องมองเห็นได้ในไฟล์หน้า
 * (route-capability-inventory.test.ts ตรวจว่าไฟล์ DECLARED เรียก guard ตรง cap · layout/helper ไม่นับ)
 */
export async function gateBotPage(session: object | null, gate: Awaited<ReturnType<typeof gatePage>>): Promise<BotPageGate> {
  const t = await getT()
  if (!(session as { user?: unknown } | null)?.user) return { ok: false, node: null }
  if (!gate.ok && gate.reason === 'FORBIDDEN_ROLE') {
    return {
      ok: false,
      node: (
        <>
          <PageBreadcrumb title={t.salesFollowBot.pageTitle} homeLabel={t.common.home} />
          <NoPermissionCard capability="H2" viewerRoles={await viewerRolesOf(session)} />
        </>
      ),
    }
  }
  if (!gate.ok) return { ok: false, node: null }

  const shop = gate.active.shop
  if (!isSalesFollowBotEnabled(shop.id) || shop.vertical !== 'ONLINE_SALES') {
    return {
      ok: false,
      node: (
        <>
          <PageBreadcrumb title={t.salesFollowBot.pageTitle} homeLabel={t.common.home} trail={[{ label: t.salesFollowBot.breadcrumbSettings, href: '/settings' }]} />
          <ComingSoon title={t.salesFollowBot.notAvailableTitle} body={t.salesFollowBot.notAvailableBody} cta={t.salesFollowBot.backToSettings} href="/settings" />
        </>
      ),
    }
  }
  return { ok: true, shopId: shop.id, t }
}

/** การ์ด + empty state โครงเดียวกับ AutoNotifyClient (ไม่ใช้ coming-soon ของธีม: มีตัวนับถอยหลัง/ข้อความไล่สี/ช่องอีเมลที่ไม่มีระบบรองรับ — UX §5) */
export function ComingSoon({ title, body, cta, href }: { title: string; body: string; cta: string; href: string }) {
  return (
    <div className="card">
      <div className="card-body">
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Icon icon="target-arrow" className="text-default-700 size-8" aria-hidden="true" />
          <h4 className="text-default-900 text-sm font-medium">{title}</h4>
          <p className="text-default-700 max-w-md text-sm">{body}</p>
          <Link href={href} className="btn border-default-300 text-default-800 mt-2 min-h-11 border lg:min-h-0">
            {cta}
          </Link>
        </div>
      </div>
    </div>
  )
}
