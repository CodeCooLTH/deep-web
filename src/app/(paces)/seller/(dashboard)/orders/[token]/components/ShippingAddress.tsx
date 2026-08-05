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
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import type { ShippingAddressData } from './order-detail-shared'

export type ShippingAddressCardProps = {
  shippingAddr: ShippingAddressData | null
  /** 'SHIPPED' | 'NO_SHIPPING' | 'PICKUP' */
  fulfillmentMode: string
  accessUrl: string | null
  publicToken: string
}

export default function ShippingAddress({
  shippingAddr,
  fulfillmentMode,
  accessUrl,
  publicToken,
}: ShippingAddressCardProps) {
  const router = useRouter()
  // allow-list ไม่ใช่ deny-list — fulfillmentMode เป็น String ค่าใหม่ในอนาคตต้องไม่หลุดเข้าโหมด
  // "ต้องส่งของ" เองโดยอัตโนมัติ (นี่คือสาเหตุที่ PICKUP เคยหลุดมาแล้วครั้งหนึ่ง)
  const hasShipping = fulfillmentMode === 'SHIPPED'
  // เจตนาเช็ค NO_SHIPPING ตรง ๆ ไม่รวม PICKUP — จองที่พักไม่มีลิงก์ดาวน์โหลดให้ส่งมอบ
  const showAccessUrl = fulfillmentMode === 'NO_SHIPPING'

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

  // จองที่พัก/รับเอง — ไม่มีทั้งที่อยู่จัดส่งและลิงก์ดิจิทัล จึงไม่ render การ์ดนี้เลย ไม่ใช่การ์ดว่าง
  if (!hasShipping && !showAccessUrl) return null

  const line2 = shippingAddr ? [shippingAddr.subdistrict, shippingAddr.district].filter(Boolean).join(' ') : ''
  const line3 = shippingAddr ? [shippingAddr.province, shippingAddr.postcode].filter(Boolean).join(' ') : ''
  const addrLines = shippingAddr
    ? [shippingAddr.line1, line2, line3].filter((l) => l && String(l).trim())
    : []

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">{showAccessUrl ? 'การส่งมอบ' : 'ที่อยู่จัดส่ง'}</h4>
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
      </div>
    </div>
  )
}
