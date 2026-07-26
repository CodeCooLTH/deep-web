// feature 00022 — ยกเลิกพัสดุ (FR-ISHIP-050)
// ยกเลิกได้เฉพาะก่อนขนส่งรับของ — ถ้าเลยจุดนั้น service จะโยน
// SHIPMENT_NOT_CANCELLABLE แล้ว UI บอกร้านให้ไปจัดการที่ iShip เอง

import { requireGeneralShop } from "@/lib/shop-api-guard";
import { ishipJson, mapIShipError } from "@/lib/iship/route-helpers";
import { cancelShipment } from "@/services/iship.service";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireGeneralShop();
  if ("error" in guard) return guard.error;

  const { id } = await params;
  try {
    return ishipJson(await cancelShipment(guard.shopId, guard.userId, id));
  } catch (err) {
    return mapIShipError(err);
  }
}
