'use client'

import Icon from '@/components/wrappers/Icon'
import StateCard from './components/StateCard'

// ไม่แสดง stack/digest และไม่ส่ง log จากฝั่งหน้าสาธารณะ — "ลองใหม่" = โหลดทั้งหน้า (เหมือน (paces)/error.tsx)
export default function LinkReportError() {
  return (
    <StateCard
      icon="cloud-off"
      plate="danger"
      title="เปิดหน้าสรุปไม่สำเร็จ"
      body="เกิดปัญหาชั่วคราวฝั่ง Deep ลองโหลดหน้านี้อีกครั้ง ถ้ายังไม่ได้ ให้กลับไปกดปุ่มบนการ์ดใหม่"
    >
      <button type="button" onClick={() => window.location.reload()} className="btn bg-primary hover:bg-primary-hover mt-6 min-h-11 text-white">
        <Icon icon="refresh" className="size-4" aria-hidden="true" />
        โหลดหน้านี้อีกครั้ง
      </button>
    </StateCard>
  )
}
