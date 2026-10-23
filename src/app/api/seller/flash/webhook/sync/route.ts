// feature 00084 — อ่าน/ตั้ง/ลองใหม่/ทับ webhook (API.md §4.6) · S2 + OWNER
import type { NextRequest } from "next/server";
import * as v from "valibot";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { FlashWebhookSyncSchema } from "@/lib/validations";
import { flashError, flashJson, mapFlashError } from "@/lib/flash/route-helpers";
import { requireFlashOwner } from "@/lib/flash/owner-guard";
import { readJson } from "@/lib/iship/route-helpers";
import { readIShipShopIdFromQuery } from "@/lib/iship/request-shop";
import { getFlashConnection, syncFlashWebhooks } from "@/services/flash.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const guard = await requireGeneralShop({ cap: "S2", shopId: readIShipShopIdFromQuery(request) });
  if ("error" in guard) return guard.error;
  const denied = requireFlashOwner(guard);
  if (denied) return denied;

  // body ว่างได้ (เรียกครั้งแรก) — readJson คืน null เมื่ออ่านไม่ได้ จึงถือเป็น {}
  const raw = (await readJson(request)) ?? {};
  const parsed = v.safeParse(FlashWebhookSyncSchema, raw);
  if (!parsed.success) return flashError("INVALID_INPUT", parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", 400);

  try {
    const webhook = await syncFlashWebhooks(guard.shopId, guard.userId, { overrideKinds: parsed.output.overrideKinds });
    return flashJson({ connection: await getFlashConnection(guard.shopId, { isOwner: true }), webhook });
  } catch (err) {
    return mapFlashError(err);
  }
}
