// feature 00022 — ยกเลิกพัสดุ (FR-ISHIP-050)
// ยกเลิกได้เฉพาะก่อนขนส่งรับของ — ถ้าเลยจุดนั้น service จะโยน
// SHIPMENT_NOT_CANCELLABLE แล้ว UI บอกร้านให้ไปจัดการที่ iShip เอง

import { requireGeneralShop } from "@/lib/shop-api-guard";
import { ishipJson, mapIShipError } from "@/lib/iship/route-helpers";
import { cancelShipment } from "@/services/iship.service";
import { readIShipShopIdFromQuery } from "@/lib/iship/request-shop";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireGeneralShop({ shopId: readIShipShopIdFromQuery(request) });
  if ("error" in guard) return guard.error;

  const { id } = await params;
  try {
    return ishipJson(await cancelShipment(guard.shopId, guard.userId, id));
  } catch (err) {
    return mapIShipError(err);
  }
}
