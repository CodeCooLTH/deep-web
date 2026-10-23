// feature 00084 — ทดสอบ key ปัจจุบัน (API.md §4.4) · 1001/1002 = status TOKEN_INVALID ใน view ไม่ใช่ error
import type { NextRequest } from "next/server";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { flashJson, mapFlashError } from "@/lib/flash/route-helpers";
import { isFlashOwner } from "@/lib/flash/owner-guard";
import { readIShipShopIdFromQuery } from "@/lib/iship/request-shop";
import { verifyFlash } from "@/services/flash.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const guard = await requireGeneralShop({ cap: "S2", shopId: readIShipShopIdFromQuery(request) });
  if ("error" in guard) return guard.error;
  try {
    return flashJson(await verifyFlash(guard.shopId, { isOwner: isFlashOwner(guard) }));
  } catch (err) {
    return mapFlashError(err, { context: "connection" });
  }
}
