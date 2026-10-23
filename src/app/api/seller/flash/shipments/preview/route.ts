// feature 00084 — ดูสถานะเลขพัสดุก่อนผูก (API.md §4.10) · ไม่ก่อค่าใช้จ่าย
import * as v from "valibot";
import type { NextRequest } from "next/server";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { flashError, flashJson, mapFlashError } from "@/lib/flash/route-helpers";
import { readIShipShopIdFromQuery } from "@/lib/iship/request-shop";
import { FlashPnoQuerySchema } from "@/lib/validations";
import { previewFlashPno } from "@/services/flash-shipment.service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireGeneralShop({ cap: "S1", shopId: readIShipShopIdFromQuery(request) });
  if ("error" in guard) return guard.error;

  const parsed = v.safeParse(FlashPnoQuerySchema, { pno: request.nextUrl.searchParams.get("pno") ?? "" });
  if (!parsed.success) return flashError("INVALID_INPUT", parsed.issues[0]?.message ?? "เลขพัสดุไม่ถูกต้อง", 400);

  try {
    return flashJson(await previewFlashPno(guard.shopId, parsed.output.pno));
  } catch (err) {
    return mapFlashError(err);
  }
}
