// feature 00084 — ออกจาก NEEDS_REVIEW (API.md §4.14) · LINK_PNO 200 · REOPEN 201 (ใบใหม่ ก่อค่าใช้จ่าย)
import * as v from "valibot";
import type { NextRequest } from "next/server";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { flashError, flashJson, mapFlashError } from "@/lib/flash/route-helpers";
import { readJson } from "@/lib/iship/route-helpers";
import { readIShipShopIdFromQuery } from "@/lib/iship/request-shop";
import { FlashResolveSchema } from "@/lib/validations";
import { resolveReviewShipment } from "@/services/flash-shipment.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireGeneralShop({ cap: "S1", shopId: readIShipShopIdFromQuery(request) });
  if ("error" in guard) return guard.error;

  const parsed = v.safeParse(FlashResolveSchema, await readJson(request));
  if (!parsed.success) return flashError("INVALID_INPUT", parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", 400);

  const { id } = await params;
  try {
    const view = await resolveReviewShipment(guard.shopId, guard.userId, id, parsed.output);
    return flashJson(view, parsed.output.action === "REOPEN" ? 201 : 200);
  } catch (err) {
    return mapFlashError(err);
  }
}
