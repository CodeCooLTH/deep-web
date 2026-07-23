import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveActiveShopContext } from "@/lib/shop-context";
import { updateQuickMessage, deleteQuickMessage } from "@/services/quick-message.service";
import { QuickMessageUpdateSchema } from "@/lib/validations";

// feature 00018 composer improvement #2 — แก้/ลบ ข้อความสำเร็จรูป (scope shopId ใน service)
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

const IdParamSchema = v.pipe(v.string(), v.uuid());

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

/** PATCH /api/chat/quick-messages/{id} — แก้ (full replace) */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireShopId();
  if ("error" in ctx) return ctx.error;

  const { id: rawId } = await params;
  const idCheck = v.safeParse(IdParamSchema, rawId);
  if (!idCheck.success) return NextResponse.json({ error: "รหัสไม่ถูกต้อง" }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (body === null) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const parsed = v.safeParse(QuickMessageUpdateSchema, body);
  if (!parsed.success) {
    const firstIssue = parsed.issues[0]?.message ?? "Invalid input";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  try {
    const updated = await updateQuickMessage(idCheck.output, ctx.shopId, {
      title: parsed.output.title,
      category: parsed.output.category ?? null,
      body: parsed.output.body ?? "",
      imageFileId: parsed.output.imageFileId ?? null,
    });
    return NextResponse.json(updated, { headers: NO_STORE_HEADERS });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "QUICK_MESSAGE_NOT_FOUND") {
      return NextResponse.json({ error: "ไม่พบข้อความสำเร็จรูปนี้" }, { status: 404 });
    }
    console.error("[PATCH /api/chat/quick-messages/[id]]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}

/** DELETE /api/chat/quick-messages/{id} */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireShopId();
  if ("error" in ctx) return ctx.error;

  const { id: rawId } = await params;
  const idCheck = v.safeParse(IdParamSchema, rawId);
  if (!idCheck.success) return NextResponse.json({ error: "รหัสไม่ถูกต้อง" }, { status: 400 });

  try {
    await deleteQuickMessage(idCheck.output, ctx.shopId);
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "QUICK_MESSAGE_NOT_FOUND") {
      return NextResponse.json({ error: "ไม่พบข้อความสำเร็จรูปนี้" }, { status: 404 });
    }
    console.error("[DELETE /api/chat/quick-messages/[id]]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
