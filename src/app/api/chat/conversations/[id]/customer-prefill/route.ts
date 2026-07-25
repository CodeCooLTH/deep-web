import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { resolveActiveShopContext } from "@/lib/shop-context";
import { prisma } from "@/lib/prisma";

// GET /api/chat/conversations/[id]/customer-prefill — เบอร์ + ที่อยู่ล่าสุดของลูกค้าที่ผูกกับเธรดนี้
// สำหรับ prefill ฟอร์มสร้างออเดอร์จากแชท (user request 2026-07-25: แชทผูกลูกค้าแล้ว → เติมเบอร์+ที่อยู่
// ล่าสุดทันที ลูกค้าเปลี่ยนค่อยแก้). ownership: conversation ต้องเป็นของร้านที่ active (WHERE guard กัน IDOR)
//
// privacy: ที่อยู่ดึงจากออเดอร์ "ของร้านนี้เท่านั้น" (shopId guard) — ไม่รั่วที่อยู่จัดส่งข้ามร้าน;
// เบอร์ = Customer.phone (สำหรับ contact ที่ผูกแล้ว เบอร์มาจากออเดอร์ของร้านนี้ตอนสร้าง Customer อยู่แล้ว)
// logic resolve customer เดียวกับ orders route + inbox/[conversationId]/page.tsx
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
const IdParam = v.pipe(v.string(), v.uuid());

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const activeCtx = await resolveActiveShopContext({
    user: { id: userId, activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null },
  });
  if (!activeCtx) return NextResponse.json({ error: "ไม่พบร้านที่กำลังใช้งาน" }, { status: 404 });

  const { id } = await params;
  const idc = v.safeParse(IdParam, id);
  if (!idc.success) return NextResponse.json({ error: "รหัสบทสนทนาไม่ถูกต้อง" }, { status: 400 });

  const conv = await prisma.conversation.findFirst({
    where: { id: idc.output, shopId: activeCtx.shopId },
    select: {
      channel: true,
      buyerUserId: true,
      externalContact: { select: { customer: { select: { id: true, phone: true } } } },
    },
  });
  if (!conv) return NextResponse.json({ error: "ไม่พบบทสนทนานี้" }, { status: 404 });

  let customer: { id: string; phone: string } | null = null;
  if (conv.channel !== "DEEP") {
    customer = conv.externalContact?.customer ?? null;
  } else if (conv.buyerUserId) {
    customer = await prisma.customer.findUnique({
      where: { userId: conv.buyerUserId },
      select: { id: true, phone: true },
    });
  }
  // ยังไม่ผูก Customer → ไม่มีอะไร prefill (ไม่ใช่ error)
  if (!customer) return NextResponse.json({ linked: false }, { headers: NO_STORE });

  // ที่อยู่จัดส่งล่าสุด — ออเดอร์ของร้านนี้ + ลูกค้านี้ ที่มี shippingAddress จริง เรียงใหม่สุดก่อน
  const latest = await prisma.order.findFirst({
    where: {
      shopId: activeCtx.shopId,
      customerId: customer.id,
      shippingAddress: { not: Prisma.AnyNull },
    },
    orderBy: { createdAt: "desc" },
    select: { shippingAddress: true },
  });

  return NextResponse.json(
    { linked: true, phone: customer.phone, shippingAddress: latest?.shippingAddress ?? null },
    { headers: NO_STORE },
  );
}
