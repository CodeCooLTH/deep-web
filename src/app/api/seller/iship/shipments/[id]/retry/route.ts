// feature 00022 — ลองสร้างพัสดุใหม่จากใบที่ล้มเหลว (FR-ISHIP-022)
// ใช้ idempotencyKey เดิมเสมอ — ดูเหตุผลใน service (BR-ISHIP-26)

import { requireGeneralShop } from "@/lib/shop-api-guard";
import { ishipJson, mapIShipError } from "@/lib/iship/route-helpers";
import { retryShipment } from "@/services/iship.service";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireGeneralShop();
  if ("error" in guard) return guard.error;

  const { id } = await params;
  try {
    return ishipJson(await retryShipment(guard.shopId, guard.userId, id));
  } catch (err) {
    return mapIShipError(err);
  }
}
