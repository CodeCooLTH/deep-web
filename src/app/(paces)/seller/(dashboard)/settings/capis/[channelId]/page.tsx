/**
 * Conversions API — รายละเอียดเพจ (feature 00089 หน้า 2) · เจ้าของร้านเท่านั้น (X9)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/users/account-settings/page.tsx (shell + PageBreadcrumb)
 *   + src/app/(paces)/seller/(dashboard)/settings/tags/page.tsx (gatePage + NoPermissionCard)
 *
 * เพจไม่ใช่ของร้าน / ไม่ใช่ MESSENGER / ถูกถอด = notFound() (service โยน NOT_FOUND) · ฟีเจอร์ปิด = notFound()
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'

import PageBreadcrumb from '@/components/PageBreadcrumb'
import { getT } from '@/i18n/server'
import { authOptions } from '@/lib/auth'
import { isMetaCapiEnabled } from '@/lib/meta-capi/gate'
import { getCapiStats } from '@/lib/meta-capi/stats'
import { gatePage } from '@/lib/shop-capability'
import { viewerRolesOf } from '@/lib/viewer-roles'
import { CapiError, getCapiPage } from '@/services/meta-capi-settings.service'
import { listShopTags } from '@/services/shop-tag.service'
import NoPermissionCard from '../../../_shared/NoPermissionCard'
import SellerErrorState from '../../../_shared/SellerErrorState'
import DetailClient from '../components/DetailClient'
import type { DetailData } from '../components/types'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t.conversionsApi.pageTitle }
}

export default async function ConversionsApiDetailPage({ params, searchParams }: { params: Promise<{ channelId: string }>; searchParams: Promise<{ days?: string | string[] }> }) {
  const { channelId } = await params
  const sp = await searchParams
  // ช่วงสถิติอยู่ใน URL (?days=30) — ค่าอื่นทุกแบบ = 7 วัน
  const days = sp.days === '30' ? 30 : 7
  const t = await getT()
  const c = t.conversionsApi
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  if (!isMetaCapiEnabled((session.user as { activeShopId?: string | null }).activeShopId)) notFound()

  const gate = await gatePage(session, 'X9')
  const trail = [
    { label: c.breadcrumbSettings, href: '/settings' },
    { label: c.pageTitle, href: '/settings/capis' },
  ]
  if (!gate.ok && gate.reason === 'FORBIDDEN_ROLE') {
    return (
      <>
        <PageBreadcrumb title={c.pageTitle} homeLabel={t.common.home} trail={trail.slice(0, 1)} />
        <NoPermissionCard capability="X9" viewerRoles={await viewerRolesOf(session)} />
      </>
    )
  }
  if (!gate.ok) return null
  const shopId = gate.active.shop.id
  if (!isMetaCapiEnabled(shopId)) notFound()

  let data: DetailData | null = null
  let missing = false
  try {
    const [pg, stats, tagList] = await Promise.all([getCapiPage(shopId, channelId), getCapiStats(shopId, channelId, days), listShopTags(shopId)])
    data = {
      channelId: pg.channelId,
      name: pg.name,
      avatarUrl: pg.avatarUrl,
      setting: { enabled: pg.setting.enabled, everEnabled: pg.setting.enabledAt !== null, purchaseAt: pg.setting.purchaseAt, countPromotedDraft: pg.setting.countPromotedDraft },
      eventOptions: pg.eventOptions,
      datasets: pg.datasets.map((d) => ({ id: d.id, datasetId: d.datasetId, source: d.source, label: d.label, events: d.events, status: d.status, hasToken: d.hasToken })),
      stats: {
        days,
        pending: stats.pending,
        failed: stats.failed,
        sent: stats.sent,
        sales: stats.sales,
        leads: stats.leads,
        lastSentAt: stats.lastSentAt ? stats.lastSentAt.toISOString() : null,
        oldestPendingMin: stats.oldestPendingAt ? Math.max(0, Math.floor((Date.now() - stats.oldestPendingAt.getTime()) / 60000)) : null,
      },
      tags: tagList.tags.filter((tg): tg is typeof tg & { id: string } => tg.registered && tg.id !== null).map((tg) => ({ id: tg.id, name: tg.name })),
    }
  } catch (e) {
    if (e instanceof CapiError && (e.code === 'NOT_FOUND' || e.code === 'FEATURE_DISABLED')) missing = true
    else console.error('[conversions-api] detail failed', e)
  }
  if (missing) notFound()
  if (!data) {
    return (
      <>
        <PageBreadcrumb title={c.pageTitle} homeLabel={t.common.home} trail={trail.slice(0, 1)} />
        <SellerErrorState title={c.loadError} message={c.loadErrorHint} retryHref={`/settings/capis/${channelId}`} />
      </>
    )
  }

  return (
    <>
      <PageBreadcrumb title={data.name} homeLabel={t.common.home} trail={trail} />
      <DetailClient data={data} />
    </>
  )
}
