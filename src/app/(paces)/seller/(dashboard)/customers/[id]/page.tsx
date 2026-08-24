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
import { avgPerOrder } from '@/lib/customer-directory'
import { shopShipsGoods } from '@/lib/shipping-address-status'
import { resolveCustomerByKey } from '@/services/customer-directory.service'
import { getBuyerReputation } from '@/services/buyer-reputation.service'
import CustomerProfileHeader from './components/CustomerProfileHeader'
import CustomerProfileOrders from './components/CustomerProfileOrders'

export const metadata: Metadata = { title: 'ลูกค้า' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CustomerProfilePage({ params }: PageProps) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  if (!session?.user) return null

  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  if (!active) notFound()

  const shop = active.shop
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
   * 🛑 ไม่มีเลย → ไม่ render ปุ่ม **ห้ามเดาเธรดจากเบอร์/Customer** (BR-CUSTP-07)
   */
  const latestConversationId = entry.orders.find((o) => o.conversationId)?.conversationId ?? null

  /**
   * ที่อยู่ล่าสุด = ใบล่าสุด **ที่มีที่อยู่** ไม่ใช่ใบล่าสุดเฉย ๆ (ใบล่าสุดอาจเป็นการรับหน้าร้าน
   * ซึ่งไม่มีที่อยู่ แล้วช่องจะว่างทั้งที่ร้านเคยส่งของให้ลูกค้าคนนี้มาก่อน)
   */
  const latestAddress = entry.orders.find((o) => o.shippingAddress)?.shippingAddress ?? null

  return (
    <>
      {/* เส้นทางกลับต้องกดได้จริง — หน้านี้เปิดจากแชท/หน้าออเดอร์ได้ด้วย ไม่ได้มาจากลิสต์เสมอ */}
      <PageBreadcrumb
        title={entry.displayName}
        trail={[{ label: 'ลูกค้า', href: '/customers' }]}
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-10">
        {/* เดสก์ท็อป 70/30 — คอลัมน์เดียวที่ 1440px ทิ้งพื้นที่ขวาว่างเกินครึ่งจอ */}
        <div className="xl:col-span-7">
          <CustomerProfileOrders orders={entry.orders} vocabNoun={vocab.noun} />
        </div>
        <div className="flex flex-col gap-4 xl:col-span-3">
          <CustomerProfileHeader
            entry={entry}
            badges={badges}
            reputation={reputation}
            latestConversationId={latestConversationId}
            latestAddress={latestAddress}
            showAddress={shopShipsGoods(shop.vertical)}
            createLabel={vocab.createLabel}
            avg={avgPerOrder(entry)}
          />
        </div>
      </div>
    </>
  )
}
