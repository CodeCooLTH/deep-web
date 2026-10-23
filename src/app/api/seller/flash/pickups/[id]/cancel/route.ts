// feature 00084 — ยกเลิกคำขอเรียกรถ Flash (API.md §4.18)
import type { NextRequest } from "next/server";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { flashJson, mapFlashError } from "@/lib/flash/route-helpers";
import { readIShipShopIdFromQuery } from "@/lib/iship/request-shop";
import { cancelFlashPickup } from "@/services/flash.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireGeneralShop({ cap: "S1", shopId: readIShipShopIdFromQuery(request) });
  if ("error" in guard) return guard.error;

  const { id } = await params;
  try {
    return flashJson(await cancelFlashPickup(guard.shopId, id));
  } catch (err) {
    return mapFlashError(err);
  }
}
