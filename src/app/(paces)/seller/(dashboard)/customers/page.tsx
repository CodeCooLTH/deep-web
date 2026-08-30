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
  aggregateCustomerStats,
  maskContact,
  matchesCustomerFilter,
  matchesCustomerQuery,
  parseCustomerFilter,
  parseCustomerRiskFilter,
  matchesRiskFilter,
  type CustomerListFilter,
  type CustomerRiskFilter,
} from '@/lib/customer-directory'
import { aggregateShopCustomers } from '@/services/customer-directory.service'
import { classifyCustomerRiskTier, HIGH_RISK_MIN_RETURNED } from '@/lib/buyer-reputation'
import { getBuyerReputations } from '@/services/buyer-reputation.service'
import CustomerHero from './components/CustomerHero'
import NoParcelNotice from './components/NoParcelNotice'
import CustomerStatCard, { type CustomerStatItem } from './components/CustomerStatCard'
import type { Metadata } from 'next'
import type { CustomerRow } from './components/data'
import CustomerTable from './components/CustomerTable'

export const metadata: Metadata = { title: 'ลูกค้า' }

interface PageProps {
  searchParams: Promise<{ q?: string; f?: string; risk?: string }>
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
  const filter = parseCustomerFilter(sp.f)
  const risk = parseCustomerRiskFilter(sp.risk)

  /**
   * ป้ายคำนวณที่นี่ (ไม่ใช่ที่ client) เพราะต้องใช้ dictionary + คำนามผันตาม vertical —
   * และเพราะ **ตัวเลขบนการ์ด "ลูกค้าต้องเฝ้าระวัง" กับผลของชิปกรองต้องมาจากเกณฑ์เดียวกัน**
   * ถ้าคำนวณแยกกันสองที่ วันหนึ่งการ์ดจะบอก 12 แล้วกดกรองได้ 9 โดยไม่มีอะไรฟ้อง
   * `hasHistory: true` เสมอ — ทุก entry ในลิสต์นี้มีออเดอร์อย่างน้อย 1 ใบตามนิยาม (BR-CUSTP-01)
   */
  const badgeOpts = { hasHistory: true, orderNoun: vocab.noun, copy: t.inbox.customerPanel }
  const withWarning = entries.map((e) => ({
    entry: e,
    badges: customerBadges(e.behavior, badgeOpts),
  }))
  const warnOf = new Map(withWarning.map((w) => [w.entry.key, hasBehaviorWarning(w.badges)]))

  /**
   * การ์ดสถิติหัวหน้า = **ขอบเขตร้านนี้** (KPI ของร้าน ไม่ใช่ชื่อเสียงข้ามร้านของลูกค้า)
   * และคำนวณจาก `entries` ทั้งหมด **ไม่ผูกกับตัวกรอง/คำค้นหา** — ตัวเลขภาพรวมร้านต้องคงที่
   * ไม่ว่าผู้ขายกำลังพิมพ์ค้นหาอะไรอยู่ (พฤติกรรมเดียวกับ stat card ของธีม)
   */
  const stats = aggregateCustomerStats(
    entries.map((e) => ({ shopReputation: e.shopReputation, hasWarning: warnOf.get(e.key) ?? false })),
  )

  /**
   * จำนวนต่อตัวเลือกของตัวกรอง — นับจาก `withWarning` (**ก่อนกรอง** และไม่ผูกกับคำค้นหา)
   * ด้วย `matchesCustomerFilter()` **ตัวเดียวกับที่ใช้กรองจริง** ⇒ เลขบนป้ายกับผลที่ได้
   * ตอนกดจะไม่มีทางนับคนละเกณฑ์ (บทเรียน Command Center 2026-08-04: นับด้วย SQL
   * แล้วกรองด้วย TS ⇒ กดเลข 5 เข้าไปเจอ 4)
   *
   * 🛑 `warn` ต้องเป็น `stats.watchCount` ตัวเดิม ห้ามนับใหม่ — มันคือเลขเดียวกับที่การ์ด
   * สถิติหัวหน้าแสดง ถ้าคำนวณซ้ำคนละบรรทัด วันหนึ่งจะเพี้ยนคนละทางโดยไม่มีอะไรฟ้อง (HR16)
   */
  const filterCounts: Record<CustomerListFilter, number> = {
    all: entries.length,
    warn: stats.watchCount,
    returned: withWarning.filter(({ entry: e, badges }) =>
      matchesCustomerFilter(e, 'returned', hasBehaviorWarning(badges)),
    ).length,
    repeat: withWarning.filter(({ entry: e, badges }) =>
      matchesCustomerFilter(e, 'repeat', hasBehaviorWarning(badges)),
    ).length,
  }

  const shopHasParcelsEarly = stats.shipped > 0
  const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`)
  const share = (n: number) =>
    stats.totalCustomers === 0 ? undefined : `${Math.round((n / stats.totalCustomers) * 100)}% ของลูกค้าทั้งหมด`

  /**
   * 4 การ์ด — ทุกใบผูกกับข้อมูลจริงที่มี **และไม่มีใบไหนเป็น 0 หรือ 100% เสมอโดยโครงสร้าง**
   * ไม่มี badge % เปลี่ยนแปลงแบบธีม เพราะเราไม่มีข้อมูลย้อนหลังมาเทียบ (จะเป็นเลขที่ไม่มีที่มา)
   */

  /**
   * ชื่อเสียง **ข้ามร้าน** ของทุกแถวในหน้าเดียว — batch query เดียว ไม่ใช่ N+1
   *
   * 🛑 ดึง **ทุก entry ก่อนกรอง** (เดิมดึงเฉพาะที่ผ่านตัวกรองแล้ว) เพราะตั้งแต่มีแกน `?risk=`
   * ตัวเลขบนไทล์/การ์ดที่กดได้ต้องนับจากทั้งร้าน ไม่ใช่จากผลลัพธ์ที่กรองแล้ว
   * — ถ้านับจากผลลัพธ์ ไทล์จะเปลี่ยนเลขทุกครั้งที่พิมพ์ค้นหา แล้ว "กดเลข 2 เจอ 1"
   * (บทเรียน Command Center 2026-08-04) · จำนวน query ไม่เพิ่ม ยังเป็น batch เดียว
   */
  const reputations = await getBuyerReputations(
    entries.map((e) => e.customerId).filter((x): x is string => !!x),
  )
  const tierOf = new Map(
    entries.map((e) => [
      e.key,
      classifyCustomerRiskTier(e.customerId ? (reputations.get(e.customerId) ?? null) : null),
    ]),
  )

  /**
   * จำนวนต่อระดับความเสี่ยง — **นับด้วย `matchesRiskFilter` ตัวเดียวกับที่กรองจริง**
   * และนับจาก `entries` ทั้งหมด ไม่ผูกกับคำค้น/ตัวกรองอีกแกน
   */
  const riskCounts = {
    high: entries.filter((e) => matchesRiskFilter(tierOf.get(e.key) ?? 'new', 'high')).length,
    watch: entries.filter((e) => matchesRiskFilter(tierOf.get(e.key) ?? 'new', 'watch')).length,
  }

  /**
   * 4 การ์ด — **2 ใบแรกกดกรองได้** (แกน `?risk=` ข้ามร้าน) · 2 ใบหลังเป็นตัวเลขภาพรวมร้าน
   *
   * 🛑 ป้ายต้องบอกขอบเขตในตัวเองทุกใบ — ใบที่ 1-2 เป็น **ทั้งระบบ** ส่วนใบที่ 3-4 เป็น
   * **ร้านนี้** สองชุดนี้อยู่ในแถวเดียวกัน ถ้าไม่เขียนกำกับผู้ขายจะอ่านว่าเป็นชุดเดียวกัน (HR16)
   *
   * 🛑 ตัวเลขบนใบที่กดได้มาจาก `riskCounts` ซึ่งนับด้วย `matchesRiskFilter` **ตัวเดียวกับ
   * ที่กรองจริง** และนับจาก `entries` ทั้งหมด ไม่ผูกกับคำค้น — กดเลขไหนต้องเจอเท่านั้น
   *
   * เดิมชุดนี้เป็นอัตรารับของ/อัตราตีกลับระดับร้าน แต่วัด prod แล้วร้านส่วนใหญ่มีข้อมูล
   * ระดับร้านบางเกินกว่าจะมีความหมาย (6 ใน 7 ร้านไม่เคยเปิดพัสดุเลย) ⇒ ยกสัญญาณข้ามร้าน
   * ขึ้นมาเป็นใบหลักแทน
   */
  const riskHref = (v: 'high' | 'watch') => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (filter !== 'all') params.set('f', filter)
    if (risk !== v) params.set('risk', v)
    const qs = params.toString()
    return qs ? `/customers?${qs}` : '/customers'
  }

  const statItems: CustomerStatItem[] = [
    {
      value: String(riskCounts.high),
      title: 'ลูกค้าเสี่ยงสูง (ทั้งระบบ)',
      caption: `ตีกลับ ${HIGH_RISK_MIN_RETURNED} ครั้งขึ้นไป · ${share(riskCounts.high) ?? ''}`,
      icon: 'solar:danger-triangle-bold-duotone',
      tone: 'bg-warning',
      href: riskHref('high'),
      active: risk === 'high',
    },
    {
      value: String(riskCounts.watch),
      title: 'ต้องเฝ้าระวัง (ทั้งระบบ)',
      caption: `เคยตีกลับอย่างน้อย 1 ครั้ง · ${share(riskCounts.watch) ?? ''}`,
      icon: 'solar:eye-bold-duotone',
      tone: 'bg-warning',
      href: riskHref('watch'),
      active: risk === 'watch',
    },
    {
      value: String(stats.returned),
      title: 'พัสดุตีกลับ (ร้านนี้)',
      caption: shopHasParcelsEarly
        ? `จาก ${stats.shipped} ใบที่เปิดพัสดุ`
        : 'ร้านยังไม่เคยเปิดพัสดุผ่าน Deep',
      icon: 'solar:box-bold-duotone',
      tone: 'bg-info',
    },
    {
      value: stats.totalCustomers.toLocaleString('th-TH'),
      title: 'ลูกค้าทั้งหมด (ร้านนี้)',
      caption: undefined,
      icon: 'solar:users-group-rounded-bold-duotone',
      tone: 'bg-primary',
    },
  ]

  const filtered = withWarning.filter(({ entry: e, badges }) => {
    if (!matchesCustomerQuery(e, q)) return false
    if (!matchesRiskFilter(tierOf.get(e.key) ?? 'new', risk)) return false
    return matchesCustomerFilter(e, filter, hasBehaviorWarning(badges))
  })

  const customers: CustomerRow[] = filtered.map(({ entry: e, badges }) => ({
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
    badges,
    trust: e.customerId ? (reputations.get(e.customerId) ?? null) : null,
    tier: tierOf.get(e.key) ?? 'new',
    /** ตัวเลข **กับร้านนี้** — คอลัมน์ "กับร้านนี้" ต้องมี raw count ฝั่ง client (ไม่มี PII) */
    shopShipped: e.shopReputation.shipped,
    shopReturned: e.shopReputation.returned,
  }))

  const shopHasParcels = shopHasParcelsEarly

  return (
    <>
      {/*
        🛑 มือถือ = hero แทน breadcrumb · จอใหญ่ = breadcrumb ไม่มี hero
        ใส่ทั้งคู่พร้อมกันจะได้หัวเรื่อง "ลูกค้า" ซ้อนกันสองอันในจอเดียว
        (dashboard ก็ไม่มี breadcrumb ในบล็อกมือถือด้วยเหตุผลเดียวกัน — page.tsx:518,568)
        แพตเทิร์นสองชุดใน DOM ให้ CSS ตัดสิน · จุดตัด `md` (768) เพราะ user เคาะว่า
        **แท็บเล็ตเป็นแบบเดียวกับเดสก์ท็อป** (dashboard ใช้ `lg` ซึ่งเป็นคนละมติ)
      */}
      <div className="hidden md:block">
        <PageBreadcrumb title="ลูกค้า" subtitle="ร้านค้า" />
      </div>
      {entries.length > 0 && (
        <div className="-mx-4 mb-2.5 md:hidden">
          <CustomerHero
            totalCustomers={stats.totalCustomers}
            receivedRate={stats.receivedRate}
            returned={stats.returned}
            hasParcels={shopHasParcels}
          />
        </div>
      )}

      {/* Base: theme/paces/.../ecommerce/(orders)/orders/page.tsx — grid การ์ดสถิติเหนือการ์ดตาราง
          `gap-1.25` (5px) ยกจากธีมตรงตัว · เหลือ 4 ใบไม่ใช่ 5 ตามที่ user เคาะ
          🛑 ร้านที่ยังไม่มีลูกค้าเลย → ไม่ render แถวนี้ (การ์ด 4 ใบที่อ่านว่า 0 ทั้งหมด
          คือข้อมูลซ้ำกับข้อความว่างในตารางข้างล่าง)
          🛑 จอใหญ่เท่านั้น — มือถือใช้ `RiskTriageCard` (3 แถวใหญ่) แทน เพราะการ์ด 4 ใบ
          เรียงลงมาบนมือถือกิน ~500px ก่อนถึงลูกค้าคนแรก (บทเรียนเดียวกับที่ /orders เจอ) */}
      {entries.length > 0 && (
        <div className="mb-1.25 hidden grid-cols-1 gap-1.25 md:grid md:grid-cols-2 lg:grid-cols-4">
          {statItems.map((item) => (
            <CustomerStatCard key={item.title} item={item} />
          ))}
        </div>
      )}

      {/* ร้านที่ไม่เคยเปิดพัสดุ — 6 จาก 7 ร้านบน prod เป็นแบบนี้ ไม่ใช่เคสขอบ */}
      {entries.length > 0 && !shopHasParcels && (
        <div className="mb-2.5">
          <NoParcelNotice />
        </div>
      )}

      <CustomerTable
        customers={customers}
        /**
         * แยก "กรองแล้วไม่เจอ" ออกจาก "ร้านนี้ยังไม่มีลูกค้าเลย" — สองอย่างนี้ต้องพูดคนละประโยค
         * ไม่งั้นผู้ใช้ที่กดตัวกรองแล้วเห็น "ยังไม่มีลูกค้า" จะเข้าใจว่าข้อมูลหาย
         */
        hasAnyCustomer={entries.length > 0}
        initialQuery={q}
        initialFilter={filter}
        initialRisk={risk}
        filterCounts={filterCounts}
        totalCustomers={entries.length}
        watchCount={stats.watchCount}
        riskCounts={riskCounts}
        shopReturned={stats.returned}
        shopHasParcels={shopHasParcels}
      />
    </>
  )
}
