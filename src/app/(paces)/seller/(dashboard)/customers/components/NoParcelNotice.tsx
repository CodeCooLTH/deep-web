/**
 * NoParcelNotice — บอกว่า "คอลัมน์ความน่าเชื่อถือว่างเพราะ **ร้านคุณ** ไม่ใช่เพราะลูกค้า"
 *
 * 🛑 ไม่ใช่เคสขอบ — วัด prod 2026-08-26 แล้ว **6 จาก 7 ร้านไม่เคยเปิดพัสดุผ่านระบบเลย**
 * รวมร้านที่มี 106 ออเดอร์ ⇒ นี่คือสภาพของ "ร้าน" ส่วนใหญ่ ไม่ใช่ข้อยกเว้น
 *
 * ถ้าไม่ติดป้าย ผู้ขายจะอ่านหน้าจอว่า *"ลูกค้าทุกคนไม่มีประวัติ"* ทั้งที่ความจริงคือ
 * *"ร้านฉันยังไม่เคยส่งของผ่าน Deep"* — คนละสาเหตุ และคนละสิ่งที่ต้องทำต่อ
 * (`docs/conventions/partial-data-must-be-labeled-or-filled.md`)
 *
 * 🛑 ใช้ `info` ไม่ใช่ `warning` — นี่ไม่ใช่ความผิดพลาดของร้าน เป็นการอธิบายกลไก
 * และมีปุ่มพาไปทำจริง ไม่ใช่บอกเฉย ๆ แล้วปล่อยเป็นทางตัน
 */
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'

export default function NoParcelNotice() {
  return (
    <div className="card">
      <div className="card-body flex items-start gap-3">
        <span className="text-info shrink-0 text-3xl">
          <Icon icon="solar:delivery-bold-duotone" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-default-900 mb-1 text-sm font-bold">ร้านคุณยังไม่เคยเปิดพัสดุผ่าน Deep</p>
          <p className="text-default-500 mb-2 text-xs">
            คอลัมน์ความน่าเชื่อถือจึงยังว่าง — <b>ไม่ได้แปลว่าลูกค้าไม่มีประวัติ</b>{' '}
            แต่แปลว่าเรายังไม่มีผลการส่งของร้านคุณมานับ ข้อมูลจะเริ่มขึ้นเองตั้งแต่พัสดุใบแรก
          </p>
          <Link
            href="/orders"
            className="btn btn-sm bg-primary hover:bg-primary-hover gap-1 text-white">
            <Icon icon="solar:box-bold-duotone" className="text-base" aria-hidden="true" />
            เปิดพัสดุใบแรก
          </Link>
        </div>
      </div>
    </div>
  )
}
