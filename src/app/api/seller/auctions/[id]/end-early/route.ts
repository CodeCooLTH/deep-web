import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { EndEarlyAuctionSchema } from "@/lib/validations";
import { endEarlyAuction } from "@/services/auction.service";
import { mapAuctionError, requireSellerShop } from "../../_shared";

// POST /api/seller/auctions/[id]/end-early — จบประมูลก่อนเวลา (TFR-012)
// body ว่างเป็น valid (confirmBelowReserve optional) — ต้องส่ง confirmBelowReserve:true ซ้ำ
// เมื่อได้ 409 BELOW_RESERVE_CONFIRM_REQUIRED มาก่อน
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSellerShop();
  if ("response" in auth) return auth.response;
  const { userId } = auth;
  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  const parsed = v.safeParse(EndEarlyAuctionSchema, body);
  if (!parsed.success) {
    const firstIssue = parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  try {
    const result = await endEarlyAuction(id, userId, parsed.output);
    return NextResponse.json(result);
  } catch (e) {
    return mapAuctionError(e, "POST /api/seller/auctions/[id]/end-early");
  }
}
