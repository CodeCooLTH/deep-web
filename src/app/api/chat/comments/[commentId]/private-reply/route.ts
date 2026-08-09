import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendPrivateReplyToCommentById } from "@/services/comment-private-reply.service";
import { PrivateReplySchema } from "@/lib/validations";

/**
 * POST /api/chat/comments/[commentId]/private-reply — ปุ่มแมนนวล "ทักแชท" (feature 00038)
 * body: { message: string } → API.md §4.4
 *
 * ยกโครงจากไฟล์พี่น้อง src/app/api/chat/comments/[commentId]/reply/route.ts (ตอบสาธารณะ,
 * feature 00029) — auth เหมือนกัน (session → userId ตรง ๆ ไม่มี activeShopId เลย)
 *
 * 🛑 ห้ามอ่าน/เช็ค session.activeShopId ในไฟล์นี้ — ไฟล์นี้อยู่ใต้ src/app/api/chat/** ซึ่งเป็น
 * "ขอบเขตแชท" ตาม src/lib/chat-scope.ts (docstring: ไฟล์กลุ่มนี้ห้ามเรียก
 * resolveActiveShopContext/requireActiveShop ตรง ๆ) — คอมเมนต์ 1 อันอาจเป็นของร้านที่ไม่ใช่ร้าน
 * active ของผู้ใช้ (ผู้ใช้เข้าถึงได้หลายร้าน) การตรวจสิทธิ์ที่ถูกต้องคือไล่จากแถวข้อมูลเอง
 * (comment → post → channel → shop) ซึ่ง sendPrivateReplyToCommentById ทำให้แล้วผ่าน
 * canAccessShop(channel.shopId, actorUserId) ภายในตัวมันเอง (ดู docstring ข้อ 3 ของฟังก์ชันนั้น)
 *
 * 🛑 ห้ามส่ง reservedLogId (เส้นทาง AUTO เท่านั้น — processCommentAutoReply เป็นคนจองแถวเอง)
 * ต้องส่ง trigger: 'MANUAL' + actorUserId จาก session เสมอ
 */
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json(
      { error: "unauthorized", code: "UNAUTHORIZED" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }
  const userId = (session.user as { id: string }).id;
  const { commentId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(PrivateReplySchema, body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "กรุณากรอกข้อความก่อนส่ง", code: "VALIDATION_ERROR" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const result = await sendPrivateReplyToCommentById({
    commentId,
    text: parsed.output.message,
    trigger: "MANUAL",
    actorUserId: userId,
  });

  if (result.sent) {
    return NextResponse.json(
      { conversationId: result.conversationId, sentAt: new Date().toISOString() },
      { headers: NO_STORE_HEADERS },
    );
  }

  // mapping ตาม API.md §4.4/§5 (frozen contract) — บาง reason (WINDOW_EXPIRED/ALREADY_SENT/
  // CHANNEL_INACTIVE) เป็น 409 ไม่ใช่ 400 เพราะเป็นการ "ชนกับสถานะปัจจุบัน" ไม่ใช่ input ผิดรูป
  switch (result.reason) {
    case "COMMENT_NOT_FOUND":
      return NextResponse.json(
        { error: "ไม่พบความคิดเห็นนี้", code: "NOT_FOUND" },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    case "FORBIDDEN":
      return NextResponse.json(
        { error: "ไม่มีสิทธิ์ทักแชทจากความคิดเห็นนี้", code: "FORBIDDEN" },
        { status: 403, headers: NO_STORE_HEADERS },
      );
    case "ALREADY_SENT":
      return NextResponse.json(
        { error: "คอมเมนต์นี้ถูกทักไปแล้ว", code: "ALREADY_SENT" },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    case "WINDOW_EXPIRED":
      return NextResponse.json(
        { error: "เกิน 7 วันนับจากเวลาคอมเมนต์ ทักแชทไม่ได้แล้ว", code: "WINDOW_EXPIRED" },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    case "CHANNEL_INACTIVE":
      return NextResponse.json(
        { error: "เพจนี้ยังไม่ได้เชื่อมต่อ", code: "CHANNEL_NOT_ACTIVE" },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    case "EMPTY_TEXT":
      // ปกติ Valibot กรองข้อความว่างไปแล้วก่อนถึงตรงนี้ — เผื่อไว้เป็นด่านสำรอง
      return NextResponse.json(
        { error: "กรุณากรอกข้อความก่อนส่ง", code: "VALIDATION_ERROR" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    case "SEND_FAILED":
      return NextResponse.json(
        { error: "Facebook ปฏิเสธการส่งข้อความ กรุณาลองใหม่", code: "UPSTREAM_ERROR" },
        { status: 502, headers: NO_STORE_HEADERS },
      );
    default:
      console.error("[POST /api/chat/comments/[commentId]/private-reply] unhandled reason", result);
      return NextResponse.json(
        { error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง", code: "INTERNAL_ERROR" },
        { status: 500, headers: NO_STORE_HEADERS },
      );
  }
}
