// feature 00084 — ราคาประมาณ Flash (API.md §4.8) · ไม่ก่อค่าใช้จ่าย · ที่อยู่ผู้ส่งอ่านจากการตั้งค่าร้านเสมอ
import type { NextRequest } from "next/server";
import * as v from "valibot";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { FlashPriceQuoteSchema } from "@/lib/validations";
import { flashError, flashJson, mapFlashError } from "@/lib/flash/route-helpers";
import { readJson } from "@/lib/iship/route-helpers";
import { readIShipShopIdFromQuery } from "@/lib/iship/request-shop";
import { estimateFlashPrice } from "@/services/flash.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const guard = await requireGeneralShop({ cap: "S1", shopId: readIShipShopIdFromQuery(request) });
  if ("error" in guard) return guard.error;

  const parsed = v.safeParse(FlashPriceQuoteSchema, await readJson(request));
  if (!parsed.success) return flashError("INVALID_INPUT", parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", 400);

  try {
    return flashJson(await estimateFlashPrice(guard.shopId, parsed.output));
  } catch (err) {
    return mapFlashError(err);
  }
}
