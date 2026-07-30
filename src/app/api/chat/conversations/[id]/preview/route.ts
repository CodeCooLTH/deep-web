import { NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveActiveShopContext } from "@/lib/shop-context";
import { getConversationToastPreview } from "@/services/chat.service";

// per-user authenticated data — ห้าม shared cache (CDN/carrier proxy) เก็บ/serve ทับข้าม user
// (บทเรียนโปรเจกต์ 2026-07-04: default header เป็น public ทำให้ carrier cache ข้าม user)
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

const ConversationIdParamSchema = v.pipe(v.string(), v.uuid());

/**
 * GET /api/chat/conversations/{id}/preview — ข้อมูลสำหรับ toast "มีข้อความใหม่" (feature 00018)
 *
 * ทำไมต้องมี endpoint นี้: realtime broadcast ส่งมาแค่ conversationId (signal-only โดยตั้งใจ —
 * ดู comment ที่ getConversationToastPreview) ฝั่ง client จึงต้องมาขอเนื้อหาผ่านทางที่ตรวจ session
 * + scope ด้วย shopId อีกชั้น แทนที่จะเชื่อสิ่งที่มากับ broadcast
 *
 * ownership อยู่ใน WHERE ของ service เอง — route แค่ resolve shopId แล้วส่งต่อ (กัน TOCTOU/IDOR)
 * ไม่พบ = 404 เหมือนกันหมด ไม่แยกว่า "ไม่มีจริง" กับ "ของร้านอื่น" (กันใช้ status ไล่เดา id)
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;

  const activeCtx = await resolveActiveShopContext({
    user: {
      id: userId,
      activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null,
    },
  });
  if (!activeCtx) {
    return NextResponse.json({ error: "ไม่พบร้านที่กำลังใช้งาน" }, { status: 404 });
  }

  const { id: rawId } = await params;
  const idCheck = v.safeParse(ConversationIdParamSchema, rawId);
  if (!idCheck.success) {
    return NextResponse.json({ error: "รหัสบทสนทนาไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const preview = await getConversationToastPreview(idCheck.output, activeCtx.shopId);
    if (!preview) {
      return NextResponse.json({ error: "ไม่พบบทสนทนานี้" }, { status: 404 });
    }
    return NextResponse.json(preview, { headers: NO_STORE_HEADERS });
  } catch (e: unknown) {
    console.error(
      "[GET /api/chat/conversations/[id]/preview]",
      e instanceof Error ? e.message : e,
    );
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
