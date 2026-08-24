/**
 * Customers list — ลูกค้าของร้าน (ผู้ที่เคยสั่งซื้อ)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/customers/page.tsx
 *
 * เปลี่ยน: ดึง customers จาก orders จริง (ไม่ใช้ demo data)
 * ตัด: StatStrip (เป็นของ S20), AddCustomerModal (seller ไม่ add customers เอง)
 *
 * ── feature 00057 ────────────────────────────────────────────────────────────
 * 1. การ group ออเดอร์เป็นลูกค้าย้ายไป `customer-directory.service.ts` ทั้งหมด — หน้าโปรไฟล์
 *    `/customers/[id]` ต้องหาลูกค้าด้วย key เดียวกัน ถ้าปล่อยให้ที่นี่ group เองอีกชุด สองหน้า
 *    จะ dedupe ไม่ตรงกันทันทีที่มีคนแก้ที่เดียว (BR-CUSTP-05)
 *
 * 2. **ค้นหา/กรองย้ายมาทำที่ server** — ของเดิมกรอง array ที่ `contact` ถูก mask ไปแล้วตั้งแต่
 *    ตรงนี้ ⇒ "ค้นเบอร์เต็ม" เป็นไปไม่ได้เลยโดยโครงสร้าง ไม่ว่าจะแก้ UI ยังไง (FR-001)
 *
 * 3. 🛑 **ฐานข้อมูลล่มต้องไม่หน้าตาเหมือน "ร้านนี้ยังไม่มีลูกค้า"** — ของเดิมเขียน
 *    `catch { orders = [] }` แล้วส่ง `[]` เข้าตาราง ร้านที่มีลูกค้า 400 คนจะเห็นข้อความชวนให้
 *    "รอผู้ซื้อสั่งซื้อ" โดยไม่มีอะไรบอกว่าระบบมีปัญหา (BRD §6.3)
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { requireActiveShop } from '@/lib/shop-context'
import { getServerSession } from 'next-auth'
import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'
import { getT } from '@/i18n/server'
import { resolveOrderVocab } from '@/lib/seller-menu'
import { customerBadges, hasBehaviorWarning } from '@/lib/customer-behavior'
import {
  maskContact,
  matchesCustomerQuery,
  matchesRepeatFilter,
  parseRepeatFilter,
} from '@/lib/customer-directory'
import { aggregateShopCustomers } from '@/services/customer-directory.service'
import type { Metadata } from 'next'
import type { CustomerRow } from './components/data'
import CustomerTable from './components/CustomerTable'

export const metadata: Metadata = { title: 'ลูกค้า' }

interface PageProps {
  searchParams: Promise<{ q?: string; warn?: string; repeat?: string }>
}

export default async function CustomersPage({ searchParams }: PageProps) {
  const sp = await searchParams

  const session = await getServerSession(authOptions)
  if (!session?.user) return null

  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )

  if (!active) {
    return (
      <div className="card mx-auto max-w-2xl rounded-xl p-10 text-center">
        <Icon icon="building-store" className="text-warning mx-auto mb-4 size-16" />
        <h2 className="text-dark mb-2 text-xl font-bold">ยังไม่มีร้านค้า</h2>
        <p className="text-default-400 mb-6">ต้องสร้างร้านก่อนจึงจะดูลูกค้าได้</p>
        <Link
          href="/shop"
          className="btn bg-primary hover:bg-primary-hover inline-flex items-center gap-2 px-6 py-3 font-semibold text-white">
          <Icon icon="plus" />
          สร้างร้านค้า
        </Link>
      </div>
    )
  }

  const shop = active.shop
  const t = await getT()
  const vocab = resolveOrderVocab(shop.vertical ?? '')

  /**
   * ไม่ catch แล้วส่งลิสต์ว่างต่อ — ปล่อยให้ throw ขึ้นมาถึงตรงนี้แล้วแยก UI คนละแบบ
   * (ดูหัวไฟล์ข้อ 3) การกลืน error ที่ชั้น service คือสิ่งที่ทำให้สองสถานการณ์นี้แยกไม่ออก
   */
  let entries
  try {
    entries = await aggregateShopCustomers(shop.id)
  } catch (e) {
    console.error('[customers/page] aggregateShopCustomers failed', e)
    return (
      <>
        <PageBreadcrumb title="ลูกค้า" subtitle="ร้านค้า" />
        <div className="card mx-auto max-w-2xl rounded-xl p-10 text-center">
          <Icon icon="alert-triangle" className="text-warning mx-auto mb-4 size-16" />
          <h2 className="text-dark mb-2 text-xl font-bold">โหลดข้อมูลลูกค้าไม่สำเร็จ</h2>
          <p className="text-default-400 mb-6">
            ระบบติดต่อฐานข้อมูลไม่ได้ชั่วคราว — ข้อมูลลูกค้าของคุณยังอยู่ครบ ลองใหม่อีกครั้งได้เลย
          </p>
          {/* ลิงก์กลับหน้าเดิม = โหลดใหม่ทั้งหน้า (RSC) โดยไม่ต้องมี client component แค่เพื่อปุ่มเดียว */}
          <Link
            href="/customers"
            className="btn bg-primary hover:bg-primary-hover inline-flex items-center gap-2 px-6 py-3 font-semibold text-white">
            <Icon icon="refresh" />
            ลองใหม่
          </Link>
        </div>
      </>
    )
  }

  const q = (sp.q ?? '').trim()
  const repeat = parseRepeatFilter(sp.repeat)
  const warnOnly = sp.warn === '1'

  /**
   * ป้ายคำนวณที่นี่ (ไม่ใช่ที่ client) เพราะต้องใช้ dictionary + คำนามผันตาม vertical —
   * และเพราะตัวกรอง "มีสัญญาณเตือน" ต้องใช้ผลลัพธ์เดียวกันนี้ตัดสิน ไม่ใช่เกณฑ์คู่ขนาน
   * `hasHistory: true` เสมอ — ทุก entry ในลิสต์นี้มีออเดอร์อย่างน้อย 1 ใบตามนิยาม (BR-CUSTP-01)
   */
  const badgeOpts = { hasHistory: true, orderNoun: vocab.noun, copy: t.inbox.customerPanel }

  const filtered = entries.filter((e) => {
    if (!matchesCustomerQuery(e, q)) return false
    if (!matchesRepeatFilter(e, repeat)) return false
    if (warnOnly && !hasBehaviorWarning(customerBadges(e.behavior, badgeOpts))) return false
    return true
  })

  const customers: CustomerRow[] = filtered.map((e) => ({
    key: e.key,
    displayName: e.displayName,
    initial: e.initial,
    contact: maskContact(e.contactFull),
    hasContact: !!e.contactFull,
    isRegistered: e.isRegistered,
    username: e.username,
    totalOrders: e.totalOrders,
    totalSpent: e.totalSpent,
    lastOrderISO: e.lastOrderISO,
    badges: customerBadges(e.behavior, badgeOpts),
  }))

  return (
    <>
      <PageBreadcrumb title="ลูกค้า" subtitle="ร้านค้า" />
      <CustomerTable
        customers={customers}
        /**
         * แยก "กรองแล้วไม่เจอ" ออกจาก "ร้านนี้ยังไม่มีลูกค้าเลย" — สองอย่างนี้ต้องพูดคนละประโยค
         * ไม่งั้นผู้ใช้ที่กดตัวกรองแล้วเห็น "ยังไม่มีลูกค้า" จะเข้าใจว่าข้อมูลหาย
         */
        hasAnyCustomer={entries.length > 0}
        initialQuery={q}
        initialWarn={warnOnly}
        initialRepeat={repeat}
      />
    </>
  )
}
