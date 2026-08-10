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

/**
 * shopShipsGoods — ร้านประเภทนี้ "ส่งของ" หรือไม่ (user เคาะ 2026-08-07)
 *
 * ใช้ตอบคำถามเดียว: **รายการที่พิมพ์เอง (ไม่มี productId) ควรถือว่าต้องจัดส่งไหม**
 *
 * เดิมทุกที่ตอบว่า "ใช่" แบบไม่มีเงื่อนไข (`if (!item.productId) return true`) ซึ่งจริงเฉพาะร้าน
 * ขายออนไลน์. ร้าน SERVICE_QUEUE คือลูกค้าขับรถมาที่หน้าร้าน ไม่มีการส่งของเลย — พอพิมพ์
 * รายการเอง (ซึ่งเป็นวิธีปกติของงานบริการ) ฟอร์มจึงบังคับกรอกที่อยู่ให้ครบ line1+จังหวัด+
 * รหัสไปรษณีย์ ทั้งที่ข้อมูลนั้นไม่มีอยู่จริง — ร้านเลยเอาช่อง "บ้านเลขที่" ไปกรอกข้อความอื่น
 * แทน ("การันตีผลงานมากว่า10ปี") เพื่อให้ผ่าน validate (user report + ภาพ 2026-08-07)
 *
 * LODGING ก็ไม่ส่งของ (ผู้เข้าพักมาที่ที่พัก) — ที่อยู่จึงเป็นข้อมูลประกอบ ไม่ใช่ปลายทางพัสดุ
 *
 * IMPORTANT: นี่ไม่ได้แปลว่า "ซ่อนช่องที่อยู่" — user สั่งให้ **คงช่องไว้แต่ห้าม validate**
 * (ร้านที่อยากจดที่อยู่ไว้ก็ยังจดได้ ข้อมูลไม่หาย) ตัวนี้คุมแค่ "บังคับหรือไม่บังคับ"
 *
 * ค่าที่ไม่รู้จัก → true (ชุดของ ONLINE_SALES) — fail-safe ทางที่เข้มกว่า
 */
export function shopShipsGoods(vertical: string | null | undefined): boolean {
  return vertical !== 'SERVICE_QUEUE' && vertical !== 'LODGING'
}

/**
 * รายการหนึ่งบรรทัดในตะกร้าเรียกร้องการจัดส่งแบบไหน — แปลงจาก (productId, fulfillmentMode) ที่ call site
 *
 * ต้องแยก CUSTOM ออกจาก NO_SHIPPING เพราะสองอย่างนี้ตอบคนละคำถาม: CUSTOM = "ไม่รู้ว่าของชิ้นนี้
 * ต้องส่งไหมเพราะไม่มีในแคตตาล็อก" (ให้ประเภทร้านเป็นคนตอบแทน) ส่วน NO_SHIPPING = "รู้แน่ ๆ ว่าไม่ต้องส่ง"
 */
export type OrderItemShippingKind = 'SHIPPED' | 'NO_SHIPPING' | 'CUSTOM'

export function toOrderItemShippingKind(
  productId: string | null | undefined,
  productFulfillmentMode: string | null | undefined,
): OrderItemShippingKind {
  if (!productId) return 'CUSTOM'
  return productFulfillmentMode === 'SHIPPED' ? 'SHIPPED' : 'NO_SHIPPING'
}

/**
 * orderNeedsShippingAddress — "ใบนี้ต้องมีที่อยู่จัดส่งไหม" จุดเดียวของความจริงฝั่งหน้าจอ
 *
 * 🛑 ทำไมต้องยกออกมาเป็นฟังก์ชัน: กฎนี้เป็น OR ที่เคยถูกเขียนซ้ำ 3 ที่ (`QuickForm` มือถือ/โมดัลแชท,
 * `CartPanel` เดสก์ท็อป, `OrderCreateForm` ตอน submit) แล้วรอบแก้ 2026-08-07 เติม `shipsGoods`
 * ให้เฉพาะ **ตอน submit** ที่เดียว — สองที่ที่เหลือยังกั้นแค่กิ่ง CUSTOM ผลคือหน้าจอ "ขอ" ในสิ่งที่
 * ตัวบล็อกจริงไม่ได้บังคับ: ร้านคิวงานที่มีสินค้าติดธง SHIPPED ค้าง (เกิดได้จริงจากร้านที่เปลี่ยน
 * vertical ทีหลัง + Quick-Create ที่เคยเขียนคอลัมน์ตรง ๆ) ยังเห็นช่องที่อยู่ในโมดัลทุกใบ
 * (user report 2026-08-10 — ร้าน BT สุขสวัสดิ์ อาการเดิมกลับมารอบสาม คนละชั้นกับสองรอบก่อน)
 *
 * `shipsGoods` ต้องกั้น **ทั้งนิพจน์** ไม่ใช่ operand เดียว — ธงบนสินค้าไม่ใช่หลักฐานว่าร้านนี้ส่งของ
 * (`docs/conventions/stored-flag-vs-owner-truth.md`) ประเภทร้านต่างหากที่เป็นความจริงของเจ้าของแถว
 *
 * ต้องให้ผลตรงกับ `createOrder`/`updateOrder` เป๊ะ ๆ (src/services/order.service.ts) — หน้าจอที่เข้ม
 * กว่า server = ขอข้อมูลที่ไม่มีอยู่จริง, หน้าจอที่หลวมกว่า = บันทึกไม่ผ่านโดยไม่รู้ว่าเพราะอะไร
 */
export function orderNeedsShippingAddress(input: {
  /** ร้านประเภทนี้ส่งของไหม — `shopShipsGoods(shop.vertical)` */
  shipsGoods: boolean
  /** ช่องทางการขายของใบนี้ — 'STOREFRONT' = ลูกค้ามารับที่ร้าน ไม่ต้องมีที่อยู่ */
  salesChannel: string | null | undefined
  items: OrderItemShippingKind[]
}): boolean {
  if (!input.shipsGoods) return false
  if (input.salesChannel === 'STOREFRONT') return false
  return input.items.some((kind) => kind === 'CUSTOM' || kind === 'SHIPPED')
}

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
