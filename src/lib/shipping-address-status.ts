/**
 * กฎ "ที่อยู่จัดส่งครบพอบันทึกออเดอร์หรือยัง" — จุดเดียวของความจริงฝั่งหน้าจอ
 *
 * SSOT ของกฎจริงอยู่ที่ `createOrder` (src/services/order.service.ts): ออเดอร์ที่ต้องจัดส่ง
 * และไม่ใช่ขายหน้าร้าน ต้องมี line1 + province + postcode ครบ (FR-6.5)
 * ส่วนตำบล/อำเภอ **ไม่บังคับตอนสร้างออเดอร์** แต่จำเป็นตอนเปิดพัสดุ iShip
 * (findMissingReceiverFields ใน lib/iship/mapping.ts) จึงเป็นได้แค่คำเตือน ไม่ใช่ตัวบล็อก
 *
 * ทำไมต้องแยกเป็นไฟล์: กฎนี้เคยถูกเขียนซ้ำ 3 ที่ (quick form ในแชท / POS เดสก์ท็อป /
 * ปุ่มสรุปที่อยู่) แล้วนิยาม "เลือกที่อยู่แล้ว" ของหน้าจอไม่ตรงกับของ service —
 * ปุ่มขึ้นสถานะเลือกสำเร็จทันทีที่มีตำบลหรือจังหวัดอย่างใดอย่างหนึ่ง ร้านจึงเห็นว่าครบ
 * แล้วไปเจอ error ตอนกดบันทึกโดยไม่มีอะไรชี้ว่าขาดช่องไหน (user report 2026-08-02)
 */

export interface ShippingAddressLike {
  line1?: string | null
  subdistrict?: string | null
  district?: string | null
  province?: string | null
  postcode?: string | null
}

/**
 * empty      = ยังไม่มีข้อมูลตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์เลย (และยังไม่ได้กดบันทึก) → เทาปกติ
 * incomplete = มีข้อมูลบางส่วนแต่ขาดช่องบังคับ → ต้องขึ้นแดงพร้อมบอกว่าขาดอะไร
 * complete   = ครบพอบันทึกได้
 */
export type LocalityState = 'empty' | 'incomplete' | 'complete'

export interface LocalityStatus {
  state: LocalityState
  /** ชื่อช่องบังคับที่ยังว่าง — เอาไปต่อท้าย "ยังไม่มี: " ได้ตรง ๆ */
  missingRequired: string[]
  /** ครบพอบันทึกแล้ว แต่ยังไม่มีตำบล/อำเภอ (ต้องเติมก่อนเปิดพัสดุจริง) */
  recommendedGap: boolean
  /** มีข้อมูลกลุ่มตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์ อย่างน้อย 1 ช่อง */
  hasAnyData: boolean
}

const clean = (v?: string | null): string => (v ?? '').trim()

/**
 * @param addr ที่อยู่ปัจจุบันในฟอร์ม
 * @param submitAttempted กดบันทึกแล้วไม่ผ่านเรื่องที่อยู่หรือยัง — ใช้ดันสถานะให้หลุดจาก 'empty'
 *   เมื่อร้านกดบันทึกทั้งที่ฟอร์มว่างสนิท (ไม่งั้นจะมีแต่ toast โดยไม่มีอะไรชี้จุดบนฟอร์มเลย)
 */
export function getLocalityStatus(
  addr: ShippingAddressLike | null | undefined,
  submitAttempted = false,
): LocalityStatus {
  const subdistrict = clean(addr?.subdistrict)
  const district = clean(addr?.district)
  const province = clean(addr?.province)
  const postcode = clean(addr?.postcode)

  const hasAnyData = !!(subdistrict || district || province || postcode)
  const missingRequired = [province ? '' : 'จังหวัด', postcode ? '' : 'รหัสไปรษณีย์'].filter(Boolean)

  const state: LocalityState =
    !hasAnyData && !submitAttempted ? 'empty' : missingRequired.length > 0 ? 'incomplete' : 'complete'

  return {
    state,
    missingRequired,
    recommendedGap: state === 'complete' && (!subdistrict || !district),
    hasAnyData,
  }
}
