import { NextRequest, NextResponse } from "next/server";
import { cancelAuction } from "@/services/auction.service";
import { mapAuctionError, requireSellerShop } from "../../_shared";

// POST /api/seller/auctions/[id]/cancel — ยกเลิกประมูล (TFR-003)
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSellerShop();
  if ("response" in auth) return auth.response;
  const { userId } = auth;
  const { id } = await params;

  try {
    const result = await cancelAuction(id, userId);
    return NextResponse.json(result);
  } catch (e) {
    return mapAuctionError(e, "POST /api/seller/auctions/[id]/cancel");
  }
}
