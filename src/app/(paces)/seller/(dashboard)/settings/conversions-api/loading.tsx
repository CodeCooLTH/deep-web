/**
 * loading.tsx — skeleton หน้ารายการ Conversions API (การ์ดเดียว: หัว + 3 แถว)
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/tags/loading.tsx
 *   theme: theme/paces/Admin/TS/src/app/(admin)/ui/placeholders/page.tsx
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { getT } from '@/i18n/server'

const Row = () => (
  <li className="flex items-center gap-3 py-3" aria-hidden="true">
    <span className="bg-default-100 size-10 shrink-0 animate-pulse rounded-full" />
    <span className="min-w-0 flex-1 space-y-2">
      <span className="bg-default-100 block h-4 w-48 animate-pulse rounded" />
      <span className="bg-default-100 block h-3 w-24 animate-pulse rounded" />
    </span>
    <span className="bg-default-100 h-5 w-20 shrink-0 animate-pulse rounded" />
  </li>
)

export default async function ConversionsApiLoading() {
  const t = await getT()
  return (
    <>
      <PageBreadcrumb title={t.conversionsApi.pageTitle} homeLabel={t.common.home} trail={[{ label: t.conversionsApi.breadcrumbSettings }]} />
      <div className="card" role="status" aria-busy="true">
        <div className="card-header">
          <span className="bg-default-100 block h-5 w-44 animate-pulse rounded" aria-hidden="true" />
        </div>
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
