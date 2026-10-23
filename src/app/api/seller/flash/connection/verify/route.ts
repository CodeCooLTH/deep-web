// feature 00084 — ทดสอบ key ปัจจุบัน (API.md §4.4) · 1001/1002 = status TOKEN_INVALID ใน view ไม่ใช่ error
import type { NextRequest } from "next/server";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { FlashServiceError } from "@/lib/flash/errors";
import { isFlashVerifyLimited, recordFlashVerifyFailure } from "@/lib/flash/verify-rl";
import { flashJson, mapFlashError } from "@/lib/flash/route-helpers";
import { isFlashOwner } from "@/lib/flash/owner-guard";
import { readIShipShopIdFromQuery } from "@/lib/iship/request-shop";
import { verifyFlash } from "@/services/flash.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const guard = await requireGeneralShop({ cap: "S2", shopId: readIShipShopIdFromQuery(request) });
  if ("error" in guard) return guard.error;
  // M1: key ผิดซ้ำเกินโควตา → ไม่ยิง Flash
  if (isFlashVerifyLimited(guard.userId, guard.shopId)) {
    return mapFlashError(new FlashServiceError("RATE_LIMITED", "ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่"));
  }
  try {
    const view = await verifyFlash(guard.shopId, { isOwner: isFlashOwner(guard) });
    // 1001/1002 ไม่โยน — service คืน view ที่ status TOKEN_INVALID
    if (view.status === "TOKEN_INVALID") recordFlashVerifyFailure(guard.userId, guard.shopId);
    return flashJson(view);
  } catch (err) {
    return mapFlashError(err, { context: "connection" });
  }
}
