// feature 00084 — ข้อมูลแผงสร้างพัสดุ Flash ของออเดอร์ (API.md §4.7) · อ่านอย่างเดียว S1
import type { NextRequest } from "next/server";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { flashError, flashJson, mapFlashError } from "@/lib/flash/route-helpers";
import { readIShipShopIdFromQuery } from "@/lib/iship/request-shop";
import { resolveOrderIdByToken } from "@/services/iship.service";
import { getFlashPanelOrReason } from "@/services/flash.service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireGeneralShop({ cap: "S1", shopId: readIShipShopIdFromQuery(request) });
  if ("error" in guard) return guard.error;

  const params = request.nextUrl.searchParams;
  const orderId = params.get("orderId");
  const orderToken = params.get("orderToken");
  if (!orderId && !orderToken) return flashError("INVALID_INPUT", "ต้องระบุคำสั่งซื้อ", 400);

  try {
    const id = orderId ?? (await resolveOrderIdByToken(guard.shopId, orderToken!));
    const result = await getFlashPanelOrReason(guard.shopId, id);
    if ("reason" in result) return flashError("NOT_ELIGIBLE", result.reason, 404);
    return flashJson(result);
  } catch (err) {
    return mapFlashError(err);
  }
}
