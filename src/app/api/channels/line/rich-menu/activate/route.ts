import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { RichMenuChannelRefSchema } from "@/lib/validations";
import { activate } from "@/services/line-rich-menu.service";
import { NO_STORE_HEADERS, requireShopId, toErrorResponse } from "../_shared";

/**
 * POST — เปิดใช้เมนู (สร้าง → อัปโหลดภาพ → ตั้งเป็นเมนูเริ่มต้น → เก็บกวาดใบเก่า)
 * API.md §4.4 · ลำดับ 6 ขั้นอยู่ใน service (SRS TFR-RM-03) ห้ามสลับ
 *
 * 🛑 ด่านความยินยอมอยู่ใน service ไม่ใช่ที่นี่ — เพื่อให้การยิง API ตรงข้ามด่านไม่ได้
 * (ถ้ากันแค่ที่จอ ใครก็ยิง endpoint นี้ตรง ๆ แล้วทับเมนูเดิมของร้านได้)
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
    const res = await activate({ shopId: ctx.shopId, shopChannelId: parsed.output.shopChannelId });
    return NextResponse.json(
      { ok: true, state: "ACTIVE", lineRichMenuId: res.lineRichMenuId },
      { headers: NO_STORE_HEADERS },
    );
  } catch (e) {
    return toErrorResponse(e);
  }
}
