// feature 00084 — การเชื่อมต่อ Flash ตรง (API.md §4.1–4.3)
// GET: S1 (ไม่ติด FEATURE_DISABLED) · POST/DELETE: S2 + OWNER · DELETE ถอนได้แม้ปิดฟีเจอร์ (TFR-FLASH-022)
import type { NextRequest } from "next/server";
import * as v from "valibot";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { FlashConnectSchema } from "@/lib/validations";
import { FlashError, FlashServiceError } from "@/lib/flash/errors";
import { isFlashVerifyLimited, recordFlashVerifyFailure } from "@/lib/flash/verify-rl";
import { flashError, flashJson, mapFlashError } from "@/lib/flash/route-helpers";
import { isFlashOwner, requireFlashOwner } from "@/lib/flash/owner-guard";
import { readJson } from "@/lib/iship/route-helpers";
import { readIShipShopIdFromQuery } from "@/lib/iship/request-shop";
import { connectFlash, disconnectFlash, getFlashConnection } from "@/services/flash.service";

export const dynamic = "force-dynamic";

const RATE_LIMITED = () => new FlashServiceError("RATE_LIMITED", "ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่");

export async function GET(request: NextRequest) {
  const guard = await requireGeneralShop({ cap: "S1", shopId: readIShipShopIdFromQuery(request) });
  if ("error" in guard) return guard.error;
  try {
    return flashJson(await getFlashConnection(guard.shopId, { isOwner: isFlashOwner(guard) }));
  } catch (err) {
    return mapFlashError(err, { context: "connection" });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireGeneralShop({ cap: "S2", shopId: readIShipShopIdFromQuery(request) });
  if ("error" in guard) return guard.error;
  const denied = requireFlashOwner(guard);
  if (denied) return denied;

  const parsed = v.safeParse(FlashConnectSchema, await readJson(request));
  if (!parsed.success) return flashError("INVALID_INPUT", parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", 400);

  // M1: key ผิดซ้ำเกินโควตา → ไม่ยิง Flash
  if (isFlashVerifyLimited(guard.userId, guard.shopId)) return mapFlashError(RATE_LIMITED());
  try {
    // connectFlash พิสูจน์ key กับ Flash ก่อนบันทึกเสมอ — ไม่ผ่านจะไม่มีอะไรถูกเขียน
    const { created, ...body } = await connectFlash(guard.shopId, guard.userId, parsed.output, { isOwner: true });
    return flashJson(body, created ? 201 : 200);
  } catch (err) {
    if (err instanceof FlashError && err.invalidatesConnection) recordFlashVerifyFailure(guard.userId, guard.shopId);
    return mapFlashError(err, { context: "connection" });
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireGeneralShop({ cap: "S2", shopId: readIShipShopIdFromQuery(request) });
  if ("error" in guard) return guard.error;
  const denied = requireFlashOwner(guard);
  if (denied) return denied;

  try {
    await disconnectFlash(guard.shopId, guard.userId);
    return flashJson({ ok: true });
  } catch (err) {
    return mapFlashError(err, { context: "connection" });
  }
}
