import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveConversationShopId } from "@/lib/chat-scope";
import { getConversationCrm, updateConversationCrm } from "@/services/chat-crm.service";
import { ChatCrmPatchSchema } from "@/lib/validations";
import { sessionUserId } from "@/lib/session-user";

// feature 00018 CRM/tag ต่อผู้ติดต่อ — GET อ่าน, PATCH แก้ (ownership scope shopId ใน service)
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

const IdParamSchema = v.pipe(v.string(), v.uuid());

/**
 * feature 00037 — ร้านที่ใช้ทำงานกับเธรดนี้ = "ร้านเจ้าของเธรด" ไม่ใช่ร้านที่ active
 * (ในกล่องแชทรวม สองอย่างนี้ไม่ใช่สิ่งเดียวกัน) resolveConversationShopId scope สิทธิ์ใน WHERE
 * ตั้งแต่คำสั่งแรก และคืน null เหมือนกันทั้ง "ไม่มีเธรด" กับ "ไม่มีสิทธิ์"
 */
async function resolveShop(conversationId: string) {
  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!session?.user || !userId) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const resolved = await resolveConversationShopId(
    { user: { id: userId, activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null } },
    conversationId,
  );
  if (!resolved) return { error: NextResponse.json({ error: "ไม่พบบทสนทนานี้" }, { status: 404 }) };
  return { shopId: resolved.shopId };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const idCheck = v.safeParse(IdParamSchema, rawId);
  if (!idCheck.success) return NextResponse.json({ error: "รหัสไม่ถูกต้อง" }, { status: 400 });
  const ctx = await resolveShop(idCheck.output);
  if ("error" in ctx) return ctx.error;

  const crm = await getConversationCrm(idCheck.output, ctx.shopId);
  if (!crm) return NextResponse.json({ error: "ไม่พบบทสนทนานี้" }, { status: 404 });
  return NextResponse.json(crm, { headers: NO_STORE_HEADERS });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const idCheck = v.safeParse(IdParamSchema, rawId);
  if (!idCheck.success) return NextResponse.json({ error: "รหัสไม่ถูกต้อง" }, { status: 400 });
  const ctx = await resolveShop(idCheck.output);
  if ("error" in ctx) return ctx.error;

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
