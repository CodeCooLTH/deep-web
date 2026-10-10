import { NextRequest, NextResponse } from "next/server";
import { getReviewsByUsername } from "@/services/review.service";
import { maskedReviewerName } from "@/lib/reviewer-display";
import { formatOrderNo } from "@/lib/order-no";

// route สาธารณะ (ไม่ต้องล็อกอิน) — คืนเฉพาะฟิลด์ที่หน้าโปรไฟล์สาธารณะแสดงอยู่แล้ว
// 🛑 security review 00071 H1: เดิมคืนแถว Review ดิบ = reviewerContact (เบอร์/อีเมลผู้รีวิว) +
// publicToken ของออเดอร์ + ต้นทุนรายบรรทัด ให้ใครก็ได้ และ take ไม่มีเพดาน
const MAX_TAKE = 50;

function intParam(raw: string | null, fallback: number, max: number): number {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(Math.floor(n), max);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const take = intParam(request.nextUrl.searchParams.get("take"), 10, MAX_TAKE);
  const skip = intParam(request.nextUrl.searchParams.get("skip"), 0, Number.MAX_SAFE_INTEGER);

  const reviews = await getReviewsByUsername(username, take, skip);
  return NextResponse.json(
    reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      reviewerName: maskedReviewerName(r.reviewer?.displayName, r.reviewerContact),
      orderNo: formatOrderNo(r.order.publicToken, r.order.createdAt),
      shopReply: r.shopReplyComment,
      shopRepliedAt: r.shopRepliedAt,
    })),
  );
}
