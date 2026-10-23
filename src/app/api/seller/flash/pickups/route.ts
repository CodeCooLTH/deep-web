// feature 00084 — เรียกรถเข้ารับ Flash (API.md §4.18)
import * as v from "valibot";
import type { NextRequest } from "next/server";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { flashError, flashJson, mapFlashError } from "@/lib/flash/route-helpers";
import { readIShipShopIdFromQuery } from "@/lib/iship/request-shop";
import { FlashPickupSchema } from "@/lib/validations";
import { readJson } from "@/lib/iship/route-helpers";
import { requestFlashPickup } from "@/services/flash.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const guard = await requireGeneralShop({ cap: "S1", shopId: readIShipShopIdFromQuery(request) });
  if ("error" in guard) return guard.error;

  const parsed = v.safeParse(FlashPickupSchema, await readJson(request));
  if (!parsed.success) return flashError("INVALID_INPUT", parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", 400);

  try {
    return flashJson(await requestFlashPickup(guard.shopId, guard.userId, parsed.output), 201);
  } catch (err) {
    return mapFlashError(err);
  }
}
