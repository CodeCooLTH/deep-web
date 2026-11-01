import { NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveConversationShopId } from "@/lib/chat-scope";
import { forbiddenRoleResponse } from "@/lib/forbidden-role";
import { getNativeThreadState } from "@/services/chat-thread-state.service";
import { sessionUserId } from "@/lib/session-user";

// per-user authenticated data — ห้าม shared cache เก็บ/serve ทับข้าม user
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

const ConversationIdParamSchema = v.pipe(v.string(), v.uuid());

/**
 * GET /api/chat/conversations/{id}/thread-state — สถานะห้องสำหรับแชท Native ในแอปผู้ขาย (feature 00088)
 *
 * ค่าชุดเดียวกับที่หน้าเว็บคำนวณแล้วส่งเป็น prop (บอท · หน้าต่างตอบ · เพจหลุด · โควตา LINE · คอมเมนต์ต้นทาง ·
 * โฆษณา · สถิติลูกค้า · โหมด AI แนะนำ) — ดู `services/chat-thread-state.service.ts` · อ่านอย่างเดียว · เว็บไม่เรียก
 * ด่านเดียวกับ /preview: ร้านมาจากเธรด (H1) · ไม่ใช่ร้านของฉัน = 404 · บทบาทไม่พอ = 403
 */
export async function GET(
  _request: Request,
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

  const resolved = await resolveConversationShopId(
    { user: { id: userId, activeShopId: (session.user as { activeShopId?: string | null }).activeShopId ?? null } },
    idCheck.output, "H1"
  );
  if (!resolved) {
    return NextResponse.json({ error: "ไม่พบบทสนทนานี้" }, { status: 404 });
  }
  if ('denied' in resolved) return forbiddenRoleResponse();

  try {
    const state = await getNativeThreadState(idCheck.output, resolved.shopId, userId);
    if (!state) {
      return NextResponse.json({ error: "ไม่พบบทสนทนานี้" }, { status: 404 });
    }
    return NextResponse.json(state, { headers: NO_STORE_HEADERS });
  } catch (e: unknown) {
    console.error(
      "[GET /api/chat/conversations/[id]/thread-state]",
      e instanceof Error ? e.message : e,
    );
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
