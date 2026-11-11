/**
 * loading.tsx — skeleton หน้ารายละเอียดเพจ Conversions API (หัวเพจ + 2 การ์ด)
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/tags/loading.tsx
 *   theme: theme/paces/Admin/TS/src/app/(admin)/ui/placeholders/page.tsx
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { getT } from '@/i18n/server'

export default async function ConversionsApiDetailLoading() {
  const t = await getT()
  return (
    <>
      <PageBreadcrumb title={t.conversionsApi.pageTitle} homeLabel={t.common.home} trail={[{ label: t.conversionsApi.breadcrumbSettings }]} />
      <div className="flex flex-col gap-base" role="status" aria-busy="true">
        <div className="card">
          <div className="card-body flex items-center gap-3" aria-hidden="true">
            <span className="bg-default-100 size-12 shrink-0 animate-pulse rounded-full" />
            <span className="space-y-2">
              <span className="bg-default-100 block h-4 w-40 animate-pulse rounded" />
              <span className="bg-default-100 block h-3 w-24 animate-pulse rounded" />
            </span>
          </div>
        </div>
        {[0, 1].map((i) => (
          <div key={i} className="card" aria-hidden="true">
            <div className="card-header">
              <span className="bg-default-100 block h-5 w-36 animate-pulse rounded" />
            </div>
            <div className="card-body space-y-3">
              <span className="bg-default-100 block h-4 w-2/3 animate-pulse rounded" />
              <span className="bg-default-100 block h-4 w-1/2 animate-pulse rounded" />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
