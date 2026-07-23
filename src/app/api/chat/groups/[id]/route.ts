import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveActiveShopContext } from "@/lib/shop-context";
import { renameChatGroup, deleteChatGroup } from "@/services/chat-group.service";
import { ChatGroupRenameSchema } from "@/lib/validations";

// PATCH (เปลี่ยนชื่อ) / DELETE (ลบ) กลุ่มแชท — feature 00018
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
  return { shopId: activeCtx.shopId };
}

function badId() {
  return NextResponse.json({ error: "รหัสกลุ่มไม่ถูกต้อง" }, { status: 400 });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireShopId();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const idCheck = v.safeParse(IdParamSchema, id);
  if (!idCheck.success) return badId();

  const body = await request.json().catch(() => null);
  if (body === null) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const parsed = v.safeParse(ChatGroupRenameSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  try {
    await renameChatGroup(idCheck.output, ctx.shopId, parsed.output.name);
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "GROUP_NAME_TAKEN") return NextResponse.json({ error: "มีกลุ่มชื่อนี้อยู่แล้ว" }, { status: 409 });
    if (msg === "GROUP_NOT_FOUND") return NextResponse.json({ error: "ไม่พบกลุ่มนี้" }, { status: 404 });
    if (msg === "GROUP_NAME_EMPTY" || msg === "GROUP_NAME_TOO_LONG")
      return NextResponse.json({ error: "ชื่อกลุ่มไม่ถูกต้อง" }, { status: 400 });
    console.error("[PATCH /api/chat/groups/[id]]", msg);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireShopId();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const idCheck = v.safeParse(IdParamSchema, id);
  if (!idCheck.success) return badId();

  try {
    await deleteChatGroup(idCheck.output, ctx.shopId);
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "GROUP_NOT_FOUND") return NextResponse.json({ error: "ไม่พบกลุ่มนี้" }, { status: 404 });
    console.error("[DELETE /api/chat/groups/[id]]", msg);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
