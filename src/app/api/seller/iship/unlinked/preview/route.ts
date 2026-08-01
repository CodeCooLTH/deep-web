// feature 00022 (ส่วนขยาย) — เทียบที่อยู่ก่อนผูกพัสดุ
//
// ทำไมต้องมี endpoint แยก ทั้งที่รายการก่อนหน้าก็ส่งที่อยู่มาแล้ว:
// ตารางที่ร้านใช้ตัดสินใจต้องเป็นข้อมูลชุดเดียวกับที่จะถูกเขียนลงคำสั่งซื้อจริง
// ถ้าให้หน้าจอเทียบจากรายการที่ดึงมาเมื่อสักครู่ แล้วตอนกดผูกเซิร์ฟเวอร์ไปอ่านใหม่
// (ซึ่งจำเป็น เพราะเชื่อ payload จาก client ไม่ได้) สองอย่างนี้อาจไม่ตรงกัน —
// ร้านกดยืนยันสิ่งหนึ่งแต่ระบบเขียนอีกสิ่งหนึ่ง ซึ่งเป็นความผิดพลาดที่เงียบที่สุด

import type { NextRequest } from "next/server";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { ishipError, ishipJson, mapIShipError } from "@/lib/iship/route-helpers";
import { previewLink, resolveOrderIdByToken } from "@/services/iship.service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireGeneralShop();
  if ("error" in guard) return guard.error;

  const params = request.nextUrl.searchParams;
  const trackingNo = params.get("trackingNo")?.trim();
  const orderId = params.get("orderId")?.trim();
  const orderToken = params.get("orderToken")?.trim();

  if (!trackingNo) return ishipError("INVALID_INPUT", "ต้องระบุเลขติดตาม", 400);
  if (!orderId && !orderToken) {
    return ishipError("INVALID_INPUT", "ต้องระบุคำสั่งซื้อ", 400);
  }

  try {
    const id = orderId ?? (await resolveOrderIdByToken(guard.shopId, orderToken!));
    return ishipJson(await previewLink(guard.shopId, id, trackingNo));
  } catch (err) {
    return mapIShipError(err);
  }
}
