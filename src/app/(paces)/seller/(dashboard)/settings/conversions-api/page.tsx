/**
 * Conversions API — รายการเพจ Messenger + สวิตช์ส่งเหตุการณ์ให้ Meta (feature 00089 หน้า 1) · เจ้าของร้านเท่านั้น (X9)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/users/account-settings/page.tsx (shell + PageBreadcrumb)
 *   + src/app/(paces)/seller/(dashboard)/settings/tags/page.tsx (gatePage + NoPermissionCard + subtitle)
 *
 * + การ์ด audience (00092): Base: theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx ผ่าน components/AudienceCard.tsx
 *
 * ฟีเจอร์ปิด/ร้านนอกรายชื่อทดลอง = notFound() (ไม่ใช่การ์ดไม่มีสิทธิ์ — ร้านต้องไม่รู้ว่าฟีเจอร์มีอยู่ · FR-001)
 * เรียก service ตรง ไม่ผ่าน API (RSC)
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'

import PageBreadcrumb from '@/components/PageBreadcrumb'
import { getT } from '@/i18n/server'
import { authOptions } from '@/lib/auth'
import { isMetaAudienceEnabled } from '@/lib/meta-audience/gate'
import { audienceScopeFor } from '@/lib/meta-audience/oauth'
import { isMetaCapiEnabled } from '@/lib/meta-capi/gate'
import { gatePage } from '@/lib/shop-capability'
import { sessionUserId } from '@/lib/session-user'
import { viewerRolesOf } from '@/lib/viewer-roles'
import { getAudienceStatus } from '@/services/meta-audience-settings.service'
import { getCapiPage, listCapiPages } from '@/services/meta-capi-settings.service'
import NoPermissionCard from '../../_shared/NoPermissionCard'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import SellerErrorState from '../../_shared/SellerErrorState'
import AudienceCard, { type AudienceConnection } from './components/AudienceCard'
import PagesClient, { type PageRow } from './components/PagesClient'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t.conversionsApi.pageTitle }
}

export default async function ConversionsApiPage() {
  const t = await getT()
  const c = t.conversionsApi
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  // ร้านที่ฟีเจอร์ปิดต้องเห็นเป็นไม่มีหน้านี้ แม้บทบาทไม่ถึงก็ไม่ให้เห็นการ์ด "ไม่มีสิทธิ์" (ไม่บอกว่ามีฟีเจอร์)
  if (!isMetaCapiEnabled((session.user as { activeShopId?: string | null }).activeShopId)) notFound()

  const gate = await gatePage(session, 'X9')
  const crumb = { title: c.pageTitle, homeLabel: t.common.home, trail: [{ label: c.breadcrumbSettings, href: '/settings' }] }
  if (!gate.ok && gate.reason === 'FORBIDDEN_ROLE') {
    return (
      <>
        <PageBreadcrumb {...crumb} />
        <NoPermissionCard capability="X9" viewerRoles={await viewerRolesOf(session)} />
      </>
    )
  }
  if (!gate.ok) return null
  const shopId = gate.active.shop.id
  if (!isMetaCapiEnabled(shopId)) notFound()

  let rows: PageRow[]
  try {
    const list = await listCapiPages(shopId)
    // dataset รายตัว (สถานะ + เหตุการณ์ที่เปิด) อยู่ใน getCapiPage — เพจมีไม่กี่ตัว ยิงขนานได้
    const details = await Promise.all(list.map((p) => getCapiPage(shopId, p.channelId)))
    rows = list.map((p, i) => ({
      channelId: p.channelId,
      name: p.name,
      avatarUrl: p.avatarUrl,
      enabled: p.setting.enabled,
      everEnabled: p.setting.enabledAt !== null,
      purchaseAt: p.setting.purchaseAt,
      datasets: details[i].datasets.map((d) => ({ status: d.status, events: d.events })),
      sent7d: p.sent7d,
    }))
  } catch (e) {
    console.error('[conversions-api] list failed', e)
    return (
      <>
        <PageBreadcrumb {...crumb} />
        <SellerErrorState title={c.loadError} message={c.loadErrorHint} retryHref="/settings/conversions-api" />
      </>
    )
  }

  // การ์ด audience (00092) — โหลดพังต้องไม่ลากตารางเพจหายไปด้วย
  let audience: { initial: AudienceConnection | null; failed: boolean } | null = null
  if (isMetaAudienceEnabled(shopId)) {
    try {
      audience = { // Date → ISO string (JSON round-trip) ให้ตรงชนิดที่ client คาด
        initial: JSON.parse(JSON.stringify((await getAudienceStatus(shopId)).connection)) as AudienceConnection | null, failed: false }
    } catch (e) {
      console.error('[conversions-api] audience status failed', e)
      audience = { initial: null, failed: true }
    }
  }
  // ปุ่ม Facebook เฉพาะผู้ใช้ใน FB_CHAT_ROLE_USER_IDS (ads_management ยัง Standard) — ที่เหลือใช้ทางกรอก token เอง
  const oauthAvailable = audienceScopeFor(sessionUserId(session)) !== null

  return (
    <>
      <PageBreadcrumb {...crumb} />
      <p className="text-default-700 mb-base max-w-4xl text-sm">{c.pageSubtitle}</p>
      {rows.length === 0 ? (
        <div className="card">
          <SellerEmptyState compact icon="brand-messenger" title={c.emptyTitle} description={c.emptyBody} action={{ label: c.emptyCta, href: '/settings/channels' }} />
        </div>
      ) : (
        <PagesClient initial={rows} />
      )}
      {audience && <AudienceCard initial={audience.initial} oauthAvailable={oauthAvailable} loadFailed={audience.failed} />}
    </>
  )
}
