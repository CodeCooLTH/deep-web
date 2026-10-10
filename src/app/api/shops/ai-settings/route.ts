import { NextRequest, NextResponse } from "next/server";
import { shouldHidePayments, shouldOfferIap } from "@/lib/app-shell-server";
import { canAskToBuy } from "@/lib/purchase-prompt";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireShopCapability } from "@/lib/shop-capability";
import { getAiSetting, upsertAiSetting, CONTEXT_GATE_PAID_PLAN_REQUIRED } from "@/services/ai-setting.service";
import { isOwnerPaidPlan } from "@/services/ai-suggest-quota.service";
import { ShopAiSettingSchema } from "@/lib/validations";

/**
 * GET/PUT /api/shops/ai-settings — การตั้งค่าผู้ช่วยร่างคำตอบ AI ของร้านที่ active (feature 00019)
 * SSOT: docs/20 - Features/00019 - AI Reply Assistant/API.md §4.1-4.2
 *
 * shopId derive จาก session เท่านั้น (resolveActiveShopContext ซึ่ง re-verify membership ทุกครั้ง)
 * ห้ามรับ shopId จาก client — pattern เดียวกับ chat/quick-messages
 */

// per-user authenticated data — ห้าม shared cache (CDN/carrier proxy) serve ข้ามผู้ใช้
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

/**
 * 00071 S-13 — ตั้งค่าผู้ช่วย AI = H3 (เจ้าของ+ผู้ดูแล) ทั้งอ่านและแก้ ตัดสินผ่าน requireShopCapability
 * (อ่านแถวสมาชิกสด) · ผ่านด่านแล้วแก้ได้ (canEdit true) — ผู้ตอบแชทใช้สถานะโควตาผ่าน /api/chat/ai-quota (H1) แทน
 */
async function requireShopContext(cap: "H3") {
  const session = await getServerSession(authOptions);
  const g = await requireShopCapability(session, cap);
  if (!g.ok) return { error: g.response };
  return { userId: g.userId, shopId: g.shopId, canEdit: true };
}

export async function GET() {
  const ctx = await requireShopContext('H3');
  if ("error" in ctx) return ctx.error;

  const setting = await getAiSetting(ctx.shopId);
  return NextResponse.json(
    {
      instruction: setting.instruction,
      includeProductContext: setting.includeProductContext,
      includeCustomerContext: setting.includeCustomerContext,
      includeMediaContext: setting.includeMediaContext,
      // canEdit ส่งไปให้ UI ตัดสินโหมดอ่านอย่างเดียวเท่านั้น — ฝั่ง PUT ตรวจ role ซ้ำเสมอ
      // ไม่เชื่อค่านี้ที่ client ส่งกลับมา (API.md §2)
      canEdit: ctx.canEdit,
      updatedAt: setting.updatedAt ? setting.updatedAt.toISOString() : null,
    },
    { headers: NO_STORE_HEADERS },
  );
}

export async function PUT(request: NextRequest) {
  const ctx = await requireShopContext('H3');
  if ("error" in ctx) return ctx.error;

  if (!ctx.canEdit) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์แก้ไขการตั้งค่านี้" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (body === null) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const parsed = v.safeParse(ShopAiSettingSchema, body);
  if (!parsed.success) {
    const firstIssue = parsed.issues[0]?.message ?? "Invalid input";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  // feature 00019 ext (2026-07-29) FR-AIQ-10: บังคับสิทธิ์บริบท AI จริงที่ backend — ร้าน non-paid
  // ห้ามเปลี่ยนค่า 3 ฟิลด์บริบทแม้ยิง API ตรงข้าม UI (fail-closed เหมือน quota gate ของ ai-suggest)
  let isPaidPlan: boolean;
  try {
    isPaidPlan = await isOwnerPaidPlan(ctx.shopId);
  } catch (e) {
    console.error("[PUT /api/shops/ai-settings] isOwnerPaidPlan failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }

  try {
    const setting = await upsertAiSetting(ctx.shopId, ctx.userId, parsed.output, isPaidPlan);
    return NextResponse.json(
      {
        instruction: setting.instruction,
        includeProductContext: setting.includeProductContext,
        includeCustomerContext: setting.includeCustomerContext,
        includeMediaContext: setting.includeMediaContext,
        canEdit: true,
        updatedAt: setting.updatedAt ? setting.updatedAt.toISOString() : null,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (e) {
    if (e instanceof Error && e.message === CONTEXT_GATE_PAID_PLAN_REQUIRED) {
      return NextResponse.json(
        {
          // แอป Android ไม่มีหน้าซื้อ ⇒ ห้ามชวนอัปเกรด (Google Payments policy) · เว็บ/iOS (มี IAP) ชวนได้
          error: canAskToBuy(await shouldHidePayments(), await shouldOfferIap())
            ? "ปิดใช้งานบริบทสินค้า/ประวัติลูกค้า/ไฟล์แนบสำหรับแพ็กเกจนี้ — อัพเกรดแพ็กเกจธุรกิจเพื่อใช้งาน"
            : "แพ็กเกจปัจจุบันยังไม่รวมบริบทสินค้า/ประวัติลูกค้า/ไฟล์แนบ",
          code: CONTEXT_GATE_PAID_PLAN_REQUIRED,
        },
        { status: 403 },
      );
    }
    // ไม่ fail-soft ที่เส้นทางเขียน — บันทึกไม่สำเร็จต้องแจ้งผู้ใช้จริง ห้ามกลืนเงียบ
    console.error("[PUT /api/shops/ai-settings]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
