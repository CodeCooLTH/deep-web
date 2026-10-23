// feature 00084 — สร้างพัสดุ Flash (API.md §4.9) · ก่อค่าใช้จ่ายจริง · ทุกแถวที่ถูกสร้างตอบ 201 (FAILED/NEEDS_REVIEW อยู่ใน payload)
import * as v from "valibot";
import type { NextRequest } from "next/server";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { flashError, flashJson, mapFlashError } from "@/lib/flash/route-helpers";
import { readIShipShopIdFromQuery } from "@/lib/iship/request-shop";
import { FlashCreateShipmentSchema } from "@/lib/validations";
import { readJson } from "@/lib/iship/route-helpers";
import { resolveFlashOrderId } from "@/lib/flash/route-helpers";
import { createFlashShipment } from "@/services/flash-shipment.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const guard = await requireGeneralShop({ cap: "S1", shopId: readIShipShopIdFromQuery(request) });
  if ("error" in guard) return guard.error;

  const parsed = v.safeParse(FlashCreateShipmentSchema, await readJson(request));
  if (!parsed.success) return flashError("INVALID_INPUT", parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", 400);

  try {
    const orderId = await resolveFlashOrderId(guard.shopId, parsed.output);
    if (!orderId) return flashError("INVALID_INPUT", "ต้องระบุคำสั่งซื้อ", 400);
    const { override, receiver } = parsed.output;
    return flashJson(await createFlashShipment(guard.shopId, guard.userId, orderId, override, receiver), 201);
  } catch (err) {
    return mapFlashError(err);
  }
}
