// feature 00022 — ข้อมูลส่วน "การจัดส่ง" ของคำสั่งซื้อหนึ่งใบ (สำหรับโมดัลในหน้าแชท)
//
// หน้าคำสั่งซื้อเป็น server component จึงเรียก getShipmentPanel() ตอน render ได้เลย
// แต่การ์ดออเดอร์ในแชทเป็น client และรู้จักคำสั่งซื้อแค่ token — endpoint นี้คือทางเข้า
// เดียวกันในรูปแบบ HTTP เพื่อให้ทั้งสองที่ตัดสินโหมดจากข้อมูลชุดเดียวกัน ไม่ใช่ตรรกะคู่ขนาน
//
// อ่านอย่างเดียว ไม่ก่อค่าใช้จ่าย — พนักงานร้านเรียกได้ (เป็นงานประจำวัน)

import type { NextRequest } from "next/server";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { ishipError, ishipJson, mapIShipError } from "@/lib/iship/route-helpers";
import { getShipmentPanel, resolveOrderIdByToken } from "@/services/iship.service";
import { toShipmentContextJson } from "@/lib/iship/context";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireGeneralShop();
  if ("error" in guard) return guard.error;

  const params = request.nextUrl.searchParams;
  const orderId = params.get("orderId");
  const orderToken = params.get("orderToken");
  if (!orderId && !orderToken) {
    return ishipError("INVALID_INPUT", "ต้องระบุคำสั่งซื้อ", 400);
  }

  try {
    const id = orderId ?? (await resolveOrderIdByToken(guard.shopId, orderToken!));
    const ctx = await getShipmentPanel(guard.shopId, id);

    // null = ร้านไม่ได้เชื่อมต่อ หรือคำสั่งซื้อไม่เกี่ยวกับการส่งของ (รับเอง/ดิจิทัล/บริการ/จอง)
    // ตอบ 404 แทนที่จะตอบ context เปล่า — ปุ่มไม่ควรโผล่ตั้งแต่แรกในกรณีนี้
    if (!ctx) {
      return ishipError("NOT_ELIGIBLE", "คำสั่งซื้อนี้ไม่มีส่วนการจัดส่ง", 404);
    }
    return ishipJson(toShipmentContextJson(ctx));
  } catch (err) {
    return mapIShipError(err);
  }
}
