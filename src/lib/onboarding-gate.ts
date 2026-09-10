/**
 * onboarding-gate — SSOT ของกฎ "ต้องบังคับ user ไปลงทะเบียน/ตั้งค่าร้านก่อนใช้งานไหม"
 *
 * ทำไมต้องแยกเป็นไฟล์: กฎนี้ถูกอ่าน 2 ที่ที่ต้องตรงกันเป๊ะเสมอ —
 *   1. `jwt` callback (lib/auth.ts) → เขียนลง JWT → `proxy.ts` อ่านแล้ว **บังคับ redirect ที่ edge**
 *   2. `session` callback (lib/auth.ts) → ส่งเข้า session → **UI อ่านไปแสดงสถานะ**
 * ถ้า 2 ที่คำนวณไม่ตรงกัน UI จะโชว์คนละอย่างกับที่ proxy บังคับจริง (เคยเป็นกับดักที่มีคอมเมนต์
 * "mirror logic ใน jwt callback ด้านบน" เตือนไว้ — ซึ่งกันได้แค่ตอนคนอ่านคอมเมนต์เจอ)
 *
 * บริบทของกฎ:
 * - feature 00012 (Lazy Personal shop): บังคับเฉพาะ "คนที่ตั้งใจเป็น seller" = มี Personal shop แล้ว
 *   ผู้ถูกเชิญ (ADMIN ของ business ที่ยังไม่มี Personal) และ nobody ต้องไม่โดนบังคับ ไม่งั้นเข้า
 *   business dashboard ไม่ได้เลย (โดน proxy เด้งวน)
 * - feature 00026: เพิ่มเงื่อนไข "และกำลัง active อยู่ที่ร้านส่วนตัวนั้น" — ผู้ถูกเชิญที่กด
 *   "สร้างร้านส่วนตัว" จาก account switcher จะมี Personal shop ที่ยังไม่มี slug ทันที ถ้าไม่ scope
 *   ตรงนี้ proxy จะเด้งเขาไป /onboarding ทุก route = หลุดจากงานในร้าน BUSINESS ที่ทำค้างอยู่
 *   ออกไม่ได้จนกว่าจะตั้ง slug เสร็จ
 */

export interface OnboardingGateInput {
  /** id ของ PERSONAL shop ของ user — null = ยังไม่เคยเปิดร้านของตัวเอง (ผู้ถูกเชิญ/nobody) */
  personalShopId: string | null;
  /** slug ของ PERSONAL shop — null = ยังไม่ได้ตั้ง (ต้องผ่าน /onboarding) */
  personalShopSlug: string | null;
  /** shop ที่ user กำลังใช้งานอยู่ — อาจเป็น BUSINESS ของคนอื่นที่เขาเป็นสมาชิก */
  activeShopId: string | null;
  hasPhone: boolean;
}

export interface OnboardingGate {
  /** ยังไม่มีเบอร์ → proxy บังคับไป /register (เฟส 1) */
  needsRegistration: boolean;
  /** ยังไม่มี slug → proxy บังคับไป /onboarding (เฟส 2) */
  needsOnboarding: boolean;
}

export function resolveOnboardingGate({
  personalShopId,
  personalShopSlug,
  activeShopId,
  hasPhone,
}: OnboardingGateInput): OnboardingGate {
  // บังคับก็ต่อเมื่อ "มีร้านส่วนตัว" และ "กำลังยืนอยู่ในร้านส่วนตัวนั้น" พร้อมกัน
  const onPersonalShop = personalShopId !== null && activeShopId === personalShopId;

  return {
    needsRegistration: onPersonalShop && !hasPhone,
    needsOnboarding: onPersonalShop && !personalShopSlug,
  };
}

/**
 * ร้านที่ควรเป็น "ร้านที่กำลังใช้งาน" ตอนล็อกอินครั้งแรก
 *
 * 🛑 บั๊ก prod 2026-09-10 ที่ฟังก์ชันนี้ถูกสร้างมาแก้ — **แอดมินของร้านธุรกิจถูกล็อกออกจากแอป iOS**
 *
 * เดิม `auth.ts` ตั้ง `activeShopId = ร้านส่วนตัว` ก่อนเสมอ แล้วค่อยดูร้านธุรกิจ *ก็ต่อเมื่อ*
 * ไม่มีร้านส่วนตัวเลย. แต่ feature 00012 (Lazy Personal shop) สร้างร้านส่วนตัวให้ผู้ใช้เอง
 * โดยยังไม่มี slug ⇒ แอดมินที่ทำงานอยู่ในร้านธุรกิจของคนอื่นถูกวางไว้ที่ร้านส่วนตัวที่ยัง
 * ตั้งค่าไม่เสร็จ ⇒ `needsOnboarding = true` ⇒
 *   · บนเว็บ: โดนเด้งไป /onboarding ทุก route (รำคาญแต่ยังสลับร้านได้)
 *   · **ในแอป iOS: ด่าน 3.1.1 ล้าง session ทิ้งทันที** ⇒ "ไม่พบบัญชีผู้ขายสำหรับข้อมูลที่ใช้
 *     เข้าสู่ระบบนี้" = เข้าไม่ได้เลย ทั้งที่เขาเป็นแอดมินร้านจริงที่มีงานค้างอยู่
 *
 * 🛑 แก้แค่ด่าน 3.1.1 ไม่พอ — ปล่อยผ่านแล้วเขาจะไปโผล่ที่ **ฟอร์มสมัครในแอป** ซึ่งเป็นสิ่งที่
 * กฎข้อนั้นห้ามพอดี ⇒ ต้องแก้ที่ "ร้านไหนควรเป็นร้านตั้งต้น" ซึ่งเป็นต้นทางจริง
 *
 * กติกา: **ร้านส่วนตัวที่ยังตั้งค่าไม่เสร็จ ไม่ชนะร้านธุรกิจที่ใช้งานได้จริง**
 * (ร้านส่วนตัวที่ตั้ง slug แล้ว = เจ้าตัวตั้งใจเปิดร้านเอง ยังชนะเหมือนเดิม)
 */
export function resolveDefaultActiveShopId({
  personalShopId,
  personalShopSlug,
  firstBusinessShopId,
}: {
  personalShopId: string | null;
  personalShopSlug: string | null;
  /** ร้านธุรกิจที่เก่าที่สุดที่ user เป็นสมาชิก — null = ไม่ได้เป็นสมาชิกร้านไหนเลย */
  firstBusinessShopId: string | null;
}): string | null {
  // ตั้งค่าร้านส่วนตัวเสร็จแล้ว = เจ้าตัวตั้งใจเป็นผู้ขายเอง → ร้านตัวเองมาก่อน (พฤติกรรมเดิม)
  if (personalShopId !== null && personalShopSlug !== null) return personalShopId;
  // ยังตั้งค่าไม่เสร็จ แต่มีร้านธุรกิจให้ทำงาน → ไปที่ร้านนั้น อย่าขังไว้ในฟอร์มตั้งค่า
  if (firstBusinessShopId !== null) return firstBusinessShopId;
  // ไม่มีร้านธุรกิจเลย → ร้านส่วนตัว (แม้ยังไม่มี slug) เพื่อให้เดินเข้า /onboarding ตามเดิม
  return personalShopId;
}
