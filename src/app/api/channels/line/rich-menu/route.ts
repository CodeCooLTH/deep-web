import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { RichMenuDraftSchema } from "@/lib/validations";
import { getRichMenuState, saveDraft } from "@/services/line-rich-menu.service";
import { NO_STORE_HEADERS, requireShopId, toErrorResponse } from "./_shared";

/**
 * เมนูลัดใน LINE — อ่านสถานะ / บันทึกร่าง (feature 00045, API.md §4.1–4.2)
 */
export const dynamic = "force-dynamic";

/** GET — สถานะจริง + ร่างล่าสุด (สถานะ derive สดจาก LINE ทุกครั้ง ไม่อ่านจากคอลัมน์) */
export async function GET(request: NextRequest) {
  const ctx = await requireShopId();
  if ("error" in ctx) return ctx.error;

  const shopChannelId = request.nextUrl.searchParams.get("shopChannelId");
  if (!shopChannelId) {
    return NextResponse.json(
      { error: "กรุณาระบุเพจ", code: "VALIDATION_ERROR" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const view = await getRichMenuState(ctx.shopId, shopChannelId);
    return NextResponse.json(view, { headers: NO_STORE_HEADERS });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/**
 * PUT — บันทึกร่าง
 *
 * 🛑 **ห้ามยิง LINE ในเส้นนี้เด็ดขาด** — LINE จำกัดการสร้างเมนูที่ 100 ครั้ง/ชั่วโมงต่อ OA และ
 * เมนูแก้ไขไม่ได้ (ทุกการแก้ = สร้างใบใหม่) ร้านที่นั่งปรับคำไปมาสิบรอบจะเผาเพดานหมดโดยไม่ได้อะไร
 * การยิงจริงเกิดที่ `/activate` เท่านั้น
 */
export async function PUT(request: NextRequest) {
  const ctx = await requireShopId();
  if ("error" in ctx) return ctx.error;

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(RichMenuDraftSchema, body);
  if (!parsed.success) {
    // คืนข้อความของ issue แรกให้หน้าจอชี้ช่องที่ผิดได้ — ไม่ใช่ "ข้อมูลไม่ถูกต้อง" ลอย ๆ
    return NextResponse.json(
      { error: parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", code: "VALIDATION_ERROR" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    await saveDraft({
      shopId: ctx.shopId,
      actorUserId: ctx.userId,
      shopChannelId: parsed.output.shopChannelId,
      templateKey: parsed.output.templateKey,
      chatBarText: parsed.output.chatBarText,
      buttons: parsed.output.buttons,
      imageFileId: parsed.output.imageFileId,
    });
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (e) {
    return toErrorResponse(e);
  }
}
