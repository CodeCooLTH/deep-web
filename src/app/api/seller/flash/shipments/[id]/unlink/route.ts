// feature 00084 — เลิกผูกพัสดุ LINKED (API.md §4.15) · ไม่ยกเลิกพัสดุจริง
import type { NextRequest } from "next/server";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { flashJson, mapFlashError } from "@/lib/flash/route-helpers";
import { readIShipShopIdFromQuery } from "@/lib/iship/request-shop";
import { unlinkFlashShipment } from "@/services/flash-ops.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireGeneralShop({ cap: "S1", shopId: readIShipShopIdFromQuery(request) });
  if ("error" in guard) return guard.error;

  const { id } = await params;
  try {
    await unlinkFlashShipment(guard.shopId, id);
    return flashJson({ ok: true });
  } catch (err) {
    return mapFlashError(err);
  }
}
