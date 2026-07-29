'use client'

/**
 * SenderIncompleteNotice — ที่อยู่ผู้ส่งของร้านยังไม่ครบ (feature 00022)
 *
 * แยกออกมาเป็นโหมดของตัวเองเพราะเป็นปัญหา "ระดับร้าน" ที่แก้ครั้งเดียวจบ ไม่ใช่ของออเดอร์ใบนี้
 * ก่อนหน้านี้ UI แยกไม่ออกว่าที่ขาดเป็นของผู้ส่งหรือผู้รับ เลยกางฟอร์มผู้รับให้ร้านกรอกทุกครั้ง
 * ซึ่งกรอกครบแค่ไหนก็สร้างพัสดุไม่ได้ (createShipment ตรวจผู้ส่งก่อนเสมอ) = ทางตัน
 *
 * โหมดนี้จึงไม่มีฟอร์มใด ๆ — มีแต่ทางออกเดียวที่ถูกต้อง
 *
 * Base: alert pattern จาก orders/[token]/components/ShipmentPanel.tsx (bg-warning/15) +
 *       settings/ShippingSettingsRow.tsx (bg-info/15)
 */

import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import type { MissingReceiverField, MissingSenderField } from '@/lib/iship/mapping'

interface Props {
  missing: MissingSenderField[]
  /** ใช้ตัดสินว่าจะบอกว่า "ผู้รับครบแล้ว" ได้ไหม — ถ้าผู้รับก็ขาดด้วยจะเป็นข้อมูลเท็จ */
  missingReceiver: MissingReceiverField[]
  /**
   * deep-link เปิดโมดัลตั้งค่าที่แท็บที่อยู่ผู้ส่งทันที (feature 00022, 2026-07-29)
   * หน้า /settings/shipping ถูกยกเลิกไปแล้ว — ถ้าพาไป /settings เฉย ๆ ร้านต้องไล่หาปุ่ม
   * แล้วคลิกแท็บเองอีกที ซึ่งถอยหลังจากเดิมที่กดแล้วถึงจุดที่ต้องแก้เลย
   */
  settingsHref?: string
}

export default function SenderIncompleteNotice({
  missing,
  missingReceiver,
  settingsHref = '/settings?iship=settings&tab=sender',
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-lg bg-warning/15 px-3 py-2.5 text-sm text-warning">
        <Icon icon="tabler:alert-triangle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
        <div className="min-w-0">
          <p className="mb-1 font-semibold">ยังตั้งที่อยู่ผู้ส่งของร้านไม่ครบ</p>
          <p className="mb-0">ขนส่งต้องรู้ว่าไปรับของที่ไหน — ตั้งครั้งเดียวใช้ได้กับทุกคำสั่งซื้อ</p>
          {missing.length > 0 && (
            <ul className="mb-0 ms-4 mt-1.5 list-disc space-y-0.5">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* บอกว่าผู้รับครบแล้วได้ต่อเมื่อครบจริง — ไม่งั้นร้านจะเชื่อแล้วไปเจอด่านสองทีหลัง */}
      {missingReceiver.length === 0 && (
        <p className="mb-0 flex items-start gap-2 rounded-lg bg-info/15 px-3 py-2.5 text-sm text-info">
          <Icon icon="tabler:info-circle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
          <span>ข้อมูลผู้รับของคำสั่งซื้อนี้ครบแล้ว — ตั้งที่อยู่ผู้ส่งเสร็จ กลับมากดสร้างได้เลย</span>
        </p>
      )}

      <Link
        href={settingsHref}
        className="btn inline-flex w-full items-center justify-center gap-2 bg-primary p-3 text-white hover:bg-primary-hover"
      >
        <Icon icon="tabler:settings" className="text-base" aria-hidden="true" />
        ไปตั้งค่าที่อยู่ผู้ส่ง
      </Link>
      <p className="mb-0 text-center text-xs text-default-400">เจ้าของร้านเท่านั้นที่ตั้งค่านี้ได้</p>
    </div>
  )
}
