// feature 00022 — ทดสอบการเชื่อมต่อซ้ำ (FR-ISHIP-002)
// ผลลบ → service ตั้งสถานะเป็น TOKEN_INVALID ให้เอง (BR-ISHIP-14)

import { requireGeneralShop } from "@/lib/shop-api-guard";
import { ishipJson, mapIShipError } from "@/lib/iship/route-helpers";
import { verifyConnection } from "@/services/iship.service";

export const dynamic = "force-dynamic";

export async function POST() {
  const guard = await requireGeneralShop({ ownerOnly: true });
  if ("error" in guard) return guard.error;

  try {
    return ishipJson(await verifyConnection(guard.shopId));
  } catch (err) {
    return mapIShipError(err);
  }
}
