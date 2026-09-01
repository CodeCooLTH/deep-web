'use client'

/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/ShippingAddress.tsx
 *
 * copy จากธีม: `card-header` + `card-body` + บล็อกชื่อ/ที่อยู่หลายบรรทัด + callout กล่องหมายเหตุ
 *
 * ตัดจากธีม:
 *   - **iframe Google Maps** (user สั่งตัดตรง ๆ) — และมันมี API key ของธีมฝังในโค้ด ใช้ไม่ได้อยู่แล้ว
 *     ที่สำคัญกว่าคือทุกครั้งที่เปิดหน้า ที่อยู่ลูกค้าจะถูกส่งออกไปให้ Google
 *   - badge "Primary Address" — ระบบมีที่อยู่เดียวต่อออเดอร์ ไม่มีแนวคิด primary/secondary
 *     badge ที่ไม่ได้ถืออะไรจริง = ของตกแต่ง
 *   - ปุ่มดินสอที่หัวการ์ด — ไม่มีหน้าแก้ที่อยู่แยก (แก้ผ่านหน้าแก้ไขคำสั่งซื้อ)
 *
 * ที่เพิ่ม: สาขา `NO_SHIPPING` = ฟอร์มลิงก์ส่งมอบดิจิทัล (ยกจาก OrderFactsCard.tsx ทั้งก้อน)
 * เพราะออเดอร์กลุ่มนั้นไม่มีที่อยู่ให้แสดง แต่มี "ของที่ต้องส่งมอบ" เหมือนกัน — ไม่ใช่การ์ดว่าง
 *
 * ที่เพิ่ม (feature 00062, U16): สาขา `PICKUP` = การ์ด "การนัดรับ" (UX-Design-Spec §A2+A4)
 * — รวม "ที่อยู่นัดรับ" (Shop.address) กับ "มอบสินค้าแล้วหรือยัง" ไว้ในการ์ดเดียว mirror โครง/
 * ตำแหน่ง/ปุ่ม `hidden lg:flex` จาก CodCard.tsx **แต่ห้าม mirror สี** — badge "รอผู้ซื้อยืนยัน"
 * ต้องเป็น info ไม่ใช่ success (Verified-Means-Green สงวนเขียวให้ status==='CONFIRMED' เท่านั้น)
 *
 * 🛑 `fulfillmentMode==='PICKUP'` ถูกใช้อยู่ก่อนแล้วโดย booking.service.ts (feature 00017 —
 * ออเดอร์จองที่พัก, Shop.vertical='LODGING') ซึ่งเป็นคนละความหมายกับ "นัดรับสินค้า" ของฟีเจอร์นี้
 * (Shop.vertical='ONLINE_SALES') — ต้องเช็ค `isOnlineSalesShop` ควบคู่เสมอ ไม่งั้นออเดอร์จองที่พัก
 * จะโผล่การ์ด "การนัดรับ"/ปุ่มมอบสินค้าที่ไม่เกี่ยวข้องผิดที่ (LODGING มี AppointmentCard ของตัวเองแล้ว)
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/utils/helpers'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { getLocalityStatus } from '@/lib/shipping-address-status'
import {
  computeAutoConfirmDeadline,
  derivePickupStage,
  PICKUP_STAGE_LABEL,
} from '@/lib/order-pickup'
import type { OrderStatusTone } from '@/lib/order-display'
import { formatDateTimeTH } from '@/lib/format-date'
import type { ShippingAddressData } from './order-detail-shared'
import { pacesConfirm } from '@/lib/paces-swal'

// PICKUP_STAGE_LABEL คืนแค่ {label, tone} — order-display.ts ไม่มี tone→cls converter กลาง
// (badge อื่นในไฟล์ตระกูลนี้เขียน class string ตรง ๆ ต่อ branch เหมือนกัน เช่น CodCard.tsx)
const PICKUP_TONE_CLS: Record<OrderStatusTone, string> = {
  warning: 'bg-warning/15 text-warning-ink',
  info: 'bg-info/15 text-info-ink',
  success: 'bg-success/15 text-success-ink',
  danger: 'bg-danger/15 text-danger-ink',
  neutral: 'bg-default-100 text-default-800',
}

export type ShippingAddressCardProps = {
  shippingAddr: ShippingAddressData | null
  /** 'SHIPPED' | 'NO_SHIPPING' | 'PICKUP' */
  fulfillmentMode: string
  accessUrl: string | null
  publicToken: string
  /**
   * ใบนี้เป็นงานบริการที่มีนัดไหม (feature 00036 FR-SOV-004)
   *
   * `fulfillmentMode === 'NO_SHIPPING'` เพียงอย่างเดียวคลุมทั้งสินค้าดิจิทัลและงานบริการไว้
   * ด้วยกัน — ร้านที่รับติดตั้ง/ตกแต่งจึงเคยได้ฟอร์ม "กรอก URL เพื่อส่งมอบให้ผู้ซื้อ" ซึ่งไม่มี
   * ทางกรอกอะไรที่สมเหตุสมผล (คอมเมนต์เดิมที่ showAccessUrl เคยแยก PICKUP ออกไปแล้ว
   * ด้วยเหตุผลชุดเดียวกัน แค่ยังไม่ครอบงานบริการ)
   */
  isServiceOrder?: boolean
  // ── feature 00062 (U16): การ์ด "การนัดรับ" (PICKUP + Shop.vertical==='ONLINE_SALES') ──────
  /** ร้านนี้เป็น ONLINE_SALES ไหม — คัดกรอง PICKUP ของฟีเจอร์นี้ออกจาก PICKUP ของการจองที่พัก (00017) */
  isOnlineSalesShop?: boolean
  /** Order.status ('PENDING'|'SHIPPED'|'CONFIRMED'|'CANCELLED'|'RETURNED') — ตัดสิน stage/badge */
  status?: string
  /** ISO ของเวลาที่ร้านกด "มอบสินค้าแล้ว" — null = ยังไม่กด */
  handedOverAtISO?: string | null
  /** ชื่อคนที่กดมอบของ — null = ไม่ทราบ/ระบบ (getOrderForShop ยังไม่ include ความสัมพันธ์นี้) */
  handedOverByLabel?: string | null
  /** Order.disputeOpenedAt (ISO) — feature 00039 ข้อพิพาททั่วไป ไม่ผูกกับ PICKUP โดยเฉพาะ */
  disputeOpenedAtISO?: string | null
  disputeResolvedAtISO?: string | null
  /** ชื่อร้าน (Shop.shopName) — แสดงเป็น "จุดนัดรับ" */
  shopName?: string
  /** Shop.address — null = ยังไม่ได้ตั้งที่อยู่ร้าน */
  shopAddress?: string | null
}

export default function ShippingAddress({
  shippingAddr,
  fulfillmentMode,
  accessUrl,
  publicToken,
  isServiceOrder = false,
  isOnlineSalesShop = false,
  status = 'PENDING',
  handedOverAtISO = null,
  handedOverByLabel = null,
  disputeOpenedAtISO = null,
  disputeResolvedAtISO = null,
  shopName = '',
  shopAddress = null,
}: ShippingAddressCardProps) {
  const router = useRouter()
  // allow-list ไม่ใช่ deny-list — fulfillmentMode เป็น String ค่าใหม่ในอนาคตต้องไม่หลุดเข้าโหมด
  // "ต้องส่งของ" เองโดยอัตโนมัติ (นี่คือสาเหตุที่ PICKUP เคยหลุดมาแล้วครั้งหนึ่ง)
  const hasShipping = fulfillmentMode === 'SHIPPED'
  // เจตนาเช็ค NO_SHIPPING ตรง ๆ ไม่รวม PICKUP — จองที่พักไม่มีลิงก์ดาวน์โหลดให้ส่งมอบ
  // และไม่รวมงานบริการที่มีนัดด้วย ด้วยเหตุผลเดียวกัน (การ์ด "การนัดหมาย" เป็นที่ของมันแทน)
  const showAccessUrl = fulfillmentMode === 'NO_SHIPPING' && !isServiceOrder
  // feature 00062 — ต้องคู่กับ isOnlineSalesShop เสมอ (ดู comment หัวไฟล์) กัน PICKUP ของ
  // การจองที่พัก (00017, LODGING) หลุดเข้าการ์ด "การนัดรับ" ที่ไม่เกี่ยวข้อง
  const showPickup = fulfillmentMode === 'PICKUP' && isOnlineSalesShop
  const isCancelled = status === 'CANCELLED'
  const pickupStage = showPickup
    ? derivePickupStage({
        status,
        handedOverAt: handedOverAtISO,
        disputeOpenedAt: disputeOpenedAtISO,
        disputeResolvedAt: disputeResolvedAtISO,
      })
    : null

  const [handoverLoading, setHandoverLoading] = useState(false)

  // มิเรอร์ handleSaveAccessUrl ด้านล่าง (fetch + toast + router.refresh ในไฟล์เดียวกัน) —
  // การ์ดนี้ไม่ได้ถูก OrderDetailClient.tsx render (page.tsx render ตรงใน sideCards) จึงรับ
  // handler จากภายนอกไม่ได้เหมือน CodCard — ต้อง self-contained (เหมือน access-url ที่มีอยู่แล้ว)
  const handleMarkHandedOver = async () => {
    /**
     * 🛑 ต้อง confirm — ปุ่มนี้ **เริ่มนับนาฬิกาปิดงานอัตโนมัติ 48 ชม.** กดพลาดแล้วออเดอร์จะถูก
     * ปิดเองทั้งที่ลูกค้ายังไม่ได้รับของ และไปนับเป็นออเดอร์สำเร็จของร้าน (Trust Score)
     *
     * ต้องเป็นข้อความ/ปุ่มชุดเดียวกับที่แถบ action ล่างจอใช้ (`OrderDetailClient.handlePickupHandedOver`)
     * — ปุ่มเดียวกัน 2 ทางเข้า (การ์ดเดสก์ท็อป / แถบล่างมือถือ) ต้องถามเหมือนกัน ไม่งั้นผู้ใช้
     * เจอพฤติกรรมต่างกันแค่เพราะขนาดจอ (`docs/conventions/sibling-surface-parity.md`)
     */
    const ok = await pacesConfirm.question(
      'ยืนยันว่ามอบสินค้าให้ลูกค้าแล้ว?',
      'ระบบจะปิดงานให้อัตโนมัติเมื่อครบ 48 ชั่วโมง หากลูกค้าไม่ทักท้วง — ยกเลิกได้ก่อนครบกำหนด',
      { confirmButtonText: 'มอบสินค้าแล้ว', cancelButtonText: 'ยังไม่ได้มอบ' },
    )
    if (!ok) return
    setHandoverLoading(true)
    try {
      const res = await fetch(`/api/orders/${publicToken}/handover`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || 'บันทึกไม่สำเร็จ กรุณาลองใหม่')
      }
      pacesToast.success('บันทึกแล้ว')
      router.refresh()
    } catch (err: unknown) {
      pacesToast.error(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setHandoverLoading(false)
    }
  }

  /** ย้อนการยืนยัน — ถามเหมือนกับ undo ของการ์ดเงิน (CodCard/PaymentReceivedCard) ทุกใบในคอลัมน์นี้ */
  const handleUndoHandover = async () => {
    const ok = await pacesConfirm.question(
      'ยกเลิกการยืนยันว่ามอบสินค้าแล้ว?',
      'นาฬิกาปิดงานอัตโนมัติจะหยุดนับ — กดยืนยันใหม่ได้ทุกเมื่อ',
      { confirmButtonText: 'ยกเลิกการยืนยัน', cancelButtonText: 'ไม่ใช่ตอนนี้' },
    )
    if (!ok) return
    setHandoverLoading(true)
    try {
      const res = await fetch(`/api/orders/${publicToken}/handover`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || 'ยกเลิกไม่สำเร็จ กรุณาลองใหม่')
      }
      pacesToast.success('ยกเลิกการยืนยันแล้ว')
      router.refresh()
    } catch (err: unknown) {
      pacesToast.error(err instanceof Error ? err.message : 'ยกเลิกไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setHandoverLoading(false)
    }
  }

  const handleCopyShopAddress = async () => {
    if (!shopAddress) return
    try {
      await navigator.clipboard.writeText(shopAddress)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = shopAddress
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    pacesToast.success('คัดลอกที่อยู่แล้ว')
  }

  const [accessUrlValue, setAccessUrlValue] = useState(accessUrl ?? '')
  const [accessUrlLoading, setAccessUrlLoading] = useState(false)
  const [accessUrlError, setAccessUrlError] = useState('')

  const handleSaveAccessUrl = async () => {
    const url = accessUrlValue.trim()
    if (!url) {
      setAccessUrlError('กรุณากรอกลิงก์ที่จะส่งให้ผู้ซื้อ')
      return
    }
    if (!/^https?:\/\/.+/i.test(url)) {
      setAccessUrlError('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://')
      return
    }
    setAccessUrlError('')
    setAccessUrlLoading(true)
    try {
      const res = await fetch(`/api/orders/${publicToken}/access-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || 'บันทึกลิงก์ไม่สำเร็จ กรุณาลองใหม่')
      }
      pacesToast.success('บันทึกลิงก์แล้ว')
      router.refresh()
    } catch (err: unknown) {
      pacesToast.error(err instanceof Error ? err.message : 'บันทึกลิงก์ไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setAccessUrlLoading(false)
    }
  }

  // จองที่พัก(LODGING)/รับเอง — ไม่มีทั้งที่อยู่จัดส่ง/ลิงก์ดิจิทัล/การนัดรับของฟีเจอร์นี้
  // จึงไม่ render การ์ดนี้เลย ไม่ใช่การ์ดว่าง
  if (!hasShipping && !showAccessUrl && !showPickup) return null

  /**
   * SSOT เดียวกับที่ฟอร์มสร้างออเดอร์ใช้ตัดสินว่า "ที่อยู่ครบพอเปิดพัสดุไหม" —
   * user บอกการ์ดนี้ "ข้อมูลน้อย ไม่มีลูกเล่น" (วัดจริง: 157px, ไม่มีไอคอนสักตัว)
   * สิ่งที่เติมไม่ใช่ของตกแต่ง แต่เป็นคำเตือนที่กันร้านเปิดพัสดุแล้วโดนขนส่งตีกลับ
   */
  const locality = getLocalityStatus(shippingAddr)

  const handleCopyAddress = async () => {
    const text = [line1Text, line2, line3].filter(Boolean).join(' ')
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    pacesToast.success('คัดลอกที่อยู่แล้ว')
  }

  const line1Text = shippingAddr?.line1 ?? ''
  const line2 = shippingAddr ? [shippingAddr.subdistrict, shippingAddr.district].filter(Boolean).join(' ') : ''
  const line3 = shippingAddr ? [shippingAddr.province, shippingAddr.postcode].filter(Boolean).join(' ') : ''
  const addrLines = shippingAddr ? [line1Text, line2, line3].filter((l) => l && String(l).trim()) : []

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">
          {showAccessUrl ? 'การส่งมอบ' : showPickup ? 'การนัดรับ' : 'ที่อยู่จัดส่ง'}
        </h4>
        <div className="flex items-center gap-2">
          {/* badge สถานะกองนัดรับ — SSOT เดียวกับคอลัมน์ย่อในตาราง /orders (A5, HR16)
              🛑 ไม่แสดงตอน CANCELLED — derivePickupStage คืน DONE/success ให้ CANCELLED ด้วย
              (ปิดงานแล้วไม่สนข้อพิพาทเก่า ตามตรรกะกอง) แต่ Verified-Means-Green ห้ามขึ้นเขียว
              ให้ออเดอร์ที่ถูกยกเลิก — UX §A2 edge state อนุญาตให้ "การ์ดหาย/read-only แบบจาง" */}
          {showPickup && pickupStage && !isCancelled && (
            <span className={cn('badge', PICKUP_TONE_CLS[PICKUP_STAGE_LABEL[pickupStage].tone])}>
              {PICKUP_STAGE_LABEL[pickupStage].label}
            </span>
          )}
          {/* ธีมมีปุ่มดินสอที่ไม่ทำอะไร — แทนด้วยปุ่มที่ทำงานจริงและร้านใช้ทุกวันตอนแปะหน้ากล่อง */}
          {((hasShipping && addrLines.length > 0) || (showPickup && shopAddress)) && (
            <button
              className="btn btn-icon border-default-300 text-default-700 hover:text-primary size-11! lg:size-8! rounded-full border"
              onClick={showPickup ? handleCopyShopAddress : handleCopyAddress}
              title="คัดลอกที่อยู่"
              aria-label="คัดลอกที่อยู่"
              type="button"
            >
              <Icon icon="copy" className="text-base" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <div className="card-body">
        {hasShipping &&
          (addrLines.length > 0 ? (
            <p className="text-default-800 mb-0 text-sm">
              {addrLines.map((l, i) => (
                <span key={i}>
                  {l}
                  {i < addrLines.length - 1 && <br />}
                </span>
              ))}
            </p>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Icon icon="map-pin-off" className="text-default-300 mb-2 text-3xl" aria-hidden="true" />
              <p className="text-default-700 text-sm">ยังไม่มีที่อยู่จัดส่ง</p>
            </div>
          ))}

        {/* ขาดตำบล/อำเภอ = บันทึกออเดอร์ผ่าน แต่เปิดพัสดุ iShip ไม่ผ่าน — ต้องบอกก่อนร้านไปกดแล้วเจอ error */}
        {hasShipping && addrLines.length > 0 && locality.recommendedGap && (
          <div className="bg-warning/15 text-default-800 mt-4 flex items-start gap-2.25 rounded px-3.5 py-2.75 text-xs">
            <Icon icon="alert-triangle" className="text-warning mt-0.5 shrink-0 text-sm" aria-hidden="true" />
            <span>ยังไม่มีตำบล/อำเภอ — เติมก่อนเปิดพัสดุกับขนส่ง ไม่งั้นระบบขนส่งจะหาปลายทางไม่เจอ</span>
          </div>
        )}

        {/* callout ของธีม (เดิมเป็น "Delivery Instructions") — เสียบหมายเหตุจริงของเราแทนที่จะทิ้ง */}
        {hasShipping && shippingAddr?.note && shippingAddr.note.trim() && (
          <div className="bg-warning/15 text-default-800 mt-4 flex items-start gap-2.25 rounded px-3.5 py-2.75 text-xs">
            <Icon icon="message-circle" className="text-warning mt-0.5 text-sm shrink-0" aria-hidden="true" />
            <span>
              <span className="font-semibold">หมายเหตุจากผู้ซื้อ</span> — {shippingAddr.note}
            </span>
          </div>
        )}

        {showAccessUrl && (
          <>
            <p className="text-default-700 mb-3 text-xs">
              กรอก URL เพื่อส่งมอบให้ผู้ซื้อ (ต้องเป็น http หรือ https)
            </p>
            <div className="flex gap-2">
              <input
                aria-describedby={accessUrlError ? 'access-url-error' : undefined}
                aria-invalid={accessUrlError ? true : undefined}
                className="form-input flex-1 text-sm"
                disabled={accessUrlLoading}
                onChange={(e) => {
                  setAccessUrlValue(e.target.value)
                  if (accessUrlError) setAccessUrlError('')
                }}
                placeholder="https://example.com/download/..."
                type="url"
                value={accessUrlValue}
              />
              <button
                className="btn bg-primary hover:bg-primary-hover px-4 text-sm font-medium whitespace-nowrap text-white disabled:opacity-60"
                disabled={accessUrlLoading}
                onClick={handleSaveAccessUrl}
                type="button"
              >
                {accessUrlLoading ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
            {accessUrlError && (
              <p className="text-danger-ink mt-1.5 text-xs" id="access-url-error" role="alert">
                {accessUrlError}
              </p>
            )}
            {accessUrl && (
              <p className="text-default-700 mt-2 text-xs break-all">
                <span className="text-default-800 font-medium">บันทึกอยู่:</span> {accessUrl}
              </p>
            )}
          </>
        )}

        {/* feature 00062 (U16) — การ์ด "การนัดรับ" (A2+A4 รวม) */}
        {showPickup && (
          <>
            <div className="flex items-start gap-2.5">
              <span className="btn btn-icon bg-light text-default-800 mt-0.5 size-6! rounded-full">
                <Icon icon="building-store" className="text-sm" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-default-800 mb-1 text-2xs">จุดนัดรับ</p>
                <p className="text-default-900 mb-0.5 text-sm font-medium">{shopName || 'ร้านค้า'}</p>
                {shopAddress ? (
                  <p className="text-default-700 mb-0 text-sm">{shopAddress}</p>
                ) : (
                  <p className="text-default-700 mb-0 text-xs">
                    ยังไม่ได้ตั้งที่อยู่ร้าน —{' '}
                    <Link href="/shop" className="text-primary-ink hover:underline">
                      ตั้งค่าได้ที่หน้าร้านค้า
                    </Link>
                  </p>
                )}
              </div>
            </div>

            {/* ยกเลิกแล้ว = read-only แบบจาง ไม่มี action ใด ๆ (UX §A2 edge state) */}
            {!isCancelled &&
              (!handedOverAtISO ? (
                <>
                  {/* ปุ่มหลักอยู่ที่แถบล่างจอบนมือถือ (<1024, order-action-set.ts) ข้อความนี้แทนที่
                      ปุ่มที่ถูกซ่อนไว้ให้รู้สถานะ — เดสก์ท็อปมีปุ่มด้านล่างอยู่แล้วจึงไม่ต้องมีข้อความซ้ำ */}
                  <p className="text-default-700 mt-4 mb-0 text-sm lg:hidden">ยังไม่ได้มอบสินค้า</p>
                  <button
                    className="btn bg-primary hover:bg-primary-hover mt-4 hidden w-full justify-center text-sm font-medium text-white disabled:opacity-60 lg:flex"
                    disabled={handoverLoading}
                    onClick={handleMarkHandedOver}
                    type="button"
                  >
                    <Icon icon="package-check" className="me-1.5 text-base" aria-hidden="true" />
                    มอบสินค้าแล้ว
                  </button>
                </>
              ) : (
                <div className="border-default-200 mt-4 border-t border-dashed pt-4">
                  <div className="flex items-center gap-3">
                    <span className="bg-success/15 text-success-ink flex size-10 shrink-0 items-center justify-center rounded-full">
                      <Icon icon="circle-check" className="text-xl" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-default-900 mb-0 text-sm font-semibold">มอบของแล้ว</p>
                      <p className="text-default-700 mb-0 text-xs">
                        {formatDateTimeTH(handedOverAtISO)}
                        {handedOverByLabel ? ` · โดย ${handedOverByLabel}` : ''}
                      </p>
                    </div>
                  </div>

                  {pickupStage === 'DISPUTED' ? (
                    <p className="bg-warning/15 text-default-800 mt-4 flex items-start gap-2.25 rounded px-3.5 py-2.75 text-xs">
                      <Icon icon="alert-triangle" className="text-warning mt-0.5 shrink-0 text-sm" aria-hidden="true" />
                      <span>มีข้อทักท้วงจากผู้ซื้อ — ระบบจะไม่ปิดงานอัตโนมัติจนกว่าจะแก้ไขปัญหา</span>
                    </p>
                  ) : pickupStage === 'AWAITING_BUYER_ACK' ? (
                    <p className="text-default-700 mt-3 mb-0 text-xs">
                      ระบบจะปิดงานอัตโนมัติ {formatDateTimeTH(computeAutoConfirmDeadline(new Date(handedOverAtISO)))}{' '}
                      หากไม่มีผู้ซื้อทักท้วง
                    </p>
                  ) : null}

                  {pickupStage !== 'DONE' && (
                    <button
                      className="btn border-default-300 text-default-700 mt-4 hidden w-full justify-center border text-sm font-medium disabled:opacity-60 lg:flex"
                      disabled={handoverLoading}
                      onClick={handleUndoHandover}
                      type="button"
                    >
                      <Icon icon="arrow-back-up" className="me-1.5 text-base" aria-hidden="true" />
                      ยกเลิกการยืนยัน
                    </button>
                  )}
                </div>
              ))}
          </>
        )}
      </div>
    </div>
  )
}
