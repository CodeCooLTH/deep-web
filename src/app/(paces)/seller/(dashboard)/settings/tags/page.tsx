/**
 * จัดการแท็ก (feature 00083 T8 · TFR-012) — รายการแท็กของร้าน + ตัวแก้ inline
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/auto-notify/page.tsx (gate + PageBreadcrumb + NoPermissionCard)
 *   theme: theme/paces/Admin/TS/src/app/(admin)/apps/users/account-settings/page.tsx
 *
 * ด่าน H3 (OWNER + MANAGER) ไม่มีโหมดอ่านอย่างเดียว (มติ P-6) · เรียก service ตรง ไม่ผ่าน API (RSC)
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'

import PageBreadcrumb from '@/components/PageBreadcrumb'
import { getT } from '@/i18n/server'
import { authOptions } from '@/lib/auth'
import { gatePage } from '@/lib/shop-capability'
import { SHOP_TAG_LIMITS } from '@/lib/shop-tag-match'
import { viewerRolesOf } from '@/lib/viewer-roles'
import { listShopTags } from '@/services/shop-tag.service'
import NoPermissionCard from '../../_shared/NoPermissionCard'
import TagsClient from './components/TagsClient'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t.tagManager.pageTitle }
}

export default async function TagsPage() {
  const t = await getT()
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  const gate = await gatePage(session, 'H3')
  if (!gate.ok && gate.reason === 'FORBIDDEN_ROLE') {
    return (
      <>
        <PageBreadcrumb title={t.tagManager.pageTitle} homeLabel={t.common.home} />
        <NoPermissionCard capability="H3" viewerRoles={await viewerRolesOf(session)} />
      </>
    )
  }
  if (!gate.ok) return null

  const { tags } = await listShopTags(gate.active.shop.id)

  return (
    <>
      <PageBreadcrumb
        title={t.tagManager.pageTitle}
        homeLabel={t.common.home}
        trail={[{ label: t.tagManager.breadcrumbSettings, href: '/settings' }]}
      />
      <p className="text-default-700 mb-base text-sm">{t.tagManager.pageSubtitle}</p>
      <TagsClient tags={tags} limits={SHOP_TAG_LIMITS} />
    </>
  )
}
