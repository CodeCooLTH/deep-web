import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toggleBidReaction, AuctionOpError } from "@/services/auction.service";
import { sessionUserId } from "@/lib/session-user";

// POST /api/auctions/[id]/react — toggle "ถูกใจ" bid (feature 00005, FR-REACT-01/02)
// body: { bidId }. login required (FR-REACT-01-AC-02); rate-limit ใช้ guardApi กลาง (proxy.ts) อยู่แล้ว
// [id] = auctionId ใช้ verify ว่า bid สังกัด auction นี้จริง (กันยิง bidId ข้าม auction)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!session?.user || !userId) {
    return NextResponse.json({ error: "กรุณาเข้าสู่ระบบก่อนใช้งาน" }, { status: 401 });
  }

  const { id } = await params;

  let bidId: string;
  try {
    const body = await request.json();
    bidId = typeof body?.bidId === "string" ? body.bidId : "";
  } catch {
    bidId = "";
  }
  if (!bidId) {
    return NextResponse.json({ error: "ต้องระบุ bidId" }, { status: 400 });
  }

  // verify bid สังกัด auction [id] จริง (กัน react bid ข้าม auction context)
  const bid = await prisma.bid.findFirst({ where: { id: bidId, auctionId: id }, select: { id: true } });
  if (!bid) {
    return NextResponse.json({ error: "ไม่พบรายการเสนอราคาใน auction นี้" }, { status: 404 });
  }

  try {
    const result = await toggleBidReaction(bidId, userId);
    return NextResponse.json(result); // { reacted, reactionCount }
  } catch (e) {
    if (e instanceof AuctionOpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "ทำรายการไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  }
}
