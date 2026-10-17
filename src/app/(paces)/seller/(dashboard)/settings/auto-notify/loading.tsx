/**
 * loading.tsx — skeleton สำหรับ /settings/auto-notify (การ์ดเดียว: หัว + 2 แถว)
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/loading.tsx (PageBreadcrumb + skeleton)
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { getT } from '@/i18n/server'

const Row = () => (
  <li className="flex items-start gap-3 py-3" aria-hidden="true">
    <span className="bg-default-100 size-5 shrink-0 animate-pulse rounded" />
    <span className="min-w-0 flex-1 space-y-2">
      <span className="bg-default-100 block h-4 w-40 animate-pulse rounded" />
      <span className="bg-default-100 block h-3 w-64 animate-pulse rounded" />
    </span>
    <span className="bg-default-100 h-5 w-9 shrink-0 animate-pulse rounded" />
  </li>
)

export default async function AutoNotifyLoading() {
  const t = await getT()
  return (
    <>
      <PageBreadcrumb title={t.autoNotify.pageTitle} homeLabel={t.common.home} trail={[{ label: t.autoNotify.breadcrumbSettings }]} />
      <div className="card" role="status" aria-busy="true">
        <div className="card-header">
          <span className="bg-default-100 block h-5 w-32 animate-pulse rounded" aria-hidden="true" />
        </div>
        <div className="card-body">
          <ul className="divide-default-200 divide-y">
            <Row />
            <Row />
          </ul>
        </div>
      </div>
    </>
  )
}
