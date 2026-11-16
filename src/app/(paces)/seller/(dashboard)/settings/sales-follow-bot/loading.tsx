/**
 * loading.tsx — skeleton ของ /settings/sales-follow-bot (3 แถว/การ์ด · ไม่ใช้ spinner กลางจอ)
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/auto-notify/loading.tsx (PageBreadcrumb + skeleton animate-pulse)
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { getT } from '@/i18n/server'

const Row = () => (
  <li className="flex items-start gap-3 py-3" aria-hidden="true">
    <span className="min-w-0 flex-1 space-y-2">
      <span className="bg-default-100 block h-4 w-40 animate-pulse rounded" />
      <span className="bg-default-100 block h-3 w-64 max-w-full animate-pulse rounded" />
    </span>
    <span className="bg-default-100 h-5 w-14 shrink-0 animate-pulse rounded" />
  </li>
)

export default async function SalesFollowBotLoading() {
  const t = await getT()
  return (
    <>
      <PageBreadcrumb title={t.salesFollowBot.pageTitle} homeLabel={t.common.home} trail={[{ label: t.salesFollowBot.breadcrumbSettings }]} />
      <div className="card" role="status" aria-busy="true">
        <div className="card-body">
          <ul className="divide-default-200 divide-y">
            <Row />
            <Row />
            <Row />
          </ul>
        </div>
      </div>
    </>
  )
}
