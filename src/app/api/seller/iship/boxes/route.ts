// feature 00022 — กล่องมาตรฐานของ iShip (ให้ร้านเลือกแทนกรอกขนาดเอง)

import { requireGeneralShop } from "@/lib/shop-api-guard";
import { ishipJson, mapIShipError } from "@/lib/iship/route-helpers";
import { listBoxes } from "@/services/iship.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireGeneralShop();
  if ("error" in guard) return guard.error;

  try {
    return ishipJson(await listBoxes(guard.shopId));
  } catch (err) {
    return mapIShipError(err);
  }
}
