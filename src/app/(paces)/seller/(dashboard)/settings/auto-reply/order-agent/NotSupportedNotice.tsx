import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'

/**
 * ร้านที่ไม่ใช่ "ขายออนไลน์" — บอกเหตุผล ไม่ใช่แค่ปิดประตู (BR-ACO-06)
 *
 * 🛑 ต้องบอกว่า *ทำไม* ไม่ใช่ "ใช้ไม่ได้" ลอย ๆ — ฟีเจอร์นี้แกะที่อยู่จัดส่ง/รายการสินค้า
 * ซึ่งร้านคิวงาน/บ้านพักไม่มีทั้งคู่ ถ้าไม่อธิบาย ผู้ขายจะคิดว่าระบบพังหรือตัวเองตั้งค่าผิด
 */
export default function NotSupportedNotice() {
  return (
    <div className="card">
      <div className="card-body flex flex-col items-center gap-3 py-10 text-center">
        <span className="bg-default-100 text-default-600 flex size-12 items-center justify-center rounded-lg">
          <Icon icon="info-circle" className="text-2xl" aria-hidden="true" />
        </span>
        <h5 className="text-default-800 mb-0 text-md font-semibold">
          ฟีเจอร์นี้ใช้ได้กับร้านขายออนไลน์เท่านั้น
        </h5>
        <p className="text-default-600 mb-0 max-w-md text-sm">
          ระบบอ่านข้อความสรุปคำสั่งซื้อโดยมองหารายการสินค้าและที่อยู่จัดส่ง ซึ่งเป็นข้อมูลที่ร้านบริการ
          และบ้านพักไม่ได้ใช้ — ถ้าร้านของคุณขายสินค้าด้วย เปลี่ยนประเภทกิจการได้ที่หน้าตั้งค่าร้าน
        </p>
        <Link href="/shop" className="btn btn-sm bg-light text-default-700 hover:bg-light-hover">
          ไปตั้งค่าร้าน
        </Link>
      </div>
    </div>
  )
}
