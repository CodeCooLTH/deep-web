import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as v from "valibot";
import { authOptions } from "@/lib/auth";
import { requireActiveShop } from "@/lib/shop-context";
import { UpdateShopPayoutSchema } from "@/lib/shop-payout";
import {
  updateShopPayout,
  PayoutForbiddenError,
  PayoutReauthFailedError,
  PayoutReauthUnavailableError,
} from "@/services/shop.service";

/**
 * PATCH /api/shops/payout — ตั้ง/เปลี่ยนบัญชีรับเงินของร้าน (feature 00062, U14/TFR-009)
 *
 * ด่านสิทธิ์ทั้งหมด (OWNER-only · vertical=ONLINE_SALES · reauth 2 ทาง) อยู่ที่
 * `updateShopPayout()` (`shop.service.ts`) ทั้งก้อน — route นี้มีหน้าที่แค่ resolve ร้าน active
 * ปัจจุบันของ session + parse body ด้วย Valibot + แปล error class → HTTP status ตาม
 * `API.md` §5 (ดูหมายเหตุการ implement 2026-08-29 ในเอกสารนั้น: ด่านทั้งหมดย้ายไป service
 * layer เพื่อให้ mutation test พิสูจน์ได้จริง ไม่ใช่แค่ซ่อนปุ่มที่ UI)
 *
 * response envelope ตาม convention จริงของโปรเจกต์: `{ error: string }` เดียว (ไม่ใช่
 * `{ error: { code, message } }`) — mirror `cod-received/route.ts`/`handover/route.ts`
 *
 * ไม่ใช้ `requireGeneralShop({ownerOnly:true})` (`shop-api-guard.ts`) แม้จะมีของพร้อมใช้
 * เพราะ envelope ของมันเป็น `{error:{code,message}}` ซึ่งไม่ตรง convention ของ endpoint ชุดนี้
 * (mirror ตาม `cod-received`/`handover` แทน) — ด่าน OWNER/vertical จริงยังอยู่ที่ service ชั้นเดียว
 */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  ).catch(() => null);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!active || !userId) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 403 });
  }

  const parsed = v.safeParse(UpdateShopPayoutSchema, await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const updated = await updateShopPayout(active.shop.id, userId, parsed.output);
    return NextResponse.json(updated, { headers: { "cache-control": "private, no-store" } });
  } catch (err) {
    if (err instanceof PayoutForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof PayoutReauthUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof PayoutReauthFailedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[shops/payout] unexpected error (PATCH)", err);
    return NextResponse.json(
      { error: "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 },
    );
  }
}
