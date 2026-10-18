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
import { getShipmentPanelState, resolveOrderIdByToken } from "@/services/iship.service";
import { toShipmentContextJson, toShipmentViewJson, type ShipmentPanelJson } from "@/lib/iship/context";
import { moneyLevel } from "@/lib/shop-permissions";
import { readIShipShopIdFromQuery } from "@/lib/iship/request-shop";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireGeneralShop({ cap: "S1", shopId: readIShipShopIdFromQuery(request) });
  if ("error" in guard) return guard.error;

  const params = request.nextUrl.searchParams;
  const orderId = params.get("orderId");
  const orderToken = params.get("orderToken");
  if (!orderId && !orderToken) {
    return ishipError("INVALID_INPUT", "ต้องระบุคำสั่งซื้อ", 400);
  }

  try {
    const id = orderId ?? (await resolveOrderIdByToken(guard.shopId, orderToken!));
    const result = await getShipmentPanelState(guard.shopId, id);

    // 404 เหลือเฉพาะ "ไม่พบคำสั่งซื้อ" กับ "ไม่ต้องจัดส่ง" (ปุ่มซ่อนอยู่แล้ว) — ร้านที่ไม่ได้เชื่อม
    // iShip ตอบ 200 พร้อม ishipState เพราะหน้าต่างพัสดุยังใช้ "ส่งเอง" ได้ ไม่ใช่ทางตัน
    if ("reason" in result) {
      return ishipError("NOT_ELIGIBLE", result.reason, 404);
    }
    const payload: ShipmentPanelJson =
      result.ishipState === "READY"
        ? {
            ...toShipmentContextJson(result.ctx),
            ishipState: "READY",
            orderStatus: result.orderStatus,
            manualShipment: result.manualShipment,
            trackingNoticeTiming: result.trackingNoticeTiming,
            isCodUnpaid: result.isCodUnpaid,
            vertical: result.vertical,
          }
        : { ...result, shipment: result.shipment ? toShipmentViewJson(result.shipment) : null };
    // 00078: ช่องค่าส่งเป็นต้นทุนร้าน — บทบาทระดับเงิน NONE ไม่ได้ธง (fail-closed)
    return ishipJson({ ...payload, canSetShipCost: moneyLevel(guard.effRoles) !== "NONE" });
  } catch (err) {
    return mapIShipError(err);
  }
}
