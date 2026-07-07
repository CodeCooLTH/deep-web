import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as v from "valibot";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CreateReviewSchema } from "@/lib/validations";
import { createReview } from "@/services/review.service";

// feature 00015 (Order Claim & Forced Login) — review เป็น action ที่ต้อง login + เป็นเจ้าของออเดอร์
// (buyerUserId) เท่านั้น; ปิด guest-write เดิมที่ fallback ไป order.buyerContact โดยไม่มี proof.
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const session = await getServerSession(authOptions);
  const userId = session?.user ? (session.user as { id: string }).id : null;
  if (!userId) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });

  const body = await request.json();
  const parsed = v.safeParse(CreateReviewSchema, body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const order = await prisma.order.findUnique({
    where: { publicToken: token },
    select: { buyerUserId: true },
  });
  if (!order) return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });
  if (order.buyerUserId !== userId) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์รีวิวคำสั่งซื้อนี้" }, { status: 403 });
  }

  try {
    const review = await createReview(token, { ...parsed.output, reviewerUserId: userId });
    return NextResponse.json(review, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
