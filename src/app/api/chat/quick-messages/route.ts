import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveActiveShopContext } from "@/lib/shop-context";
import { listQuickMessages, createQuickMessage } from "@/services/quick-message.service";
import { QuickMessageCreateSchema } from "@/lib/validations";

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
    imageFileId: parsed.output.imageFileId ?? null,
  });
  return NextResponse.json(created, { status: 201, headers: NO_STORE_HEADERS });
}
