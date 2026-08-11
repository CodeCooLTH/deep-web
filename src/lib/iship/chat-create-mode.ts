/**
 * resolveChatIshipCreateMode — SSOT ของ "ร้านนี้จะให้เปิดพัสดุอัตโนมัติหลังสร้างออเดอร์ไหม"
 * สำหรับฟอร์มสร้างรายการในกล่องแชท (feature 00022 × 00037)
 *
 * 🛑 ทำไมต้องมีไฟล์นี้แทนที่จะเขียนเงื่อนไขซ้ำสองที่: ค่านี้ถูกประกอบจาก **สองทางเข้า** ที่ต้อง
 * ให้ผลตรงกันเป๊ะ — `(chat)/layout.tsx` (seed ของร้าน active ตอน render) และ
 * `GET /api/chat/shop-context` (ร้านอื่นที่โหลดตอนเปิดร่าง) SDS ของ 00037 §4 เตือนเรื่องนี้ไว้
 * ตรง ๆ ว่า "เพิ่มข้อมูลรายร้านเข้าฟอร์ม ต้องเพิ่มทั้งสองที่ ไม่งั้นสองเส้นทางให้ข้อมูลไม่เท่ากัน"
 *
 * 🛑 ทำไมค่านี้ต้องเป็น "รายร้าน" ไม่ใช่ค่าเดียวทั้งหน้า: ก่อน 2026-08-11 `DraftOrderProvider`
 * ถือเป็น `useState` ตัวเดียว โหลดครั้งเดียวตอน mount ด้วยร้านที่ active แล้วส่งให้ฟอร์มของ
 * **ทุกร่างไม่ว่าร้านไหน** — ร้าน A เปิดโหมด AUTO อยู่ ร่างของร้าน B จะพยายามเปิดพัสดุตามไปด้วย
 * ทั้งที่ร้าน B อาจไม่ได้เชื่อม iShip เลย (ล้มแบบปลอดภัยเพราะ guard หาออเดอร์ไม่เจอ แต่ผู้ขาย
 * ได้ toast "สร้างพัสดุไม่สำเร็จ" ที่อธิบายไม่ได้). เคสนี้เพิ่งเข้าถึงได้จริงหลังปิดบั๊กสร้างออเดอร์
 * ข้ามร้าน — ก่อนหน้านั้นออเดอร์ไม่เคยถูกสร้างสำเร็จ จึงไม่มีใครไปถึงขั้นตอนหลังสร้าง
 */

export type ChatIShipCreateMode = "AUTO" | "ASK" | "OFF";

const VALID: readonly string[] = ["AUTO", "ASK", "OFF"];

/**
 * @param account แถว ShopShippingAccount ของร้านนั้น (null = ไม่เคยเชื่อม)
 *
 * fail-closed ทุกทาง: ไม่มีแถว / ไม่ ACTIVE / ค่าที่ไม่รู้จักในคอลัมน์ → `OFF`
 * (คอลัมน์เป็น TEXT ไม่มี CHECK รายชื่อค่า — ด่านอยู่ที่นี่ ไม่ใช่ที่ฐาน)
 */
export function resolveChatIshipCreateMode(
  account: { status: string; createMode: string } | null | undefined,
): ChatIShipCreateMode {
  if (!account || account.status !== "ACTIVE") return "OFF";
  return VALID.includes(account.createMode) ? (account.createMode as ChatIShipCreateMode) : "OFF";
}
