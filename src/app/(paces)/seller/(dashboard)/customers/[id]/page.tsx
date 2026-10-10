/**
 * Customer profile — โปรไฟล์ลูกค้ารายคน (feature 00057)
 *
 * 🛑 `[id]` เป็น **opaque row key** (`c-` / `u-` / `g-` จาก `makeCustomerRowKey`) **ไม่ใช่
 * `Customer.id`** — ลูกค้าจำนวนมากในระบบยังไม่มีแถว `Customer` เลย (ออเดอร์เก่าก่อน 00014,
 * guest ที่กรอกเบอร์ผิดรูปแบบ) ถ้าบังคับให้เป็น `Customer.id` คนกลุ่มนี้จะกดแถวในลิสต์แล้ว
 * ไม่มีหน้าให้ไป ซึ่งเป็นความเจ็บอันดับหนึ่งที่ฟีเจอร์นี้ตั้งใจแก้ตั้งแต่แรก
 *
 * key แบบ `g-` เป็น sha256 ทางเดียว — resolve ด้วยการคำนวณ key ของทุกออเดอร์ในร้านซ้ำแล้ว
 * เทียบสตริง **ไม่ใช่ถอดรหัสกลับ** (ทำไม่ได้ และไม่ควรทำได้)
 *
 * ทุกอย่างเป็น server component ล้วน ไม่มี client state — ปุ่มลัดเป็นลิงก์/`tel:` ทั้งหมด
 */
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import type { Metadata } from 'next'

import PageBreadcrumb from '@/components/PageBreadcrumb'
import Icon from '@/components/wrappers/Icon'
import { authOptions } from '@/lib/auth'
import { requireActiveShop } from '@/lib/shop-context'
import { getT } from '@/i18n/server'
import { resolveOrderVocab } from '@/lib/seller-menu'
import { customerBadges } from '@/lib/customer-behavior'
import { avgPerOrder, redactCustomerSpend } from '@/lib/customer-directory'
import { can, rolesFromMembership } from '@/lib/shop-permissions'
import { shopShipsGoods } from '@/lib/shipping-address-status'
import { resolveCustomerByKey } from '@/services/customer-directory.service'
import { getBuyerReputation } from '@/services/buyer-reputation.service'
import CustomerProfileHeader from './components/CustomerProfileHeader'
import CustomerProfileOrders from './components/CustomerProfileOrders'
import FollowUpProfileSection from './components/FollowUpProfileSection'
import { listForCustomerProfile } from '@/services/customer-follow-up.service'
import { gatePage } from '@/lib/shop-capability'
import { viewerRolesOf } from '@/lib/viewer-roles'
import NoPermissionCard from '@/app/(paces)/seller/(dashboard)/_shared/NoPermissionCard'

export const metadata: Metadata = { title: 'ลูกค้า' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CustomerProfilePage({ params }: PageProps) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  // 00071 P3 (C1): บทบาทที่ไม่มีสิทธิ์เห็นการ์ดบอกเหตุผล ไม่ใช่หน้าว่าง/404 เงียบ — ตัดก่อน query ข้อมูลของหน้า
  const gate = await gatePage(session, 'C1')
  if (!gate.ok && gate.reason === 'FORBIDDEN_ROLE') {
    return (
      <>
        <PageBreadcrumb title="ร้านค้า" />
        <NoPermissionCard capability="C1" viewerRoles={await viewerRolesOf(session)} />
      </>
    )
  }
  if (!session?.user) return null

  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  if (!active) notFound()

  const shop = active.shop
  // ยอดซื้อสะสม/ค่าเฉลี่ยต่อบิล = F1 (เจ้าของเท่านั้น, 00071 S-3)
  const showSpend = can(rolesFromMembership(active.role, active.roles), 'F1')
  const t = await getT()
  const vocab = resolveOrderVocab(shop.vertical ?? '')

  /**
   * 🛑 แยก "ฐานล่ม" ออกจาก "ไม่พบลูกค้า" — ทั้งคู่จบที่หน้าจอคนละแบบ
   * ถ้าปล่อยให้ DB error ตกไปเป็น `notFound()` ผู้ใช้จะอ่านว่า "ลูกค้าคนนี้ไม่มีอยู่จริง"
   * แล้วไปตามหาสาเหตุผิดทาง (BRD §6.3)
   */
  let entry
  let reputation = null
  try {
    const result = await resolveCustomerByKey(shop.id, id)
    // INVALID_KEY กับ NOT_FOUND จบเหมือนกันโดยตั้งใจ — ห้ามบอกผู้ใช้ว่า key นี้มีอยู่จริงที่ร้านอื่น
    if (!result.ok) notFound()
    entry = result.entry
    // ชั้น "ทั้งระบบ" มีได้เฉพาะลูกค้าที่ผูก Customer กลางแล้ว (00055 ใช้ customerId เป็นแกน)
    reputation = entry.customerId ? await getBuyerReputation(entry.customerId) : null
  } catch (e) {
    // notFound() ทำงานด้วยการ throw — ต้องปล่อยผ่าน ไม่ใช่กลืนเป็น error ทั่วไป
    if (e && typeof e === 'object' && 'digest' in e) throw e
    console.error('[customers/[id]/page] resolve failed', e)
    return (
      <>
        <PageBreadcrumb title="ลูกค้า" subtitle="ร้านค้า" />
        <div className="card mx-auto max-w-2xl rounded-xl p-10 text-center">
          <Icon icon="alert-triangle" className="text-warning mx-auto mb-4 size-16" />
          <h2 className="text-dark mb-2 text-xl font-bold">โหลดข้อมูลลูกค้าไม่สำเร็จ</h2>
          <p className="text-default-400 mb-6">
            ระบบติดต่อฐานข้อมูลไม่ได้ชั่วคราว — ข้อมูลลูกค้าของคุณยังอยู่ครบ ลองใหม่อีกครั้งได้เลย
          </p>
          <Link
            href="/customers"
            className="btn border-default-300 inline-flex items-center gap-2 px-6 py-3 font-semibold">
            <Icon icon="arrow-left" />
            กลับไปหน้าลูกค้า
          </Link>
        </div>
      </>
    )
  }

  const badges = customerBadges(entry.behavior, {
    hasHistory: true,
    orderNoun: vocab.noun,
    copy: t.inbox.customerPanel,
  })

  /**
   * เธรดของ "ปุ่มเปิดแชท" บนหัวโปรไฟล์ = ออเดอร์ล่าสุดที่ผูกเธรดไว้จริง
   * `entry.orders` เรียงใหม่→เก่าอยู่แล้ว ⇒ `find` ตัวแรกคือใบล่าสุดที่มีค่า
   * 🛑 ไม่มีเลย → ไม่ render ปุ่ม **ห้ามเดาเธรดจากเบอร์/ชื่อ** (BR-CUSTP-07 ถ้อยคำแก้ตาม 00066 มติ Q4)
   * ปุ่มเปิดแชท + ปุ่มเพิ่มรายการติดตามใช้ค่านี้เท่านั้น — ส่วน "อ่านรายการติดตาม" ต่างออกไป:
   * ขยายห้องผ่าน FK จริง `ExternalContact.customerId` ได้ (ไม่นับเป็นการเดา) แต่ห้ามใช้เลือกห้องให้ปุ่ม
   */
  const latestConversationId = entry.orders.find((o) => o.conversationId)?.conversationId ?? null

  // ฐานล้มไม่ล้มทั้งหน้า — ส่ง null ให้การ์ดขึ้น error + ลองใหม่ (ข้อมูลโหลดที่ server ไม่ส่ง PII เกินที่การ์ดใช้)
  const followUps = await listForCustomerProfile(shop.id, {
    conversationIds: [...new Set(entry.orders.flatMap((o) => (o.conversationId ? [o.conversationId] : [])))],
    customerId: entry.customerId,
  }).catch((e) => {
    console.error('[customers/[id]/page] follow-ups failed', e)
    return null
  })

  /**
   * ที่อยู่ล่าสุด = ใบล่าสุด **ที่มีที่อยู่** ไม่ใช่ใบล่าสุดเฉย ๆ (ใบล่าสุดอาจเป็นการรับหน้าร้าน
   * ซึ่งไม่มีที่อยู่ แล้วช่องจะว่างทั้งที่ร้านเคยส่งของให้ลูกค้าคนนี้มาก่อน)
   */
  const latestAddress = entry.orders.find((o) => o.shippingAddress)?.shippingAddress ?? null

  return (
    <>
      {/*
        เส้นทางกลับต้องกดได้จริง — หน้านี้เปิดจากแชท/หน้าออเดอร์ได้ด้วย ไม่ได้มาจากลิสต์เสมอ

        🛑 `PageBreadcrumb` ห่อ trail ไว้ใน `hidden … md:flex` (`PageBreadcrumb.tsx:46`) ⇒
        **ต่ำกว่า 768px ไม่มีลิงก์กลับเลย** ซึ่งขัดกับประโยคบรรทัดบนที่เขียนไว้เองตั้งแต่แรก
        คนที่กดเข้ามาจากลิงก์ในแชทจึงติดอยู่ในหน้านี้ เหลือแต่ปุ่ม back ของเบราว์เซอร์
        (ซึ่งในแอปมือถือที่ห่อด้วย WebView ไม่ได้อยู่ในสายตาเสมอไป)
        ⇒ ลิงก์กลับของมือถือต้องเป็นของหน้านี้เอง ไม่ใช่พึ่ง breadcrumb
      */}
      <Link
        href="/customers"
        className="text-default-600 hover:text-primary mb-3 -ms-1 inline-flex min-h-11 items-center gap-1 text-sm font-medium md:hidden">
        <Icon icon="chevron-left" className="text-base" aria-hidden="true" />
        ลูกค้า
      </Link>
      <PageBreadcrumb
        title={entry.displayName}
        trail={[{ label: 'ลูกค้า', href: '/customers' }]}
      />
      {/*
        เดสก์ท็อป 70/30 — คอลัมน์เดียวที่ 1440px ทิ้งพื้นที่ขวาว่างเกินครึ่งจอ

        🛑 `order-*` จำเป็น: บนมือถือ grid เป็นคอลัมน์เดียว ⇒ ลำดับใน DOM = ลำดับที่ตาเห็น
        ผู้ขายเปิดหน้าโปรไฟล์ลูกค้าต้องเห็น **"คนนี้เชื่อได้แค่ไหน" ก่อน** ไม่ใช่เจอตาราง
        ประวัติออเดอร์ก่อนแล้วต้องเลื่อนลงไปหาข้อมูลตัวคน
      */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-10">
        <div className="order-2 flex flex-col gap-5 xl:order-1 xl:col-span-7">
          <FollowUpProfileSection data={followUps} addConversationId={latestConversationId} />
          <CustomerProfileOrders orders={entry.orders} vocabNoun={vocab.noun} shippedStatusLabel={vocab.shippedStatusLabel} />
        </div>
        <div className="order-1 flex flex-col gap-5 xl:order-2 xl:col-span-3">
          <CustomerProfileHeader
            entry={redactCustomerSpend(entry, showSpend)}
            spend={showSpend ? { total: entry.totalSpent, avg: avgPerOrder(entry) } : undefined}
            badges={badges}
            reputation={reputation}
            latestConversationId={latestConversationId}
            latestAddress={latestAddress}
            showAddress={shopShipsGoods(shop.vertical)}
            createLabel={vocab.createLabel}
            vertical={shop.vertical}
          />
        </div>
      </div>
    </>
  )
}
