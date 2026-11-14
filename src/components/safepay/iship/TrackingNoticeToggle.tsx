'use client'

/**
 * 00090 — สวิตช์รายใบ "ส่งเลขพัสดุให้ลูกค้า" ในฟอร์มสร้าง/ผูก/บันทึกเลขพัสดุ (iShip · Flash · ส่งเอง)
 * ค่าที่เลือกถูกเก็บที่ Order.notifyTracking — ระบบส่งอัตโนมัติอ่านทุกครั้งที่ใบนี้จะแจ้งเลข (รวมลองใหม่/กด "จัดส่งแล้ว")
 * แผงพัสดุในแชทไม่ใช้ตัวนี้: แผงมีช่องติ๊กของตัวเองแล้วส่ง notifyCustomer=false (กันส่งซ้ำสองรอบ)
 * Base: theme/paces — form-checkbox · โครงเดียวกับช่องติ๊ก notifyBlock ใน ShipmentDraftPanel
 */
export default function TrackingNoticeToggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex min-h-11 items-start gap-2">
      <input
        type="checkbox"
        className="form-checkbox mt-0.5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-default-900">ส่งเลขพัสดุให้ลูกค้าอัตโนมัติ</span>
        <span className="block text-xs text-default-700">
          ส่งในห้องแชทที่ผูกกับออเดอร์นี้ เมื่อเปิด &quot;เมื่อมีเลขพัสดุ&quot; ไว้ในตั้งค่าส่งข้อความอัตโนมัติ
        </span>
      </span>
    </label>
  )
}
