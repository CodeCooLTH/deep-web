import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as v from "valibot";
import { authOptions } from "@/lib/auth";
import { PlaceBidSchema } from "@/lib/validations";
import { placeBid, BidError } from "@/services/auction.service";

// POST /api/auctions/[id]/bid  { amount }  (feature 00004 — buyer web, session-authed)
// เหมือน /api/app/auctions/[id]/bid (mobile) เป๊ะ ต่างแค่ auth: session แทน HMAC Bearer
// bidderId มาจาก session เท่านั้น (ห้ามรับจาก body — กัน caller ปลอมตัวเป็นคนอื่น)
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
  const body = await request.json().catch(() => null);
  if (body === null) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const parsed = v.safeParse(PlaceBidSchema, body);
  if (!parsed.success) return NextResponse.json({ error: "จำนวนเงินไม่ถูกต้อง" }, { status: 400 });

  try {
    const auction = await placeBid(id, userId, parsed.output.amount);
    return NextResponse.json(auction);
  } catch (e) {
    if (e instanceof BidError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    console.error("[POST /api/auctions/[id]/bid] placeBid failed", e);
    return NextResponse.json({ error: "วางบิดไม่สำเร็จ" }, { status: 500 });
  }
}
