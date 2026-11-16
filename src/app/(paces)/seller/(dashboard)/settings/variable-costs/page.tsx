/**
 * ตั้งค่าต้นทุนต่อออเดอร์ (feature 00096 P2 · BRD FR-016) — เจ้าของเท่านั้น (F1) · ทุกประเภทร้าน
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/reports/page.tsx (gate F1 + PageBreadcrumb + NoPermissionCard)
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'

import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { gatePage } from '@/lib/shop-capability'
import { viewerRolesOf } from '@/lib/viewer-roles'
import { resolveVariableCosts } from '@/lib/variable-cost'
import { getT } from '@/i18n/server'
import NoPermissionCard from '../../_shared/NoPermissionCard'
import VariableCostForm from './components/VariableCostForm'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).variableCosts.title }
}

export default async function VariableCostsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  const t = (await getT()).variableCosts
  const gate = await gatePage(session, 'F1')
  if (!gate.ok && gate.reason === 'FORBIDDEN_ROLE') {
    return (
      <>
        <PageBreadcrumb title={t.title} />
        <NoPermissionCard capability="F1" viewerRoles={await viewerRolesOf(session)} />
      </>
    )
  }
  if (!gate.ok) return null
  return (
    <>
      <PageBreadcrumb title={t.title} trail={[{ label: 'ตั้งค่า' }]} />
      <VariableCostForm initial={resolveVariableCosts(gate.active.shop.variableCosts)} />
    </>
  )
}
