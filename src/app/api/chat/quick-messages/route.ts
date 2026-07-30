import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveActiveShopContext } from "@/lib/shop-context";
import { listQuickMessages, createQuickMessage, reorderQuickMessages } from "@/services/quick-message.service";
import { QuickMessageCreateSchema, QuickMessageReorderSchema } from "@/lib/validations";

// ข้อความสำเร็จรูป ระดับร้าน — feature 00018 composer improvement #2
// per-user authenticated data — ห้าม shared cache (เหตุผลเดียวกับ conversations/[id]/route)
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

async function requireShopId() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const userId = (session.user as { id: string }).id;
  const activeCtx = await resolveActiveShopContext({
    user: { id: userId, activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null },
  });
  if (!activeCtx) return { error: NextResponse.json({ error: "ไม่พบร้านที่กำลังใช้งาน" }, { status: 404 }) };
  return { userId, shopId: activeCtx.shopId };
}

/** GET /api/chat/quick-messages — รายการข้อความสำเร็จรูปของร้านที่ active */
export async function GET() {
  const ctx = await requireShopId();
  if ("error" in ctx) return ctx.error;
  const items = await listQuickMessages(ctx.shopId);
  return NextResponse.json({ items }, { headers: NO_STORE_HEADERS });
}

/** POST /api/chat/quick-messages — สร้างข้อความสำเร็จรูปใหม่ */
export async function POST(request: NextRequest) {
  const ctx = await requireShopId();
  if ("error" in ctx) return ctx.error;

  const body = await request.json().catch(() => null);
  if (body === null) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const parsed = v.safeParse(QuickMessageCreateSchema, body);
  if (!parsed.success) {
    const firstIssue = parsed.issues[0]?.message ?? "Invalid input";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  const created = await createQuickMessage(ctx.shopId, ctx.userId, {
    title: parsed.output.title,
    category: parsed.output.category ?? null,
    body: parsed.output.body ?? "",
    // รวม field เก่า (imageFileId เดี่ยว) กับใหม่ (imageFileIds) ให้เหลืออาร์เรย์เดียว — client เก่า
    // ที่ยังส่ง field เดี่ยวมาต้องใช้งานได้เหมือนเดิม (feature 00018 multi-image 2026-07-23)
    imageFileIds:
      parsed.output.imageFileIds ?? (parsed.output.imageFileId ? [parsed.output.imageFileId] : []),
  });
  return NextResponse.json(created, { status: 201, headers: NO_STORE_HEADERS });
}

/**
 * PATCH /api/chat/quick-messages — จัดลำดับใหม่ทั้งชุด (user request 2026-07-30)
 * body: { orderedIds: string[] } — ลำดับในอาร์เรย์ = ลำดับที่จะแสดง
 *
 * อยู่ที่ collection ไม่ใช่ /[id] เพราะการจัดลำดับเป็นการเปลี่ยน "ทั้งชุด" ไม่ใช่แก้รายตัว
 * ownership อยู่ใน WHERE ของ service (updateMany {id, shopId}) — id ของร้านอื่นถูกข้ามเงียบ ๆ
 */
export async function PATCH(request: NextRequest) {
  const ctx = await requireShopId();
  if ("error" in ctx) return ctx.error;

  const body = await request.json().catch(() => null);
  if (body === null) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const parsed = v.safeParse(QuickMessageReorderSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    await reorderQuickMessages(ctx.shopId, parsed.output.orderedIds);
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (e) {
    console.error("[PATCH /api/chat/quick-messages]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "จัดลำดับไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
