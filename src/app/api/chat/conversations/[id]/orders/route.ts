import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveConversationShopId } from "@/lib/chat-scope";
import { prisma } from "@/lib/prisma";
import { getThreadPanelOrders } from "@/services/order.service";
import { resolveThreadOrderFilter } from "@/lib/chat-thread-orders";
import { isShopVertical, DEFAULT_SHOP_VERTICAL } from "@/lib/lodging";
import { sessionUserId } from "@/lib/session-user";

// GET /api/chat/conversations/[id]/orders — ออเดอร์ของลูกค้าที่ผูกกับเธรดนี้ แบบแบ่งหน้า (lazy load)
// feature 00018 orders tab. ownership: conversation ต้องเป็นของร้านที่ active (WHERE guard — กัน IDOR)
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
const IdParam = v.pipe(v.string(), v.uuid());

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!session?.user || !userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const idc = v.safeParse(IdParam, id);
  if (!idc.success) return NextResponse.json({ error: "รหัสบทสนทนาไม่ถูกต้อง" }, { status: 400 });

  // feature 00037 — ร้านมาจาก "เธรด" ไม่ใช่ร้านที่ active (กล่องแชทรวมทำให้สองอย่างนี้ต่างกันได้)
  const resolved = await resolveConversationShopId(
    { user: { id: userId, activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null } },
    idc.output,
  );
  if (!resolved) return NextResponse.json({ error: "ไม่พบบทสนทนานี้" }, { status: 404 });
  const activeCtx = { shopId: resolved.shopId };

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
  // เกณฑ์ "ใบไหนเป็นของห้องนี้" — ลูกค้าที่ผูกอยู่ **หรือ** ใบที่ถูกเปิดจากห้องนี้ (2026-09-05)
  // ต้องตรงกับ SSR ใน inbox/[conversationId]/page.tsx เป๊ะ ไม่งั้นใบที่ 21 ขึ้นไปจะคนละชุดกับ 20 ใบแรก
  const scope = resolveThreadOrderFilter({ customerId, conversationId: idc.output });
  // ไม่มีทั้งลูกค้าและห้อง → ไม่มีประวัติออเดอร์ (ไม่ใช่ error) — 🛑 ห้ามยิงคิวรีต่อโดยไม่มีเงื่อนไข
  if (!scope) return NextResponse.json({ items: [], nextCursor: null }, { headers: NO_STORE });

  const vertical = isShopVertical(conv.shop.vertical) ? conv.shop.vertical : DEFAULT_SHOP_VERTICAL;
  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
  const result = await getThreadPanelOrders(activeCtx.shopId, scope, {
    cursor,
    take: 20,
    bookingOnly: vertical === "LODGING",
  });
  return NextResponse.json(result, { headers: NO_STORE });
}
