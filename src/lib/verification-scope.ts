/**
 * verification-scope.ts — SSOT ของคำถาม "แถว VerificationRecord ไหนนับเป็นการยืนยันของ scope นี้"
 *
 * 🛑 ระดับ 1 (PHONE_OTP) เป็นข้อเท็จจริงของ "คน" ไม่ใช่ของ "ร้าน" — ไม่มีทางเข้าไหนในระบบเขียน L1
 *    พร้อม `shopId` เลยสักทาง ทั้ง 4 ทาง (`api/account/set-phone`, `lib/auth.ts` ตอน authorize,
 *    `lib/auth.ts` ตอน ensure-on-login, `scripts/backfill-phone-l1-verifications.ts`) เขียน
 *    `shopId = null` ทั้งหมด
 *
 *    เดิม business scope กรองด้วย `{ shopId }` อย่างเดียว จึงไม่มีวันเห็นแถว L1 ⇒ **ร้าน BUSINESS
 *    ทุกร้านขึ้น "Level 0 · ยังไม่ได้ยืนยัน" ตลอดกาล** ทั้งที่เจ้าของยืนยันเบอร์แล้ว และลามไปอีก 2 ที่
 *    ที่มองไม่เห็นจากหน้าจอ: `calcVerificationScore` เสียคะแนน verification 10 คะแนน · เหรียญ
 *    Fully Verified (ต้องครบ 1+2+3) เป็นไปไม่ได้เลยเพราะ 1 ไม่มีทางมา
 *
 *    ยืนยันกับฐาน prod 2026-08-11: ร้าน BUSINESS 3/3 ร้านโดนทั้งหมด (เจ้าของมี L1 ครบทุกราย แต่
 *    ไม่มีร้านไหนมีแถวที่ผูก shopId สักแถว) — user รายงานเองจากหน้าจอ ไม่มี gate ไหนจับได้เลย
 *    เพราะ query ทั้งสองฝั่ง "ถูก" ตามชนิดทุกตัวอักษร สิ่งที่ผิดคือความหมาย (Hard Rule 16)
 *
 * 🛑 แก้ที่ **ฝั่งอ่าน** ไม่ใช่เขียนแถว L1 ผูก shopId เพิ่มให้ทุกร้าน — แถวที่ก็อปไว้ต่อร้านคือ stored
 *    flag ที่ drift ทันทีที่เจ้าของตั้งเบอร์หลังเปิดร้าน หรือโอนร้านให้คนอื่น
 *    (`docs/conventions/stored-flag-vs-owner-truth.md`)
 *
 * 🛑 business ต้องยึด **เจ้าของร้าน (`Shop.userId`)** ไม่ใช่ผู้ใช้ที่กำลังเปิดหน้าอยู่ — พนักงานที่ถูก
 *    เชิญเข้าร้าน (`ShopMember`) ยืนยันเบอร์ตัวเองแล้วไม่ได้แปลว่าร้านนั้นยืนยันแล้ว
 *
 * ไฟล์นี้ตั้งใจไม่ import prisma — เป็นฟังก์ชันบริสุทธิ์ล้วนเพื่อให้ผูกเทสกับ *ความหมาย* ได้ตรง ๆ
 * และให้ทุกฝั่งอ่าน (service / trust score / badge / หน้าโปรไฟล์สาธารณะ) ใช้นิยามเดียวกัน
 */

/** ระดับที่เป็นของ "คน" ไม่ใช่ของ "ร้าน" — ร้านของคนนั้นได้อานิสงส์ตามไปด้วย */
export const OWNER_LEVEL_INHERITED_BY_SHOP = 1

export type VerificationReadScope =
  /** personal — ผูก user ตรง ๆ (พฤติกรรมเดิมทุกประการ) */
  | { kind: 'personal'; userId: string }
  /** business — แถวของร้าน + L1 ของเจ้าของร้าน
   *  `ownerUserId: null` = หาเจ้าของไม่เจอ → ถอยไปพฤติกรรมเดิม `{ shopId }` ล้วน
   *  🛑 ห้ามถอยไป personal path ในกรณีนี้ นั่นจะกลายเป็นเอา verification ของ "คนที่เปิดหน้าอยู่"
   *     มาแสดงแทนของร้าน ซึ่งผิดกว่าการไม่แสดงอะไรเลย */
  | { kind: 'business'; shopId: string; ownerUserId: string | null }

type RecordWhere =
  | { userId: string; shopId: null }
  | { shopId: string }
  | { OR: [{ shopId: string }, { userId: string; shopId: null; level: number }] }

/**
 * verificationRecordWhere — where สำหรับ "ทุกแถว" ของ scope นี้ (ไม่กรองสถานะ)
 * ใช้กับรายการที่ต้องเห็นทั้ง PENDING/REJECTED ด้วย เช่นหน้า `/verification` ของผู้ขาย
 */
export function verificationRecordWhere(scope: VerificationReadScope): RecordWhere {
  if (scope.kind === 'personal') return { userId: scope.userId, shopId: null }
  if (!scope.ownerUserId) return { shopId: scope.shopId }
  return {
    OR: [
      { shopId: scope.shopId },
      { userId: scope.ownerUserId, shopId: null, level: OWNER_LEVEL_INHERITED_BY_SHOP },
    ],
  }
}

/**
 * approvedVerificationWhere — เหมือนด้านบนแต่บวกเงื่อนไข APPROVED
 *
 * 🛑 `status` ต้องอยู่ "นอก" OR เสมอ (Prisma ตีเป็น AND ของ status กับกลุ่ม OR) — ถ้าย้ายเข้าไป
 *    ใน OR ทีละ branch แล้วมีคนเพิ่ม branch ที่สามทีหลังโดยลืมใส่ status เอกสารที่ยัง PENDING
 *    จะถูกนับเป็นยืนยันแล้วเงียบ ๆ
 */
export function approvedVerificationWhere(scope: VerificationReadScope) {
  return { ...verificationRecordWhere(scope), status: 'APPROVED' as const }
}

/**
 * businessScope — helper ให้ผู้เรียกที่มี Shop อยู่ในมือแล้วสร้าง scope ได้บรรทัดเดียว
 * `ownerUserId` ต้องเป็น `Shop.userId` เสมอ ห้ามส่ง session user เข้ามา
 */
export function businessScope(shopId: string, ownerUserId: string | null): VerificationReadScope {
  return { kind: 'business', shopId, ownerUserId }
}
