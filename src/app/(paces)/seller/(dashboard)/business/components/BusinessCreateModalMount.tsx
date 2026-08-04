'use client'

/**
 * BusinessCreateModalMount — ตัวเปิด/ปิด BusinessCreateModal ผูกกับ `?create=1`
 *
 * ทำไมผูกกับ URL ไม่ใช่ state เปล่า ๆ:
 *   - `/business/create` (URL เดิมที่มีคนบุ๊กมาร์ก/ลิงก์ไว้แล้ว) redirect มาที่ `/business?create=1`
 *     ได้ตรง ๆ โดยที่ gate ฝั่ง server ยังทำงานเหมือนเดิม — ไม่มีลิงก์ไหนตาย
 *   - ปุ่ม "สร้างธุรกิจใหม่" เป็น <Link> ธรรมดา ไม่ต้องยก state ขึ้นไปที่ page (ซึ่งเป็น RSC)
 *   - ปุ่ม back ของเบราว์เซอร์ปิด modal ได้ตามที่ผู้ใช้คาดหวัง
 *
 * ปิดแล้วใช้ replace ไม่ใช่ push — ไม่งั้นกด back จะเด้งกลับเข้า modal ที่เพิ่งตั้งใจปิดไป
 */

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import BusinessCreateModal from './BusinessCreateModal'

export default function BusinessCreateModalMount({ canCreate }: { canCreate: boolean }) {
  const router = useRouter()
  const sp = useSearchParams()
  // canCreate เป็น gate ฝั่ง server (แพ็กเกจ ACTIVE + ยังไม่เต็มโควตา) — ?create=1 อย่างเดียว
  // เปิดไม่ได้ถ้าโควตาเต็ม ไม่งั้นพิมพ์ URL เองก็เปิดฟอร์มที่ยิงไปแล้วโดน 403 กลับมาเปล่า ๆ
  const open = canCreate && sp.get('create') === '1'

  const close = useCallback(() => router.replace('/business'), [router])

  return <BusinessCreateModal open={open} onClose={close} />
}
