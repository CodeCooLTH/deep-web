import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveActiveShopContext } from "@/lib/shop-context";
import { getConversationCrm, updateConversationCrm } from "@/services/chat-crm.service";
import { ChatCrmPatchSchema } from "@/lib/validations";

// feature 00018 CRM/tag ต่อผู้ติดต่อ — GET อ่าน, PATCH แก้ (ownership scope shopId ใน service)
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

const IdParamSchema = v.pipe(v.string(), v.uuid());

async function resolveShop() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const userId = (session.user as { id: string }).id;
  const ctx = await resolveActiveShopContext({
    user: { id: userId, activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null },
  });
  if (!ctx) return { error: NextResponse.json({ error: "ไม่พบร้านที่กำลังใช้งาน" }, { status: 404 }) };
  return { shopId: ctx.shopId };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveShop();
  if ("error" in ctx) return ctx.error;
  const { id: rawId } = await params;
  const idCheck = v.safeParse(IdParamSchema, rawId);
  if (!idCheck.success) return NextResponse.json({ error: "รหัสไม่ถูกต้อง" }, { status: 400 });

  const crm = await getConversationCrm(idCheck.output, ctx.shopId);
  if (!crm) return NextResponse.json({ error: "ไม่พบบทสนทนานี้" }, { status: 404 });
  return NextResponse.json(crm, { headers: NO_STORE_HEADERS });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveShop();
  if ("error" in ctx) return ctx.error;
  const { id: rawId } = await params;
  const idCheck = v.safeParse(IdParamSchema, rawId);
  if (!idCheck.success) return NextResponse.json({ error: "รหัสไม่ถูกต้อง" }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (body === null) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const parsed = v.safeParse(ChatCrmPatchSchema, body);
  if (!parsed.success) {
    const firstIssue = parsed.issues[0]?.message ?? "Invalid input";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  try {
    const crm = await updateConversationCrm(idCheck.output, ctx.shopId, parsed.output);
    return NextResponse.json(crm, { headers: NO_STORE_HEADERS });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "CONVERSATION_NOT_FOUND") {
      return NextResponse.json({ error: "ไม่พบบทสนทนานี้" }, { status: 404 });
    }
    console.error("[PATCH /api/chat/conversations/[id]/crm]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
