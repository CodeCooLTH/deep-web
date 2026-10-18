/**
 * manual-shipment-client — ฝั่ง client ของ 2 ขั้นส่งเอง (feature 00080) ใช้ร่วมกันระหว่างหน้าออเดอร์กับแผงพัสดุในแชท
 * ทำไมแยก: ถ้อยคำ Swal/ข้อความ 403 ต้องเหมือนกันทั้งสองจอ (HR16) — เขียนสองที่ = เพี้ยนกัน
 */

export type ManualStep = 'dispatch' | 'delivered'

export type ManualStepResult =
  | { kind: 'ok'; changed: boolean; alreadyClosed: boolean }
  | { kind: 'rejected'; message: string }

export const MANUAL_STEP_FORBIDDEN = 'บัญชีนี้ยังไม่ได้รับสิทธิ์ดูแลการจัดส่ง ให้เจ้าของร้านเปิดสิทธิ์ให้ก่อน'
export const MANUAL_STEP_FAILED = 'บันทึกไม่สำเร็จ ลองกดอีกครั้ง ถ้ายังไม่ได้ให้รีเฟรชหน้า'

/**
 * 409/403 = server ตอบแล้วว่าไม่ให้ → คืนค่าปกติ (ไม่ throw) · เน็ตหลุด/500 เท่านั้นที่ throw
 * (pacesConfirmAsync ตีความ throw = "กดซ้ำในโมดัลได้")
 */
export async function postManualStep(orderToken: string, step: ManualStep): Promise<ManualStepResult> {
  const res = await fetch(`/api/orders/${encodeURIComponent(orderToken)}/${step}`, { method: 'POST' })
  const data = (await res.json().catch(() => ({}))) as { changed?: boolean; alreadyClosed?: boolean; error?: string }
  if (res.ok) return { kind: 'ok', changed: data.changed === true, alreadyClosed: data.alreadyClosed === true }
  if (res.status === 409) return { kind: 'rejected', message: data.error || 'ทำรายการนี้ไม่ได้ในขั้นปัจจุบัน' }
  if (res.status === 403) return { kind: 'rejected', message: MANUAL_STEP_FORBIDDEN }
  throw new Error(`HTTP ${res.status}`)
}

/** ถ้อยคำ Swal "ส่งสำเร็จ" (Design-Spec §2) — COD ที่ยังไม่บันทึกรับเงินใช้แบบเตือน */
export function deliveredConfirmCopy(noun: string, codUnpaid: boolean) {
  return {
    icon: codUnpaid ? ('warning' as const) : ('question' as const),
    title: codUnpaid ? 'ปิดงานทั้งที่ยังไม่ได้บันทึกรับเงินปลายทาง?' : 'ยืนยันว่าส่งถึงลูกค้าแล้ว?',
    text: codUnpaid
      ? 'ถ้าลูกค้าได้รับของแล้ว ปิดงานได้เลย แล้วกด "ได้รับเงินปลายทางแล้ว" ทีหลังเมื่อเงินเข้า การปิดงานย้อนกลับไม่ได้'
      : `${noun}นี้จะเป็น "สำเร็จ" และนับเป็นยอดขาย คะแนนความน่าเชื่อถือ และเหรียญของร้านเหมือนลูกค้ายืนยันเอง ย้อนกลับไม่ได้`,
    confirmButtonText: 'ส่งสำเร็จ',
    cancelButtonText: 'ยังไม่ปิดงาน',
    // ห้าม warning — ขาวบนเหลือง ~1.7:1
    confirmSemantic: 'primary' as const,
    errorText: 'ส่งคำขอไม่สำเร็จ ลองกดยืนยันอีกครั้ง',
  }
}

/** ข้อความ toast หลังขั้นสำเร็จ/ถูกปฏิเสธ — null เมื่อไม่มีอะไรให้บอก */
export function manualStepToast(
  step: ManualStep,
  r: ManualStepResult,
  noun: string,
): { type: 'success' | 'info' | 'error'; message: string } {
  if (r.kind === 'rejected') return { type: 'error', message: r.message }
  if (step === 'dispatch') {
    return r.changed
      ? { type: 'success', message: 'บันทึกว่าจัดส่งแล้ว' }
      : { type: 'info', message: `${noun}นี้จัดส่งแล้ว หน้านี้อัปเดตให้แล้ว` }
  }
  return r.alreadyClosed
    ? { type: 'info', message: `${noun}นี้ปิดเป็น "สำเร็จ" ไปแล้ว ไม่ต้องกดซ้ำ` }
    : { type: 'success', message: `ปิดงานแล้ว ${noun}นี้สำเร็จ` }
}
