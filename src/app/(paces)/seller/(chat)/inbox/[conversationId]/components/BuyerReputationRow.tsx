'use client'

/**
 * BuyerReputationRow — แถบ "ทั้งระบบ" ของลูกค้าคนนี้ (feature 00055 · D-1)
 *
 * ทำไมเป็น component แยก ไม่ใช่ JSX ก้อนหนึ่งใน CustomerPanel: มันจะถูกใช้ซ้ำที่จอเตือน
 * ก่อนเปิดพัสดุ COD (D-3) ซึ่งเป็นจุดที่ตัวเลขชุดนี้มีประโยชน์ที่สุด — ถ้าเขียนซ้ำสองที่
 * คำกับเกณฑ์จะเลื่อนออกจากกันเงียบ ๆ (HR16)
 *
 * 🛑 ถ้อยคำต้องเป็นกลาง (BR-BR-09) — ใช้ "พัสดุตีกลับ" ห้ามใช้ "ปฏิเสธรับของ"/"ลูกค้าเสี่ยง"
 * เพราะพัสดุตีกลับเกิดจากที่อยู่ผิด/ขนส่งส่งไม่ถึงได้ ไม่ใช่ลูกค้าปฏิเสธเสมอ เราไม่รู้ว่าใครผิด
 * เคยพลาดคลาสนี้มาแล้ว 2026-08-11 (ป้าย "เคยยกเลิก N ครั้ง" นับการยกเลิกของร้านเองไปโทษลูกค้า)
 *
 * Base: แถวสถิติในแท็บข้อมูลลูกค้าของ CustomerPanel (label ซ้าย / ค่าขวา) + badge tone ของ Paces
 */

import Icon from '@/components/wrappers/Icon'
import type { BuyerReputation } from '@/lib/buyer-reputation'

/** สี + ไอคอนต่อระดับ — ไม่มีระดับ "แดง" โดยตั้งใจ: เราเตือน ไม่ได้ตัดสิน (BR-BR-08/09) */
const RISK_META: Record<BuyerReputation['riskLevel'], { cls: string; icon: string } | null> = {
  NONE: null,
  WATCH: { cls: 'bg-warning/15 text-warning-ink', icon: 'alert-circle' },
  HIGH: { cls: 'bg-warning/15 text-warning-ink', icon: 'alert-triangle' },
}

export default function BuyerReputationRow({ data }: { data: BuyerReputation }) {
  const risk = RISK_META[data.riskLevel]
  /**
   * อัตราแสดงเฉพาะเมื่อฐานพอ (BR-BR-06) — `null` ไม่ใช่ 0 · สั่ง 1 ตีกลับ 1 = 100%
   * ซึ่งอ่านว่าเลวร้ายที่สุดในระบบทั้งที่บอกอะไรไม่ได้เลย
   */
  const ratePct = data.returnRate === null ? null : Math.round(data.returnRate * 100)

  return (
    <div className="border-default-200 border-b border-dashed px-4 pb-3">
      <p className="text-default-500 mb-1.5 flex items-center gap-1 text-2xs">
        <Icon icon="world" className="text-xs" aria-hidden="true" />
        ทั้งระบบ
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="badge bg-default-100 text-default-700 text-2xs">
          สั่ง {data.orders.toLocaleString('th-TH')}
        </span>
        <span className="badge bg-success/15 text-success-ink text-2xs">
          รับของ {data.received.toLocaleString('th-TH')}
        </span>
        {data.returned > 0 && (
          <span className={`badge text-2xs inline-flex items-center gap-1 ${risk?.cls ?? ''}`}>
            <Icon icon="arrow-back-up" className="text-xs" aria-hidden="true" />
            พัสดุตีกลับ {data.returned.toLocaleString('th-TH')}
          </span>
        )}
        {data.cancelledByBuyer > 0 && (
          <span className="badge bg-default-100 text-default-700 text-2xs">
            ยกเลิก {data.cancelledByBuyer.toLocaleString('th-TH')}
          </span>
        )}
      </div>
      {/* บรรทัดอัตรา — แยกจากแถวชิปเพราะเป็นการ *ตีความ* ไม่ใช่ข้อเท็จจริงดิบ
          ไม่มีอัตราให้บอก = ไม่ขึ้นบรรทัดนี้เลย ไม่ใช่ขึ้นว่า "—" (ค่าตั้งต้นของระบบคือเงียบ) */}
      {ratePct !== null && data.returned > 0 && risk && (
        <p className="text-default-600 mt-1.5 mb-0 flex items-start gap-1 text-2xs">
          <Icon icon={risk.icon} className="mt-px shrink-0 text-xs" aria-hidden="true" />
          <span>
            พัสดุตีกลับ {ratePct}% ของ {data.shipped.toLocaleString('th-TH')} ใบที่เปิดพัสดุ
          </span>
        </p>
      )}
    </div>
  )
}
