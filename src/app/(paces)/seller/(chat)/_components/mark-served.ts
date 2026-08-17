/**
 * markServedFlow — ปิดผลนัดว่า "ให้บริการแล้ว" จากในกล่องแชท (feature 00050)
 *
 * ## ทำไมต้องเป็นไฟล์ของตัวเอง
 *
 * การกระทำนี้อยู่ **2 จอในกล่องแชท** (แถบสถานะมือถือ `OrderProgressBar` + แผงขวาเดสก์ท็อป
 * `CustomerPanel`) และมีอีก 2 จอนอกแชทที่ทำเรื่องเดียวกันอยู่ก่อนแล้ว (`AppointmentCard`,
 * `AppointmentDayCard`) ถ้าปล่อยให้แต่ละจอเขียนคำยืนยัน/เงื่อนไข/การแปล error เอง
 * วันหนึ่งจอหนึ่งจะเตือนเรื่องเงินค้างแต่อีกจอเงียบ โดยไม่มี `tsc`/build ตัวไหนฟ้อง (Hard Rule 16)
 *
 * 🛑 คืน `true` เฉพาะตอนบันทึกสำเร็จจริง — ผู้เรียกใช้ค่านี้ตัดสินว่าจะรีเฟรชไหม
 * `false` ครอบทั้ง "ผู้ใช้กดยกเลิก" และ "ยิงแล้วล้ม" เพราะทั้งสองกรณีไม่มีอะไรเปลี่ยน
 *
 * Base (คำ/สี/ท่ายืนยัน): (dashboard)/orders/[token]/components/AppointmentCard.tsx:115
 */
import {
  appointmentOutcomeErrorMessage,
  appointmentOutcomeSuccessMessage,
} from '@/lib/appointment-outcome'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'

export async function markServedFlow(args: {
  orderToken: string
  /**
   * ร้านของเธรด — ส่งเป็น `?shopId=`
   *
   * 🛑 ห้ามละ: เธรดของร้าน B เปิดได้ขณะ active อยู่ร้าน A (BR-UNI-07) ⇒ ถ้าปล่อยให้ server
   * เดาจาก `activeShopId` จะหาออเดอร์ไม่เจอ แล้วผู้ใช้ได้ปุ่มที่กดกี่ครั้งก็ไม่ผ่าน
   */
  shopId: string | null
  /** ป้ายที่ผู้ใช้เห็นบนกล่องยืนยัน (เลขคำสั่งซื้อ) — กันกดผิดใบเมื่อเธรดมีหลายใบ */
  label: string
  /**
   * คำเตือนยอดค้างจาก `completionWarning()` · null = ไม่ค้าง
   *
   * 🛑 **ห้ามเงียบเมื่อยังค้าง** (BR-SQ-23) — หัวหน้าอนุญาตให้ปิดงานทั้งที่ค้างได้
   * ("ได้ อนุโลมช่วงนี้ก่อน") แต่ "อนุโลม" ไม่ได้แปลว่า "ไม่บอก": ปิดงานโดยลืมเก็บเงินคือ
   * ความเสียหายที่ผู้ใช้ต้องรู้ตัว ณ วินาทีนั้น ไม่ใช่ตอนปิดร้านสิ้นวัน
   */
  outstandingWarning: string | null
}): Promise<boolean> {
  const ok = await pacesConfirm({
    // สีต้องตรงกับปุ่มที่กดมา — ผู้ใช้อ่านสีก่อนอ่านคำ
    confirmSemantic: 'success',
    icon: 'warning',
    title: 'ทำเครื่องหมายว่าให้บริการแล้ว?',
    text: args.outstandingWarning
      ? `${args.label} · ${args.outstandingWarning} · ย้อนกลับไม่ได้`
      : `${args.label} · ย้อนกลับไม่ได้`,
    confirmButtonText: 'ให้บริการแล้ว',
    cancelButtonText: 'ยังไม่ใช่ตอนนี้',
  })
  if (!ok) return false

  const qs = args.shopId ? `?shopId=${encodeURIComponent(args.shopId)}` : ''
  try {
    const res = await fetch(`/api/orders/${args.orderToken}/appointment/outcome${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome: 'COMPLETED' }),
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      // คำพูดอยู่ที่ appointment-outcome.ts ที่เดียว ห้ามพิมพ์ข้อความซ้ำที่นี่
      throw new Error(appointmentOutcomeErrorMessage(data.error, args.label))
    }
    pacesToast.success(appointmentOutcomeSuccessMessage('COMPLETED'))
    return true
  } catch (err) {
    pacesToast.error(err instanceof Error ? err.message : 'บันทึกผลนัดไม่สำเร็จ กรุณาลองใหม่')
    return false
  }
}
