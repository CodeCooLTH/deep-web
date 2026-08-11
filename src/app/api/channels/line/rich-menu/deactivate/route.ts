import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { RichMenuChannelRefSchema } from "@/lib/validations";
import { deactivate } from "@/services/line-rich-menu.service";
import { NO_STORE_HEADERS, requireShopId, toErrorResponse } from "../_shared";

/**
 * POST — คืนเมนูเดิมของเพจ (ยกเลิก default ที่ตั้งผ่าน API) · API.md §4.5
 *
 * 🛑 **ไม่ลบตัวเมนู** — ร้านต้องเปิดกลับได้ทันทีโดยไม่ต้องสร้างใหม่ (FR-RM-05)
 * หลังเรียกเส้นนี้ เมนูที่ร้านตั้งไว้เองใน LINE OA Manager จะกลับมาแสดงเอง (ถ้ามี) — ซึ่งเรา
 * มองไม่เห็นและยืนยันแทนร้านไม่ได้ สถานะจึงกลับไปเป็น `UNKNOWN` ไม่ใช่ "ไม่มีเมนู"
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const ctx = await requireShopId();
  if ("error" in ctx) return ctx.error;

  const parsed = v.safeParse(RichMenuChannelRefSchema, await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "กรุณาระบุเพจ", code: "VALIDATION_ERROR" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    await deactivate({ shopId: ctx.shopId, shopChannelId: parsed.output.shopChannelId });
    return NextResponse.json({ ok: true, state: "UNKNOWN" }, { headers: NO_STORE_HEADERS });
  } catch (e) {
    return toErrorResponse(e);
  }
}
