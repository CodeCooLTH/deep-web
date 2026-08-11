import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { RichMenuChannelRefSchema } from "@/lib/validations";
import { recordConsent } from "@/services/line-rich-menu.service";
import { NO_STORE_HEADERS, requireShopId, toErrorResponse } from "../_shared";

/**
 * POST — บันทึกความยินยอมให้เมนูของ Deep แสดงแทนเมนูเดิมของเพจ (BR-RM-01, API.md §4.3)
 *
 * 🛑 แยกจาก `/activate` โดยตั้งใจ เพื่อให้ "การยินยอม" เป็นเหตุการณ์ที่บันทึกได้ว่า **ใครกดเมื่อไร**
 * แม้ร้านจะยินยอมแล้วเปลี่ยนใจไม่เปิดใช้ในตอนนั้น — เป็นหลักฐานเมื่อมีข้อพิพาทว่าใครเป็นคนตัดสินใจ
 * ทับเมนูเดิม (ซึ่งเป็นการกระทำที่ระบบตรวจสอบแทนไม่ได้เลยว่ามีของเดิมอยู่หรือเปล่า)
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
    const consentAt = await recordConsent({
      shopId: ctx.shopId,
      shopChannelId: parsed.output.shopChannelId,
      actorUserId: ctx.userId,
    });
    return NextResponse.json({ ok: true, consentAt }, { headers: NO_STORE_HEADERS });
  } catch (e) {
    return toErrorResponse(e);
  }
}
