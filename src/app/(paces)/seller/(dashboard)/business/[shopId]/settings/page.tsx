/**
 * /business/[shopId]/settings — ตั้งค่าธุรกิจรายตัว (user สั่ง 2026-08-05)
 *
 * ทำไมต้องมีหน้านี้: เดิมธุรกิจที่สร้างแล้วเข้าไปทำอะไรไม่ได้เลยนอกจาก /invites — ไม่มีที่ลบ
 * ทั้งที่ API DELETE + softDeleteBusinessShop มีพร้อมมาตั้งแต่ feature 00008
 *
 * scope: หน้านี้ผูกกับ "ธุรกิจตัวนั้น" ผ่าน shopId ใน path — ไม่ใช่ร้านที่ active อยู่
 * จึงต้อง verify ownership เองที่นี่ ห้ามใช้ requireActiveShop (คนละ context กัน)
 *
 * Base: src/app/(paces)/seller/(dashboard)/business/page.tsx (PageBreadcrumb + card list)
 *   ซึ่ง chase ต่อไปที่ theme/paces/Admin/TS/src/app/(admin)/apps/clients/page.tsx
 */

import { getServerSession } from 'next-auth'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'

import Icon from '@/components/wrappers/Icon'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BUSINESS_DELETE_RETENTION_DAYS } from '@/lib/business-package'
import { SHOP_VERTICALS } from '@/lib/lodging'
import BusinessDangerZone from './components/BusinessDangerZone'
import BusinessSettingsForm from './components/BusinessSettingsForm'

export const metadata: Metadata = { title: 'ตั้งค่าธุรกิจ' }

export default async function BusinessSettingsPage({ params }: { params: Promise<{ shopId: string }> }) {
  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) redirect('/auth/sign-in')
  const { shopId } = await params

  // DAL: bake ownership เข้า where — ไม่ใช่ query แล้วค่อย redirect (ข้อมูลจะ serialize เข้า
  // flight payload ไปแล้วก่อน redirect throw — feedback_rsc_dal_authz)
  const shop = await prisma.shop.findFirst({
    where: { id: shopId, userId: user.id as string, kind: 'BUSINESS', deletedAt: null },
    select: {
      id: true,
      shopName: true,
      slug: true,
      vertical: true,
      categories: true,
      description: true,
      address: true,
      logo: true,
      latitude: true,
      longitude: true,
    },
  })
  if (!shop) notFound()

  return (
    <>
      <PageBreadcrumb
        title="ตั้งค่าธุรกิจ"
        trail={[
          { label: 'ธุรกิจ', href: '/business' },
          { label: shop.shopName },
        ]}
      />

      {/* แถวที่แก้ไม่ได้ — แยกออกจากฟอร์มโดยตั้งใจ ไม่ให้ดูเหมือนช่องที่กดแก้ได้แล้วกดไม่ได้ */}
      <div className="card mb-base">
        <div className="card-header">
          <h4 className="card-title">ข้อมูลที่เปลี่ยนไม่ได้</h4>
          <Link href={`/business/${shop.id}/invites`} className="text-primary text-sm font-medium hover:underline">
            จัดการทีมงาน
          </Link>
        </div>
        <div className="card-body">
          <dl className="border-default-200 rounded border px-4">
            <Row k="ประเภทกิจการ" v={SHOP_VERTICALS[shop.vertical as keyof typeof SHOP_VERTICALS] ?? shop.vertical} />
            <Row k="URL ร้าน" v={shop.slug ? `deepthailand.app/b/${shop.slug}` : null} />
          </dl>
          <p className="text-default-400 mt-3 flex items-start gap-1 text-xs">
            <Icon icon="info-circle" className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            ประเภทกิจการเลือกได้ครั้งเดียวตอนสร้าง · ไม่มี URL ร้าน = ยังไม่มีหน้าร้านสาธารณะให้ลูกค้าเปิด แต่ใช้งานในระบบได้ครบ
          </p>
        </div>
      </div>

      <BusinessSettingsForm
        shopId={shop.id}
        needsLocation={shop.vertical === 'SERVICE_QUEUE' || shop.vertical === 'LODGING'}
        currentSlug={shop.slug ?? ''}
        initial={{
          shopName: shop.shopName,
          description: shop.description ?? '',
          logo: shop.logo ?? '',
          address: shop.address ?? '',
          categories: shop.categories,
          latitude: shop.latitude,
          longitude: shop.longitude,
        }}
      />

      <BusinessDangerZone
        shopId={shop.id}
        shopName={shop.shopName}
        retentionDays={BUSINESS_DELETE_RETENTION_DAYS}
      />
    </>
  )
}

/** แถวสรุป — โครงเดียวกับ ConnectedAccountsClient (border-b py-3 last:border-0) */
function Row({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="border-default-200 flex items-center justify-between gap-3 border-b py-3 last:border-0">
      <dt className="text-default-400 shrink-0 text-xs">{k}</dt>
      <dd className={`text-right text-sm ${v ? 'text-default-900 font-medium' : 'text-default-400'}`}>
        {v || 'ยังไม่ได้ตั้ง'}
      </dd>
    </div>
  )
}
