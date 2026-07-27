// feature 00022 — ประวัติการเดินทางของพัสดุ (FR-ISHIP-040)
// โหลดเมื่อผู้ใช้เปิดดูเท่านั้น ไม่ prefetch ทุกออเดอร์ (NFR — ค่าใช้จ่ายโตตามจำนวนออเดอร์)

import { requireGeneralShop } from "@/lib/shop-api-guard";
import { ishipJson, mapIShipError } from "@/lib/iship/route-helpers";
import { getTraces } from "@/services/iship.service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireGeneralShop();
  if ("error" in guard) return guard.error;

  const { id } = await params;
  try {
    const events = await getTraces(guard.shopId, id);
    return ishipJson(
      events.map((e) => ({
        status: e.status,
        statusText: e.statusText,
        statusDesc: e.statusDesc,
        location: e.location,
        occurredAt: e.occurredAt,
      })),
    );
  } catch (err) {
    return mapIShipError(err);
  }
}
