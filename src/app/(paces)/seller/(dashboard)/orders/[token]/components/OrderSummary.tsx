'use client'

/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/OrderSummary.tsx
 *
 * copy โครงจากธีมตรง ๆ: `card-header block items-start p-7.5 md:flex` (ซ้าย = เลขออเดอร์ +
 * วันที่ icon calendar + badge / ขวา = `md:ms-auto` ปุ่ม) · `card-body px-7.5!` + `h4` +
 * `.table-wrapper > table.table.table-bordered` + `thead.thead-sm.text-2xs.uppercase.bg-light/25`
 * + แถวสรุปท้ายตาราง (`colSpan={3} text-right font-medium`, Grand Total มี `border-t` + `bg-default-50`)
 *
 * adapt จากธีม (บังคับ ไม่ใช่รสนิยม):
 *   - ปุ่ม Modify/Delete ของธีมเป็น `<Link href="">` เปล่า — ไม่มี flow จริงรองรับ ใส่ไว้ = affordance
 *     หลอก แทนด้วย OrderActionBar variant="inline" ที่ใช้ actionSet เดียวกับแถบล่างมือถือ
 *     (ไม่มี markup ปุ่มเขียนเองในไฟล์นี้ — ปุ่มมาจากที่เดียวเสมอ)
 *   - ธีมไม่มีไทล์ช่องทางการขาย เราเพิ่ม (ร้านที่ขายหลายช่องทางต้องรู้ตั้งแต่แวบแรกว่าใบนี้มาจากไหน)
 *   - ตารางของธีมเป็นเดสก์ท็อปล้วน — ร้านใช้มือถือเป็นหลัก จึงมีรายการแบบ stacked ที่ <sm
 *     (ยกจาก OrderFactsCard.tsx เดิมทั้งก้อน ผ่าน QA มาแล้ว ไม่ประดิษฐ์ใหม่)
 *   - คอนทราสต์: ธีมใช้ `text-default-400` กับ body text (2.46:1) และ `text-success`/`text-info`
 *     บนพื้น `/15` — ตก AA ทุกจุด เปลี่ยนเป็น `-700`/`-ink` (badge มาจาก SSOT ที่แก้ไว้แล้ว)
 */

import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import { formatDateTimeTH } from '@/lib/format-date'
import { formatOrderNo } from '@/lib/order-no'
import { getPaymentBadge } from '@/lib/order-display'
import { resolveOrderStatusBadge, type ShippingStageKey } from '@/lib/order-stage'
import type { OrderStatusTone } from '@/lib/order-display'
import type { OrderStatus } from '@/lib/order-display'
import { SalesChannelLogo, getSalesChannelDisplay } from '@/components/safepay/SalesChannelBadge'
import OrderSourceLogo from '../../components/OrderSourceLogo'
import OrderActionBar from '@/components/safepay/OrderActionBar'
import type { OrderActionSet } from './order-action-set'
import {
  ItemThumbnail,
  buildBreakdown,
  formatAmount,
  toNum,
  type OrderFactsItem,
} from './order-detail-shared'

export type OrderSummaryProps = {
  publicToken: string
  status: string
  /** กองงานตามสถานะพัสดุ — undefined = ร้านที่ไม่ใช่ ONLINE_SALES (ป้ายกลับไปใช้ status ล้วน) */
  shippingStage?: ShippingStageKey
  createdAtISO: string
  salesChannel: string | null
  /** รูปเพจที่ลูกค้าทักมา — null = ใช้โลโก้แพลตฟอร์มเดิม (user 2026-08-06) */
  pageLogoUrl?: string | null
  /** หมายเหตุที่ร้านพิมพ์ไว้ตอนสร้างออเดอร์ — เห็นเฉพาะร้าน ผู้ซื้อไม่เห็น */
  internalNote: string | null
  /** true = เก็บเงินปลายทาง → ไม่ต้องมี badge วิธีชำระที่หัว เพราะมีการ์ดของตัวเองอยู่ขวามือ */
  isCod: boolean
  paymentMethod: string | null
  slipFileId: string | null
  /**
   * ป้ายสถานะที่ผู้เรียกคำนวณมาแล้ว (ร้านบริการ) — null = ใช้ป้ายเดิมจาก `status`
   *
   * 🛑 รับ **ผลลัพธ์** ไม่ใช่ `money` ดิบ: การ์ดนี้ใช้ร่วมทุก vertical ถ้าให้มันตัดสินเอง
   * ว่าใบไหนเป็นร้านบริการ จะกลายเป็นด่าน vertical ตัวที่สองที่ต้องดูแลคู่กันไปตลอด
   */
  serviceBadge?: { label: string; cls: string; icon: string; tone: OrderStatusTone } | null
  isFromAuction: boolean
  items: OrderFactsItem[]
  discount: unknown
  vatRate: unknown
  vatAmount: unknown
  totalAmount: unknown
  /** ชุดปุ่มที่ getOrderActionSet() คำนวณไว้แล้ว — ไฟล์นี้แค่ render ไม่ตัดสินเอง */
  actionSet: OrderActionSet
  onAction: (key: string) => void
  /** ชื่อของสิ่งนั้นตามประเภทกิจการ (feature 00030) */
  orderNoun?: string
}

export default function OrderSummary({
  publicToken,
  status,
  shippingStage,
  createdAtISO,
  salesChannel,
  pageLogoUrl = null,
  internalNote,
  isCod,
  paymentMethod,
  slipFileId,
  isFromAuction,
  items,
  discount,
  vatRate,
  vatAmount,
  totalAmount,
  actionSet,
  onAction,
  orderNoun = 'คำสั่งซื้อ',
  serviceBadge = null,
}: OrderSummaryProps) {
  // ป้ายหัวต้องรวมสถานะพัสดุด้วย ไม่ใช่อ่าน status ดิบ — ใบ COD ที่ส่งถึงแล้วแต่ร้านยังไม่ได้
  // กดรับเงิน เดิมขึ้น "กำลังจัดส่ง" ขัดกับการ์ด "เก็บเงินปลายทาง" ที่อยู่ขวามือในหน้าเดียวกัน
  const meta = serviceBadge ?? resolveOrderStatusBadge(status, shippingStage)
  const paymentBadge = getPaymentBadge(status, paymentMethod, slipFileId)
  const channelLabel = getSalesChannelDisplay(salesChannel || 'OTHER').label

  const subtotal = items.reduce((sum, it) => sum + toNum(it.price) * it.qty, 0)
  const rows = buildBreakdown({
    subtotal,
    discount: toNum(discount),
    vatAmount: toNum(vatAmount),
    vatPct: parseFloat((toNum(vatRate) * 100).toFixed(2)),
    total: toNum(totalAmount),
  })

  return (
    <div className="card">
      {/* ธีมใช้ p-7.5 (30px) + px-7.5! ในตัว — วัดจริงแล้วการ์ดสูง 468px สำหรับสินค้าชิ้นเดียว
          (user: "padding เยอะ") ลดเหลือ p-5 ทั้งคู่ ยังเป็น token ของ Paces ไม่ใช่ arbitrary */}
      <div className="card-header block items-start p-5 md:flex">
        <div className="flex min-w-0 items-start gap-3.5">
          {/* ไทล์ช่องทางการขาย — โลโก้เต็มสี่เหลี่ยม (user สั่ง 2026-08-05)
              ช่องทางเป็น null (ออเดอร์เก่าก่อนมี field นี้) → OTHER เพื่อไม่ให้เลย์เอาต์กระโดด */}
          {pageLogoUrl ? (
            /* รูปเพจที่ลูกค้าทักมา + badge แพลตฟอร์มห้อยมุม (user 2026-08-06) —
               component เดียวกับคอลัมน์ "ที่มา" ในลิสต์ (fallback chain เพจ→แพลตฟอร์ม→icon) */
            <span aria-label={`ขายผ่าน ${channelLabel}`} className="shrink-0">
              <OrderSourceLogo logoUrl={pageLogoUrl} channel={salesChannel} size="lg" />
            </span>
          ) : (
            <span
              aria-label={`ขายผ่าน ${channelLabel}`}
              className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl"
              title={`ขายผ่าน ${channelLabel}`}
            >
              <SalesChannelLogo channel={salesChannel || 'OTHER'} className="size-full rounded-xl" size={48} />
            </span>
          )}

          <div className="min-w-0">
            {/* เลขคำสั่งซื้อ — ห้าม font-mono (Anuphan ไม่มี mono จะ fallback Courier หลุดธีม) */}
            <h2 className="text-default-900 mb-1.25 flex items-center text-lg font-bold">
              {formatOrderNo(publicToken, createdAtISO)}
            </h2>
            {/* ไม่มีชื่อผู้ซื้อตรงนี้แล้ว (user บอก 2026-08-06 ว่าซ้ำ) — การ์ด "ผู้ซื้อ" ขวามือ
                เป็นเจ้าของข้อมูลคนซื้อ (รูป+ชื่อ+ที่มาของชื่อ+เบอร์+จำนวนครั้งที่สั่ง) หัวการ์ดนี้
                ตอบคำถามคนละชุด: ใบไหน · มาจากช่องทางไหน · เมื่อไร · สถานะอะไร (= โครงเดิมของธีม) */}
            <p className="text-default-700 mb-3.5 flex items-center gap-1 text-xs">
              <Icon icon="calendar" className="align-middle" aria-hidden="true" />
              {formatDateTimeTH(createdAtISO)}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cn('badge badge-label text-2xs font-semibold', meta.cls)}>
                <Icon icon={meta.icon} className="text-sm" aria-hidden="true" />
                {meta.label}
              </span>
              {/**
                * 🛑 `!serviceBadge` — ห้ามขึ้นคู่กับป้ายของร้านบริการ (HR16)
                *
                * สองใบนี้ตอบ **คำถามเดียวกัน** ("ได้เงินหรือยัง") จากคนละแหล่ง:
                *   · `serviceBadge` อ่าน `OrderPayment` = เงินที่รับจริง → "ชำระเงินแล้ว"
                *   · `getPaymentBadge` อ่าน `Order.status` + `paymentMethod` (ไม่รู้จัก
                *     ตาราง `OrderPayment` เลย) → ใบที่ `PENDING` + วิธีชำระนอก enum
                *     (เช่น `CASH`) ตกไป fallback "ยังไม่ยืนยันการชำระ" เสมอ
                *
                * ⇒ ใบเดียวกันขึ้นทั้ง "ชำระเงินแล้ว" (เขียว) และ "ยังไม่ยืนยันการชำระ" (เหลือง)
                * ติดกัน — user เจอเองบน prod 2026-08-23 (ใบ DP256908CEB304D4: PENDING · CASH ·
                * รับมัดจำ ฿900 เต็มจำนวนแล้ว)
                *
                * ร้านบริการยึด **เงินที่รับจริง** เป็นความจริงเรื่องเงิน ป้ายเก่าจึงเป็นความเห็นที่สอง
                * ที่ล้าสมัยและขัดกันเอง · ร้าน vertical อื่น `serviceBadge` เป็น null เสมอ ⇒ ไม่กระทบ
                *
                * ออเดอร์ COD มีการ์ด "เก็บเงินปลายทาง" อยู่ขวามือแล้ว badge ตรงนี้เป็นข้อมูลซ้ำ
                */}
              {!isCod && !serviceBadge && paymentBadge && (
                <span className={cn(paymentBadge.cls, 'text-2xs font-semibold')}>{paymentBadge.label}</span>
              )}
              {isFromAuction && (
                <span className="badge badge-label bg-warning/15 text-warning-ink text-2xs font-semibold">
                  <Icon icon="gavel" className="text-sm" aria-hidden="true" />
                  จากการประมูล
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ธีมวางปุ่มไว้ `mt-4 md:ms-auto md:mt-0` — คงตำแหน่งเดิม เปลี่ยนแค่มาจาก actionSet
            ซ่อน <768 เพราะมี OrderActionBar variant="bottom" ติดล่างจออยู่แล้ว (ธีมไม่มี pattern
            มือถือเลย ส่วนนี้เป็น adapt ที่จำเป็น) */}
        <div className="mt-4 hidden md:ms-auto md:mt-0 md:block">
          <OrderActionBar actionSet={actionSet} onAction={onAction} variant="inline" />
        </div>
      </div>

      <div className="card-body px-5!">
        <h4 className="text-default-900 mb-5 text-md font-semibold">รายการ{orderNoun}</h4>

        {/* ── มือถือ (<sm): รายการแบบ stacked — ธีมไม่มี ต้อง adapt เพราะร้านใช้มือถือเป็นหลัก ── */}
        <div className="sm:hidden">
          {items.length === 0 ? (
            <p className="text-default-700 py-6 text-center">ยังไม่มีรายการสินค้า</p>
          ) : (
            <div className="divide-default-200 divide-y">
              {items.map((item) => (
                <div className="flex items-start gap-3 py-3" key={item.id}>
                  <ItemThumbnail imageUrl={item.imageUrl} name={item.name} />
                  <div className="min-w-0 flex-1">
                    <p className="text-default-800 truncate leading-snug font-medium">{item.name}</p>
                    {item.description && (
                      <p className="text-default-700 mt-0.5 truncate text-2xs">{item.description}</p>
                    )}
                    <p className="text-default-700 mt-1 text-sm">
                      {formatAmount(item.price)} × {item.qty}{' '}
                      <span className="text-default-800 font-semibold">
                        = {formatAmount(Number(item.price) * item.qty)}
                      </span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-default-300 mt-4 space-y-1.5 border-t pt-3">
            {rows.map((r) => (
              <div
                className={cn(
                  'flex justify-between text-sm',
                  r.emphasis && 'border-default-300 text-default-800 mt-1 border-t pt-2 font-bold',
                )}
                key={r.key}
              >
                <span className={r.emphasis ? '' : 'text-default-800 font-medium'}>{r.label}</span>
                <span
                  className={cn(
                    r.emphasis ? 'text-default-800 font-bold' : 'text-default-800',
                    r.tone === 'danger' && 'text-danger-ink font-semibold',
                  )}
                >
                  {r.prefix ?? ''}
                  {formatAmount(r.value)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── ≥sm: ตารางของธีมตรง ๆ ── */}
        <div className="table-wrapper hidden sm:block">
          <table className="table table-bordered">
            <thead className="thead-sm bg-light/25 text-2xs">
              <tr>
                <th>ชื่อสินค้า</th>
                <th>ราคา/ชิ้น</th>
                <th>จำนวน</th>
                <th className="text-end">รวม</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td className="text-default-700 py-6 text-center" colSpan={4}>
                    ยังไม่มีรายการสินค้า
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="flex items-center gap-base">
                        <ItemThumbnail imageUrl={item.imageUrl} name={item.name} />
                        <div>
                          {/* ชื่อสินค้าไม่ใช่หัวข้อจริง — h5 ซ้ำจำนวนแถวทำให้ heading outline พัง */}
                          <p className="text-default-800 mb-0.5 font-medium">{item.name}</p>
                          {item.description && <p className="text-default-700 text-2xs">{item.description}</p>}
                        </div>
                      </div>
                    </td>
                    <td>{formatAmount(item.price)}</td>
                    <td>{item.qty}</td>
                    <td className="text-end font-medium">{formatAmount(Number(item.price) * item.qty)}</td>
                  </tr>
                ))
              )}

              {rows.map((r) => (
                <tr className={r.emphasis ? 'border-default-300 border-t' : undefined} key={r.key}>
                  <td
                    className={cn('px-4 py-3 text-right', r.emphasis ? 'font-bold' : 'text-default-800 font-medium')}
                    colSpan={3}
                  >
                    {r.label}
                  </td>
                  <td
                    className={cn(
                      'text-end',
                      r.emphasis && 'bg-default-50 font-bold',
                      r.tone === 'danger' && 'text-danger-ink px-4 py-3 font-semibold',
                    )}
                  >
                    {r.prefix ?? ''}
                    {formatAmount(r.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Order.internalNote — ร้านกรอกได้ตอนสร้างออเดอร์ (POS/quick form) แต่หน้ารายละเอียด
            ไม่เคยแสดงเลยสักที่ พิมพ์ไว้แล้วเปิดกลับมาดูไม่ได้ = ข้อมูลหายเข้าไปในฐานเฉย ๆ */}
        {internalNote && internalNote.trim() && (
          <div className="bg-warning/15 text-default-800 mt-5 flex items-start gap-2.25 rounded px-3.5 py-2.75 text-xs">
            <Icon icon="note" className="text-warning-ink mt-0.5 shrink-0 text-sm" aria-hidden="true" />
            <span>
              <span className="font-semibold">หมายเหตุภายในร้าน</span> — {internalNote}
              <span className="text-default-700"> (เห็นเฉพาะร้าน ผู้ซื้อไม่เห็น)</span>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
