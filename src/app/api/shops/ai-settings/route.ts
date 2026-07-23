import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveActiveShopContext } from "@/lib/shop-context";
import { getAiSetting, upsertAiSetting } from "@/services/ai-setting.service";
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

/** role ที่แก้ไขการตั้งค่าได้ (BR-AI-02) — STAFF อ่านได้อย่างเดียว */
const EDITABLE_ROLES = ["OWNER", "ADMIN"] as const;

async function requireShopContext() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  const userId = (session.user as { id: string }).id;
  const activeCtx = await resolveActiveShopContext({
    user: { id: userId, activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null },
  });
  if (!activeCtx) {
    return { error: NextResponse.json({ error: "ไม่พบร้านที่กำลังใช้งาน" }, { status: 404 }) };
  }
  const canEdit = (EDITABLE_ROLES as readonly string[]).includes(activeCtx.role);
  return { userId, shopId: activeCtx.shopId, canEdit };
}

export async function GET() {
  const ctx = await requireShopContext();
  if ("error" in ctx) return ctx.error;

  const setting = await getAiSetting(ctx.shopId);
  return NextResponse.json(
    {
      instruction: setting.instruction,
      includeProductContext: setting.includeProductContext,
      includeCustomerContext: setting.includeCustomerContext,
      // canEdit ส่งไปให้ UI ตัดสินโหมดอ่านอย่างเดียวเท่านั้น — ฝั่ง PUT ตรวจ role ซ้ำเสมอ
      // ไม่เชื่อค่านี้ที่ client ส่งกลับมา (API.md §2)
      canEdit: ctx.canEdit,
      updatedAt: setting.updatedAt ? setting.updatedAt.toISOString() : null,
    },
    { headers: NO_STORE_HEADERS },
  );
}

export async function PUT(request: NextRequest) {
  const ctx = await requireShopContext();
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

  try {
    const setting = await upsertAiSetting(ctx.shopId, ctx.userId, parsed.output);
    return NextResponse.json(
      {
        instruction: setting.instruction,
        includeProductContext: setting.includeProductContext,
        includeCustomerContext: setting.includeCustomerContext,
        canEdit: true,
        updatedAt: setting.updatedAt ? setting.updatedAt.toISOString() : null,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (e) {
    // ไม่ fail-soft ที่เส้นทางเขียน — บันทึกไม่สำเร็จต้องแจ้งผู้ใช้จริง ห้ามกลืนเงียบ
    console.error("[PUT /api/shops/ai-settings]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
