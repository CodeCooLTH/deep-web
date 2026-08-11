import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveConversationShopId } from "@/lib/chat-scope";
import { updateConversationState } from "@/services/chat.service";
import { setConversationGroup } from "@/services/chat-group.service";
import { ConversationPatchSchema } from "@/lib/validations";
import { sessionUserId } from "@/lib/session-user";

// S-7 (ตัวกรองแชท + ปักหมุด/ซ่อน/ปิดงาน) — feature 00018
//
// per-user authenticated data — ห้าม shared cache (CDN/carrier proxy) เก็บ/serve ทับข้าม user
// (บทเรียนโปรเจกต์ 2026-07-04: default header เป็น public ทำให้ carrier cache ข้าม user)
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

// path param id ต้องเป็น uuid — ไม่ผ่าน = 400 ชัดเจนแทนปล่อยไป service→404
const ConversationIdParamSchema = v.pipe(v.string(), v.uuid());

/**
 * PATCH /api/chat/conversations/{id} — pin/unpin/hide/unhide/resolve/reopen เธรดแชทของร้าน
 * body: { action: 'pin'|'unpin'|'hide'|'unhide'|'resolve'|'reopen' }
 *
 * ownership อยู่ใน WHERE ของ updateConversationState(id, shopId) เอง (updateMany atomic guard) —
 * route หน้าที่แค่ resolve shopId จาก session แล้วส่งต่อ ไม่ query แยกก่อน (กัน TOCTOU/IDOR)
 * pattern เดียวกับ disconnectChannel (DELETE /api/channels/[id])
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!session?.user || !userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id: rawId } = await params;
  const idCheck = v.safeParse(ConversationIdParamSchema, rawId);
  if (!idCheck.success) {
    return NextResponse.json({ error: "รหัสบทสนทนาไม่ถูกต้อง" }, { status: 400 });
  }

  // feature 00037 — ร้านมาจาก "เธรด" ไม่ใช่ร้านที่ active: ในกล่องแชทรวม ผู้ใช้ปักหมุด/ปิดงาน
  // เธรดของอีกร้านได้ ถ้ายัง scope ด้วยร้าน active การกดจะเงียบไม่มีอะไรเกิดขึ้น (updateMany
  // count=0) แล้วโยน CONVERSATION_NOT_FOUND_OR_FORBIDDEN ทั้งที่ผู้ใช้มีสิทธิ์เต็ม
  const resolved = await resolveConversationShopId(
    { user: { id: userId, activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null } },
    idCheck.output,
  );
  if (!resolved) {
    return NextResponse.json({ error: "ไม่พบบทสนทนานี้" }, { status: 404 });
  }
  const activeCtx = { shopId: resolved.shopId };

  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const parsed = v.safeParse(ConversationPatchSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    if (parsed.output.action === "set-group") {
      // ย้ายเธรดเข้ากลุ่ม/เอาออก — chatGroupId undefined ให้ถือเป็น null (เอาออกจากกลุ่ม)
      await setConversationGroup(idCheck.output, activeCtx.shopId, parsed.output.chatGroupId ?? null);
    } else {
      await updateConversationState(idCheck.output, activeCtx.shopId, parsed.output.action);
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (e: unknown) {
    if (e instanceof Error && (e.message === "CONVERSATION_NOT_FOUND_OR_FORBIDDEN" || e.message === "GROUP_NOT_FOUND")) {
      return NextResponse.json({ error: "ไม่พบบทสนทนาหรือกลุ่มนี้" }, { status: 404 });
    }
    console.error("[PATCH /api/chat/conversations/[id]]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
