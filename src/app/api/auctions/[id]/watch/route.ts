import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/auctions/[id]/watch — เพิ่มเข้ารายการติดตาม (feature 00004 — buyer web, session-authed)
// เหมือน /api/app/auctions/[id]/watch (mobile) เป๊ะ ต่างแค่ auth: session แทน HMAC Bearer
// upsert กันกด watch ซ้ำชน @@unique([userId, auctionId])
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "กรุณาเข้าสู่ระบบก่อนใช้งาน" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;

  const { id } = await params;
  const auction = await prisma.auction.findUnique({ where: { id }, select: { id: true } });
  if (!auction) return NextResponse.json({ error: "ไม่พบรายการประมูล" }, { status: 404 });

  await prisma.watchList.upsert({
    where: { userId_auctionId: { userId, auctionId: id } },
    create: { userId, auctionId: id },
    update: {},
  });
  return NextResponse.json({ watching: true });
}

// DELETE /api/auctions/[id]/watch — เอาออกจากรายการติดตาม
// idempotent — ไม่เคย watch อยู่ก็ตอบ 200 { watching:false } เหมือนกัน (DELETE ควร idempotent ตาม REST semantics)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "กรุณาเข้าสู่ระบบก่อนใช้งาน" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;

  const { id } = await params;
  await prisma.watchList.deleteMany({ where: { userId, auctionId: id } });
  return NextResponse.json({ watching: false });
}
