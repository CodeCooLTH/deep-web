import type { NextRequest } from "next/server";

/**
 * readIShipShopId — อ่าน "ร้านที่คำขอนี้ทำงานด้วย" จาก query หรือ body (feature 00022 × 00037)
 *
 * 🛑 ทำไมต้องมีตัวกลาง ไม่อ่านเองรายไฟล์: route ของ iShip มี 11 เส้นที่เข้าถึงได้จากโมดัลพัสดุ
 * ในกล่องแชท ถ้าแต่ละเส้นอ่านเอง จะมีเส้นที่ลืมแล้วตกกลับไปใช้ร้านที่ active เงียบ ๆ — ซึ่งเป็น
 * รูปร่างเดียวกับบั๊กที่เพิ่งปิดไปทั้งหมดในรอบนี้ (guard ที่หายไป = หายทั้งคลาส)
 *
 * คืน `undefined` เมื่อไม่ส่งมา = ใช้ร้านที่ active (พฤติกรรมเดิม) · ค่าที่ไม่ใช่สตริงว่าง ๆ ถูก
 * ส่งต่อให้ `requireGeneralShop` ตรวจสิทธิ์จริง — ที่นี่ไม่ตัดสินสิทธิ์ใด ๆ แค่หยิบค่าออกมา
 */
export function readIShipShopIdFromQuery(request: NextRequest): string | undefined {
  const raw = request.nextUrl.searchParams.get("shopId");
  return raw && raw.length > 0 ? raw : undefined;
}

/** เวอร์ชันสำหรับ body ของ POST/PATCH — ผู้เรียกอ่าน body มาแล้วส่งเข้ามา */
export function readIShipShopIdFromBody(body: unknown): string | undefined {
  const raw = (body as { shopId?: unknown } | null | undefined)?.shopId;
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}
