import { prisma } from "@/lib/prisma";

/**
 * ชื่อสาธารณะของโปรไฟล์ — `User.username` กับ `Shop.slug` ต้องไม่ชนกัน
 *
 * ทำไมถึงต้องเช็คข้ามตาราง: วันนี้ทั้งสองอยู่คนละ namespace โดยสิ้นเชิง
 *   `/u/{username}` → User.username @unique  (เช็คแค่ตาราง User)
 *   `/b/{slug}`     → Shop.slug     @unique  (เช็คแค่ตาราง Shop)
 * ไม่มีใครเช็คข้ามกัน → `username = "somchai"` ของคนหนึ่ง กับ `slug = "somchai"` ของอีกร้านหนึ่ง
 * อยู่พร้อมกันได้ ซึ่งไม่เป็นปัญหาตราบใดที่ URL แยกกันด้วย prefix — **แต่จะเป็นปัญหาทันที**
 * เมื่อรวมเป็นเส้นเดียว `/profile/{name}` เพราะตัวหนึ่งจะเข้าไม่ถึงตลอดกาล
 *
 * ตัวนี้ปิดไม่ให้ "ชนกันเพิ่ม" ตั้งแต่วันนี้ ส่วนที่ชนกันอยู่แล้วบนฐานจริงต้องเคลียร์แยก
 * (query อยู่ใน docs/10 - Business Rules/Public Profile URL.md)
 *
 * 🛑 ช่วงที่ชนกันได้จริงแคบกว่าที่คิด — username อนุญาต `_` แต่ slug ไม่อนุญาต และ slug อนุญาต `-`
 * แต่ username ไม่อนุญาต ดังนั้นชนกันได้เฉพาะชื่อที่เป็น `[a-z0-9]` ล้วน (เช่น "tanapathardware")
 * ซึ่งเป็นรูปแบบที่คนตั้งกันมากที่สุดพอดี และ username อัตโนมัติ `fb{facebookId}` ก็อยู่ในช่วงนี้
 */

/** ชื่อนี้ถูกใช้เป็น username ของ "คนอื่น" อยู่หรือไม่ */
export async function isUsernameTakenByOther(
  name: string,
  exceptUserId?: string | null,
): Promise<boolean> {
  const row = await prisma.user.findFirst({
    where: { username: name, ...(exceptUserId ? { NOT: { id: exceptUserId } } : {}) },
    select: { id: true },
  });
  return row !== null;
}

/** ชื่อนี้ถูกใช้เป็น slug ของร้าน "อื่น" อยู่หรือไม่ */
export async function isSlugTakenByOther(
  name: string,
  exceptShopId?: string | null,
): Promise<boolean> {
  const row = await prisma.shop.findFirst({
    where: { slug: name, ...(exceptShopId ? { NOT: { id: exceptShopId } } : {}) },
    select: { id: true },
  });
  return row !== null;
}

/**
 * ชื่อนี้ถูกใช้ไปแล้วในระบบไหม (มองทั้งสองตารางเป็น namespace เดียว)
 *
 * ใช้ตอน **ตั้งชื่อใหม่** ทุกทาง — ทั้งตั้ง slug ร้านและตั้ง username คน
 * ยกเว้นเจ้าของเดิม (กดเซฟค่าเดิมได้ ไม่ต้องขึ้นว่าชื่อซ้ำ)
 */
export async function isPublicNameTaken(
  name: string,
  except?: { userId?: string | null; shopId?: string | null },
): Promise<boolean> {
  const [byUser, byShop] = await Promise.all([
    isUsernameTakenByOther(name, except?.userId),
    isSlugTakenByOther(name, except?.shopId),
  ]);
  return byUser || byShop;
}
