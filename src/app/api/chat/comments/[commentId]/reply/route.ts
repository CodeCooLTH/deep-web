import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { replyToComment } from "@/services/page-comment.service";
import { GraphApiError } from "@/lib/facebook/graph";
import { sessionUserId } from "@/lib/session-user";

/**
 * POST /api/chat/comments/[commentId]/reply — ตอบคอมเมนต์แบบสาธารณะในนามเพจ (feature 00029)
 * body: { message: string }
 *
 * 🛑 ข้อความนี้เป็นสาธารณะ ทุกคนที่เห็นโพสต์เห็นด้วย — UI ต้องเตือนก่อนส่ง (BR-23)
 */
export const dynamic = "force-dynamic";

const MAX_LEN = 8000; // เพดานคอมเมนต์ของ Facebook เอง ~8000 ตัวอักษร

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> },
) {
  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!session?.user || !userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { commentId } = await params;

  let message = "";
  let fileId: string | null = null;
  try {
    const body = (await request.json()) as { message?: unknown; fileId?: unknown };
    if (typeof body.fileId === "string" && body.fileId.length > 0) fileId = body.fileId;
    if (typeof body.message === "string") message = body.message.trim();
    // เอกสาร Meta: ต้องมีอย่างน้อยหนึ่งใน message/attachment_url/... — รูปอย่างเดียวก็ส่งได้
    if (!message && !fileId) {
      return NextResponse.json({ error: "กรุณาพิมพ์ข้อความหรือแนบรูปก่อนส่ง" }, { status: 400 });
    }
    if (message.length > MAX_LEN) {
      return NextResponse.json({ error: "ข้อความยาวเกินไป" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const result = await replyToComment({ commentId, message, actorUserId: userId, fileId });
    return NextResponse.json({ ok: true, id: result.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "COMMENT_NOT_FOUND") return NextResponse.json({ error: "ไม่พบความคิดเห็นนี้" }, { status: 404 });
    if (msg === "FORBIDDEN") return NextResponse.json({ error: "ไม่มีสิทธิ์ตอบความคิดเห็นนี้" }, { status: 403 });
    if (msg === "COMMENT_DELETED") return NextResponse.json({ error: "ความคิดเห็นนี้ถูกลบไปแล้ว" }, { status: 409 });
    if (msg === "CHANNEL_INACTIVE") return NextResponse.json({ error: "เพจนี้ยังไม่ได้เชื่อมต่อ" }, { status: 409 });
    if (e instanceof GraphApiError) {
      return NextResponse.json({ error: `Facebook ปฏิเสธการตอบ: ${e.message}` }, { status: 502 });
    }
    console.error("[POST /api/chat/comments/[commentId]/reply]", msg || e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
