import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as v from "valibot";

import { authOptions } from "@/lib/auth";
import { ReplyToReviewSchema } from "@/lib/validations";
import {
  replyToReview,
  deleteReviewReply,
  ReviewNotFoundError,
  ReviewReplyForbiddenError,
  ReviewReplyNotFoundError,
} from "@/services/review.service";

/**
 * คำตอบของร้านต่อรีวิว — feature 00041 (BR-BOE-21/22)
 *
 * POST   = สร้าง/เขียนทับคำตอบ (1 คำตอบต่อ 1 รีวิวเสมอ ตอบซ้ำ = แก้ไข ไม่ใช่สร้างใหม่)
 * DELETE = ลบคำตอบ (ไม่กระทบรีวิวต้นทาง)
 *
 * สิทธิ์เช็คที่ service ผ่าน canAccessShop() — เจ้าของร้าน หรือ ShopMember (role มีแค่ OWNER/ADMIN)
 * 🛑 ตรวจที่นี่เสมอ ไม่ใช่แค่ซ่อนปุ่มบนหน้าจอ (BR-BOE-07)
 *
 * ไม่มีเงื่อนไขเวลา — ร้านแก้/ลบคำตอบได้ไม่จำกัด (ต่างจากผู้ซื้อที่มีหน้าต่าง 24 ชม.)
 */

/** map custom error → response; คืน null ถ้าไม่ใช่ error ที่รู้จัก (ให้ผู้เรียกตัดสินต่อ) */
function mapError(err: unknown): NextResponse | null {
  if (err instanceof ReviewNotFoundError) {
    return NextResponse.json({ error: "ไม่พบรีวิวของคำสั่งซื้อนี้" }, { status: 404 });
  }
  if (err instanceof ReviewReplyForbiddenError) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ตอบกลับรีวิวของร้านนี้" }, { status: 403 });
  }
  if (err instanceof ReviewReplyNotFoundError) {
    return NextResponse.json({ error: "ยังไม่มีคำตอบให้ลบ" }, { status: 404 });
  }
  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(ReplyToReviewSchema, body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.issues[0]?.message ?? "ข้อมูลคำขอไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  try {
    const review = await replyToReview(token, userId, parsed.output.comment);
    return NextResponse.json({
      shopReplyComment: review.shopReplyComment,
      shopRepliedAt: review.shopRepliedAt,
      shopRepliedByUserId: review.shopRepliedByUserId,
    });
  } catch (err) {
    const mapped = mapError(err);
    if (mapped) return mapped;
    // ห้าม echo err.message ดิบ — อาจรั่วโครงสร้าง DB (RC-8)
    console.error("[review/reply POST]", err);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  try {
    await deleteReviewReply(token, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const mapped = mapError(err);
    if (mapped) return mapped;
    console.error("[review/reply DELETE]", err);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 400 });
  }
}
