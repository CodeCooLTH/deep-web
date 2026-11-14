/**
 * Conversions API — บันทึกการส่ง (feature 00089 หน้า 3) · เจ้าของร้านเท่านั้น (X9) · อ่านอย่างเดียว
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx (ตาราง + ตัวกรอง — ดู ../../components/LogClient.tsx)
 *   + src/app/(paces)/seller/(dashboard)/settings/tags/page.tsx (gatePage + NoPermissionCard)
 *   theme shell: theme/paces/Admin/TS/src/app/(admin)/apps/users/account-settings/page.tsx
 *
 * ตัวกรองอยู่ใน query string (?status=&event=) → หน้านี้ดึงหน้าแรกฝั่ง server · "โหลดเพิ่ม" ยิง GET .../log ด้วย cursor
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'

import PageBreadcrumb from '@/components/PageBreadcrumb'
import { getT } from '@/i18n/server'
import { authOptions } from '@/lib/auth'
import { CAPI_EVENTS, type CapiEventKey } from '@/lib/meta-capi/events'
import { isMetaCapiEnabled } from '@/lib/meta-capi/gate'
import { gatePage } from '@/lib/shop-capability'
import { viewerRolesOf } from '@/lib/viewer-roles'
import { CapiError, getCapiPage, listCapiLog } from '@/services/meta-capi-settings.service'
import NoPermissionCard from '../../../../_shared/NoPermissionCard'
import SellerErrorState from '../../../../_shared/SellerErrorState'
import LogClient, { type LogRow } from '../../components/LogClient'

const STATUSES = ['PENDING', 'SENT', 'FAILED', 'SKIPPED'] as const
type Status = (typeof STATUSES)[number]
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t.conversionsApi.logTitle }
}

export default async function ConversionsApiLogPage({ params, searchParams }: { params: Promise<{ channelId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { channelId } = await params
  const sp = await searchParams
  const t = await getT()
  const c = t.conversionsApi
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  if (!isMetaCapiEnabled((session.user as { activeShopId?: string | null }).activeShopId)) notFound()

  const gate = await gatePage(session, 'X9')
  const base = [{ label: c.breadcrumbSettings, href: '/settings' }, { label: c.pageTitle, href: '/settings/conversions-api' }]
  if (!gate.ok && gate.reason === 'FORBIDDEN_ROLE') {
    return (
      <>
        <PageBreadcrumb title={c.logTitle} homeLabel={t.common.home} trail={base.slice(0, 1)} />
        <NoPermissionCard capability="X9" viewerRoles={await viewerRolesOf(session)} />
      </>
    )
  }
  if (!gate.ok) return null
  const shopId = gate.active.shop.id
  if (!isMetaCapiEnabled(shopId)) notFound()

  // ค่าที่ไม่รู้จักใน URL = ไม่กรอง (ไม่ปล่อยให้ API ตอบ 400 กลางหน้า)
  const rawStatus = first(sp.status)
  const status = (STATUSES as readonly string[]).includes(rawStatus ?? '') ? (rawStatus as Status) : undefined
  const rawEvent = first(sp.event)
  const event = CAPI_EVENTS.some((e) => e.key === rawEvent) ? (rawEvent as CapiEventKey) : undefined

  let name = ''
  let rows: LogRow[] = []
  let nextCursor: string | null = null
  let missing = false
  let failed = false
  try {
    const [pg, log] = await Promise.all([getCapiPage(shopId, channelId), listCapiLog(shopId, channelId, { status, eventKey: event, take: 20 })])
    name = pg.name
    nextCursor = log.nextCursor
    rows = log.rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      eventKey: r.eventKey,
      datasetName: r.datasetLabel?.trim() || `Dataset ${r.datasetId}`,
      value: r.value,
      status: r.status,
      reason: r.reason,
      attempts: r.attempts,
    }))
  } catch (e) {
    if (e instanceof CapiError && (e.code === 'NOT_FOUND' || e.code === 'FEATURE_DISABLED')) missing = true
    else {
      failed = true
      console.error('[conversions-api] log failed', e)
    }
  }
  if (missing) notFound()

  const trail = [...base, { label: name || c.pageTitle, href: `/settings/conversions-api/${channelId}` }]
  if (failed) {
    return (
      <>
        <PageBreadcrumb title={c.logTitle} homeLabel={t.common.home} trail={base} />
        <SellerErrorState title={c.logError} message={c.loadErrorHint} retryHref={`/settings/conversions-api/${channelId}/log`} />
      </>
    )
  }

  return (
    <>
      <PageBreadcrumb title={c.logTitle} homeLabel={t.common.home} trail={trail} />
      {/* key = ตัวกรอง: เปลี่ยนตัวกรองแล้วเริ่มรายการใหม่ ไม่ต่อท้ายแถวที่โหลดเพิ่มไว้ของตัวกรองเก่า */}
      <LogClient key={`${status ?? ''}|${event ?? ''}`} channelId={channelId} initialRows={rows} initialCursor={nextCursor} status={status ?? ''} event={event ?? ''} />
    </>
  )
}
