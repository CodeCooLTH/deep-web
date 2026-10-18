/**
 * ตั้งค่าส่งอัตโนมัติถึงลูกค้า (feature 00078 T17 · S-9, S-28)
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/reports/page.tsx (gate + PageBreadcrumb + NoPermissionCard)
 *   theme: theme/paces/Admin/TS/src/app/(admin)/apps/users/account-settings/page.tsx
 *
 * ห้ามลืม: ด่านหน้า = H1 (CHAT เข้าอ่านได้) · แก้ได้เฉพาะ X8 → canEdit มาจาก service (can(roles,'X8')) ไม่ใช่จอ
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'

import PageBreadcrumb from '@/components/PageBreadcrumb'
import { getT } from '@/i18n/server'
import { authOptions } from '@/lib/auth'
import { AUTO_NOTIFY_KIND_ICON, autoNotifyKindLabel } from '@/lib/auto-notify/kinds'
import { resolveOrderVocab } from '@/lib/seller-menu'
import { gatePage } from '@/lib/shop-capability'
import { viewerRolesOf } from '@/lib/viewer-roles'
import { getAutoNotifySettings } from '@/services/auto-notify-config.service'
import { listChannels } from '@/services/shop-channel.service'
import NoPermissionCard from '../../_shared/NoPermissionCard'
import AutoNotifyClient from './components/AutoNotifyClient'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t.autoNotify.pageTitle }
}

export default async function AutoNotifyPage() {
  const t = await getT()
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  const gate = await gatePage(session, 'H1')
  if (!gate.ok && gate.reason === 'FORBIDDEN_ROLE') {
    return (
      <>
        <PageBreadcrumb title={t.autoNotify.pageTitle} homeLabel={t.common.home} />
        <NoPermissionCard capability="H1" viewerRoles={await viewerRolesOf(session)} />
      </>
    )
  }
  if (!gate.ok) return null

  const shopId = gate.active.shop.id
  const [settings, channels] = await Promise.all([getAutoNotifySettings(shopId, gate.roles), listChannels(shopId)])
  const { vertical } = settings

  // ป้าย/ไอคอนคำนวณฝั่ง server — kinds.ts ลาก seller-menu ทั้งก้อน ไม่ควรเข้า client bundle
  const kinds = settings.kinds.map((k) => ({
    kind: k.kind,
    label: autoNotifyKindLabel(k.kind, vertical),
    icon: AUTO_NOTIFY_KIND_ICON[k.kind],
    enabled: k.enabled,
    enabledAt: k.enabledAt,
    // บรรทัดแรกของเทมเพลตที่ร้านแก้เอง · null = ใช้ข้อความตั้งต้น
    customFirstLine: k.template.isCustom && k.template.body ? (k.template.body.split('\n')[0] ?? '') : null,
  }))

  return (
    <>
      <PageBreadcrumb
        title={t.autoNotify.pageTitle}
        homeLabel={t.common.home}
        trail={[{ label: t.autoNotify.breadcrumbSettings, href: '/settings' }]}
      />
      <p className="text-default-700 mb-base text-sm">{t.autoNotify.pageSubtitle}</p>
      <AutoNotifyClient
        kinds={kinds}
        dailyCap={settings.dailyCapPerRoom}
        trackingNoticeTiming={settings.trackingNoticeTiming}
        canEdit={settings.canEdit}
        hasChannel={channels.length > 0}
        noun={resolveOrderVocab(vertical).noun}
      />
    </>
  )
}
