// feature 00022 — ลองสร้างพัสดุใหม่จากใบที่ล้มเหลว (FR-ISHIP-022)
// ใช้ idempotencyKey เดิมเสมอ — ดูเหตุผลใน service (BR-ISHIP-26)

import * as v from "valibot";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { IShipReceiverPatchSchema } from "@/lib/validations";
import { ishipJson, mapIShipError, readJson } from "@/lib/iship/route-helpers";
import { retryShipment } from "@/services/iship.service";
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
  // body เป็น optional — ใบที่ล้มเพราะที่อยู่ผิด ร้านแก้แล้วส่งมาพร้อมกับการลองใหม่ได้เลย
  const raw = await readJson(request);
  const parsed = raw ? v.safeParse(IShipReceiverPatchSchema, raw) : null;

  try {
    return ishipJson(
      await retryShipment(
        guard.shopId,
        guard.userId,
        id,
        parsed?.success ? parsed.output : undefined,
      ),
    );
  } catch (err) {
    return mapIShipError(err);
  }
}
