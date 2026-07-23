import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveActiveShopContext } from "@/lib/shop-context";
import { listChatGroups, createChatGroup } from "@/services/chat-group.service";
import { ChatGroupCreateSchema } from "@/lib/validations";

// กลุ่ม/แท็บจัดหมวดแชท ระดับร้าน — feature 00018 (user request 2026-07-23)
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

/** GET /api/chat/groups — รายการกลุ่มของร้านที่ active (เรียงตาม sortOrder) */
export async function GET() {
  const ctx = await requireShopId();
  if ("error" in ctx) return ctx.error;
  const items = await listChatGroups(ctx.shopId);
  return NextResponse.json({ items }, { headers: NO_STORE_HEADERS });
}

/** POST /api/chat/groups — สร้างกลุ่มใหม่ { name } */
export async function POST(request: NextRequest) {
  const ctx = await requireShopId();
  if ("error" in ctx) return ctx.error;

  const body = await request.json().catch(() => null);
  if (body === null) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const parsed = v.safeParse(ChatGroupCreateSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const created = await createChatGroup(ctx.shopId, parsed.output.name);
    return NextResponse.json(created, { status: 201, headers: NO_STORE_HEADERS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "GROUP_NAME_TAKEN") return NextResponse.json({ error: "มีกลุ่มชื่อนี้อยู่แล้ว" }, { status: 409 });
    if (msg === "GROUP_LIMIT_REACHED") return NextResponse.json({ error: "จำนวนกลุ่มถึงขีดจำกัดแล้ว" }, { status: 400 });
    if (msg === "GROUP_NAME_EMPTY" || msg === "GROUP_NAME_TOO_LONG")
      return NextResponse.json({ error: "ชื่อกลุ่มไม่ถูกต้อง" }, { status: 400 });
    console.error("[POST /api/chat/groups]", msg);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
