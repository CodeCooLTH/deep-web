import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as v from "valibot";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CreateReviewSchema, UpdateReviewSchema } from "@/lib/validations";
import { sessionUserId } from "@/lib/session-user";
import {
  createReview,
  updateReview,
  deleteReview,
  ReviewNotFoundError,
  ReviewForbiddenError,
  ReviewEditWindowExpiredError,
} from "@/services/review.service";

// feature 00015 (Order Claim & Forced Login) — review เป็น action ที่ต้อง login + เป็นเจ้าของออเดอร์
// (buyerUserId) เท่านั้น; ปิด guest-write เดิมที่ fallback ไป order.buyerContact โดยไม่มี proof.
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
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

/**
 * PATCH / DELETE — ผู้ซื้อแก้ไข/ลบรีวิวของตัวเองภายใน 24 ชม. (feature 00041, BR-BOE-17)
 *
 * DELETE เป็น **soft delete** — แถวยังอยู่เพื่อกันการเขียนรีวิวใหม่ซึ่งจะรีเซ็ตหน้าต่างแก้ไข
 * (เหตุผลเต็มที่ review.service.ts::deleteReview)
 *
 * 🛑 ลำดับ error ที่ service คืนมาถูกออกแบบไว้แล้ว: not-found → forbidden → expired
 * route แค่แปลงเป็น status ตรง ๆ ห้ามสลับลำดับเช็คเองที่นี่ (จะเปิด oracle ให้คนที่ไม่ใช่เจ้าของ
 * รู้ว่ารีวิวใบนั้นหมดเวลาแก้ไขหรือยัง)
 */
function mapReviewError(err: unknown, action: "แก้ไข" | "ลบ"): NextResponse | null {
  if (err instanceof ReviewNotFoundError) {
    return NextResponse.json({ error: "ไม่พบรีวิวของคำสั่งซื้อนี้" }, { status: 404 });
  }
  if (err instanceof ReviewForbiddenError) {
    return NextResponse.json({ error: `ไม่มีสิทธิ์${action}รีวิวนี้` }, { status: 403 });
  }
  if (err instanceof ReviewEditWindowExpiredError) {
    return NextResponse.json(
      { error: `${action}รีวิวได้เฉพาะภายใน 24 ชั่วโมงหลังโพสต์` },
      { status: 409 },
    );
  }
  return null;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(UpdateReviewSchema, body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.issues[0]?.message ?? "ข้อมูลคำขอไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  try {
    const review = await updateReview(token, userId, parsed.output);
    return NextResponse.json(review);
  } catch (err) {
    const mapped = mapReviewError(err, "แก้ไข");
    if (mapped) return mapped;
    console.error("[review PATCH]", err);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  try {
    await deleteReview(token, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const mapped = mapReviewError(err, "ลบ");
    if (mapped) return mapped;
    console.error("[review DELETE]", err);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 400 });
  }
}
