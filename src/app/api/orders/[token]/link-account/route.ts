// POST /api/orders/[token]/link-account — feature 00015 S-5 (เชื่อมบัญชี)
//
// ย้าย provider ที่ใช้ล็อกอิน (Facebook/LINE/Instagram) จากบัญชีใหม่ที่เพิ่งเกิดจาก OAuth
// ไปผูกกับบัญชีเดิมที่ถือเบอร์ของคำสั่งซื้อนี้อยู่
//
// หลักฐานที่ใช้: ticket ที่ verify-phone ออกให้หลังผู้ใช้ยืนยัน OTP บนเบอร์นั้นสำเร็จแล้ว
// (ดู src/lib/account-merge-ticket.ts ว่าทำไมไม่ขอ OTP ซ้ำ)
//
// ไม่ย้ายข้อมูลใด ๆ ระหว่างสองบัญชี (user ตัดสิน 2026-07-25 ตัวเลือก "ก"): ถ้าบัญชีต้นทาง
// มีข้อมูลอยู่แล้วให้บล็อกไปเลย เพราะการรวมข้อมูลข้ามบัญชีพลาดแล้วกู้ยากมาก
//
// mutation ใต้ /api/orders/** → guardApi() ใน proxy.ts คุม CSRF/rate-limit ให้แล้ว
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as v from "valibot";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAccountMergeTicket } from "@/lib/account-merge-ticket";
import { guaranteeOrderLink } from "@/services/order-access.service";

const Body = v.object({ ticket: v.pipe(v.string(), v.minLength(1)) });

// provider ที่ย้ายได้ = provider ที่ล็อกอินผ่าน OAuth เท่านั้น
const MOVABLE_PROVIDERS = ["FACEBOOK", "LINE", "INSTAGRAM"] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const session = await getServerSession(authOptions);
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
  if (!sessionUserId) {
    return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });
  }

  const parsed = v.safeParse(Body, await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const ticket = verifyAccountMergeTicket(parsed.output.ticket);
  if (!ticket) {
    return NextResponse.json(
      { error: "คำขอหมดอายุ กรุณายืนยันเบอร์ใหม่อีกครั้ง" },
      { status: 400 },
    );
  }

  // ticket ต้องเป็นของ session ที่ถืออยู่จริง — กันเอา ticket ของคนอื่นมายิง
  if (ticket.fromUserId !== sessionUserId) {
    return NextResponse.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  }

  // ticket ผูกกับออเดอร์ใบเดียว — เอาไปใช้กับ /o/ ใบอื่นไม่ได้
  const order = await prisma.order.findUnique({
    where: { publicToken: token },
    select: { id: true, buyerUserId: true },
  });
  if (!order || order.id !== ticket.orderId) {
    return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });
  }
  if (order.buyerUserId != null && order.buyerUserId !== ticket.toUserId) {
    return NextResponse.json(
      { error: "คำสั่งซื้อนี้ถูกผูกกับบัญชีอื่นแล้ว" },
      { status: 409 },
    );
  }

  const [fromUser, toUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: ticket.fromUserId },
      select: {
        id: true,
        phone: true,
        authAccounts: { select: { id: true, provider: true, providerAccountId: true } },
        _count: { select: { ordersAsBuyer: true, shops: true, reviewsGiven: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: ticket.toUserId },
      select: { id: true, authAccounts: { select: { provider: true } } },
    }),
  ]);
  if (!fromUser || !toUser) {
    return NextResponse.json({ error: "ไม่พบบัญชี" }, { status: 404 });
  }

  // D4 — ไม่รวมข้อมูลข้ามบัญชี: บัญชีต้นทางต้องยังว่างจริง ๆ ถึงจะย้าย provider ออกได้
  // ถ้ามีออเดอร์/ร้าน/รีวิว อยู่แล้ว การย้ายจะทิ้งข้อมูลนั้นไว้ในบัญชีที่ล็อกอินไม่ได้อีก
  // เคสนี้ต้องให้แอดมินจัดการเป็นราย ๆ ไม่ใช่ปล่อยให้ระบบตัดสินเอง
  const hasData =
    fromUser._count.ordersAsBuyer > 0 ||
    fromUser._count.shops > 0 ||
    fromUser._count.reviewsGiven > 0 ||
    fromUser.phone != null;
  if (hasData) {
    return NextResponse.json(
      { error: "บัญชีที่ใช้อยู่มีข้อมูลแล้ว เชื่อมอัตโนมัติไม่ได้", code: "SOURCE_HAS_DATA" },
      { status: 409 },
    );
  }

  // ย้ายเฉพาะ provider ที่ปลายทางยังไม่มี — ปลายทางมี Facebook ของตัวเองอยู่แล้วแปลว่าเป็นคนละ
  // Facebook กัน ห้ามทับของเดิม (กติกาเดียวกับ AC-03 ของ LINK MODE ใน lib/auth.ts)
  const targetProviders = new Set(toUser.authAccounts.map((a) => a.provider));
  const movable = fromUser.authAccounts.filter(
    (a) =>
      (MOVABLE_PROVIDERS as readonly string[]).includes(a.provider) &&
      !targetProviders.has(a.provider),
  );

  if (movable.length === 0) {
    return NextResponse.json(
      { error: "บัญชีเดิมมีช่องทางนี้เชื่อมไว้อยู่แล้ว กรุณาเข้าสู่ระบบด้วยบัญชีเดิมโดยตรง", code: "ALREADY_LINKED" },
      { status: 409 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.authAccount.updateMany({
      where: { id: { in: movable.map((a) => a.id) } },
      data: { userId: toUser.id },
    });
  });

  // ไม่ลบบัญชีต้นทางทิ้ง: มันว่างอยู่แล้วและไม่มี provider ให้ล็อกอินได้อีก จึงไม่เป็นอันตราย
  // การลบ User มี cascade หลายทางซึ่งเสี่ยงกว่าประโยชน์ที่ได้ ปล่อยให้เป็นงาน cleanup ภายหลัง

  await guaranteeOrderLink({ orderId: order.id, userId: toUser.id, phone: null });

  // provider ที่ย้ายไป — UI เอาไปเรียก signIn ซ้ำเพื่อให้ session กลายเป็นบัญชีเดิม
  // (JWT ปัจจุบันยังชี้ไปที่บัญชีต้นทางซึ่งตอนนี้ไม่มี provider แล้ว)
  return NextResponse.json({
    ok: true,
    provider: movable[0].provider.toLowerCase(),
  });
}
