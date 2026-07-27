// feature 00022 — ยกเลิกคำขอเรียกรถเข้ารับ (FR-ISHIP-051)

import { requireGeneralShop } from "@/lib/shop-api-guard";
import { ishipJson, mapIShipError } from "@/lib/iship/route-helpers";
import { cancelPickup } from "@/services/iship.service";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireGeneralShop();
  if ("error" in guard) return guard.error;

  const { id } = await params;
  try {
    const pickup = await cancelPickup(guard.shopId, id);
    return ishipJson({ id: pickup.id, status: pickup.status });
  } catch (err) {
    return mapIShipError(err);
  }
}
