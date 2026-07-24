import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveActiveShopContext } from "@/lib/shop-context";
import { prisma } from "@/lib/prisma";
import { getOrdersByCustomer } from "@/services/order.service";
import { isShopVertical, DEFAULT_SHOP_VERTICAL } from "@/lib/lodging";

// GET /api/chat/conversations/[id]/orders — ออเดอร์ของลูกค้าที่ผูกกับเธรดนี้ แบบแบ่งหน้า (lazy load)
// feature 00018 orders tab. ownership: conversation ต้องเป็นของร้านที่ active (WHERE guard — กัน IDOR)
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
const IdParam = v.pipe(v.string(), v.uuid());

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  // ownership + resolve linked customer (logic เดียวกับ inbox/[conversationId]/page.tsx T5)
  const conv = await prisma.conversation.findFirst({
    where: { id: idc.output, shopId: activeCtx.shopId },
    select: {
      channel: true,
      buyerUserId: true,
      externalContact: { select: { customer: { select: { id: true } } } },
      shop: { select: { vertical: true } },
    },
  });
  if (!conv) return NextResponse.json({ error: "ไม่พบบทสนทนานี้" }, { status: 404 });

  let customerId: string | null = null;
  if (conv.channel !== "DEEP") {
    customerId = conv.externalContact?.customer?.id ?? null;
  } else if (conv.buyerUserId) {
    const c = await prisma.customer.findUnique({ where: { userId: conv.buyerUserId }, select: { id: true } });
    customerId = c?.id ?? null;
  }
  // ยังไม่ผูก Customer → ไม่มีประวัติออเดอร์ (ไม่ใช่ error)
  if (!customerId) return NextResponse.json({ items: [], nextCursor: null }, { headers: NO_STORE });

  const vertical = isShopVertical(conv.shop.vertical) ? conv.shop.vertical : DEFAULT_SHOP_VERTICAL;
  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
  const result = await getOrdersByCustomer(activeCtx.shopId, customerId, {
    cursor,
    take: 20,
    bookingOnly: vertical === "LODGING",
  });
  return NextResponse.json(result, { headers: NO_STORE });
}
