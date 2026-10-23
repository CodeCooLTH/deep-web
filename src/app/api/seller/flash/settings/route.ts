// feature 00084 — ค่าตั้งต้น Flash (API.md §4.5) · GET S1 (mchId เต็มเฉพาะ OWNER) · PUT S2 + OWNER
import type { NextRequest } from "next/server";
import * as v from "valibot";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { FlashSettingsSchema } from "@/lib/validations";
import { flashError, flashJson, mapFlashError } from "@/lib/flash/route-helpers";
import { isFlashOwner, requireFlashOwner } from "@/lib/flash/owner-guard";
import { readJson } from "@/lib/iship/route-helpers";
import { readIShipShopIdFromQuery } from "@/lib/iship/request-shop";
import { getFlashSettings, updateFlashSettings } from "@/services/flash.service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireGeneralShop({ cap: "S1", shopId: readIShipShopIdFromQuery(request) });
  if ("error" in guard) return guard.error;
  try {
    return flashJson(await getFlashSettings(guard.shopId, { isOwner: isFlashOwner(guard) }));
  } catch (err) {
    return mapFlashError(err);
  }
}

export async function PUT(request: NextRequest) {
  const guard = await requireGeneralShop({ cap: "S2", shopId: readIShipShopIdFromQuery(request) });
  if ("error" in guard) return guard.error;
  const denied = requireFlashOwner(guard);
  if (denied) return denied;

  const parsed = v.safeParse(FlashSettingsSchema, await readJson(request));
  if (!parsed.success) return flashError("INVALID_INPUT", parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", 400);
  // เหมือน iShip: เปิดประกันแล้วต้องมีมูลค่า ไม่งั้นตั้งค่าขัดกันเอง
  if (parsed.output.optIsInsured && !parsed.output.optProductValue) {
    return flashError("INVALID_INPUT", "เปิดประกันสินค้าแล้วต้องระบุมูลค่าสินค้าที่ต้องการเอาประกัน", 400);
  }

  try {
    return flashJson(await updateFlashSettings(guard.shopId, parsed.output, { isOwner: true }));
  } catch (err) {
    return mapFlashError(err);
  }
}
