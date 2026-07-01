import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getShopByUserId } from "@/services/shop.service";
import {
  AuctionOpError,
  AuctionValidationError,
  BelowReserveConfirmError,
  BidError,
} from "@/services/auction.service";

// shared helper สำหรับ 7 endpoint ใต้ src/app/api/seller/auctions/**
// (feature 00002 Seller Auction, Batch C task #6)

/**
 * resolve seller session + shop จาก session เท่านั้น (ห้ามรับ shopId/userId จาก body/param — FR-AUC-01-AC-09)
 * คืน { response } ถ้าไม่ผ่าน guard (401/404) — caller เช็ค `if ('response' in auth) return auth.response`
 * ตาม pattern requireAppUser (`src/lib/app-auth.ts`)
 */
export async function requireSellerShop() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return {
      response: NextResponse.json({ error: "กรุณาเข้าสู่ระบบก่อนใช้งาน" }, { status: 401 }),
    } as const;
  }
  const userId = (session.user as { id: string }).id;

  const shop = await getShopByUserId(userId);
  if (!shop) {
    return {
      response: NextResponse.json(
        { error: "ไม่พบร้านค้า กรุณาเปิดร้านก่อนใช้งาน" },
        { status: 404 },
      ),
    } as const;
  }

  return { userId, shop } as const;
}

/**
 * map error จาก auction.service → HTTP response ตาม contract ที่ Controller ล็อกไว้ (Batch B/C):
 *  - BidError / AuctionOpError → {error} status ตาม e.status
 *  - BelowReserveConfirmError → 409 {error, code, currentPrice, hasReserve}
 *  - AuctionValidationError → 400 {error}
 *  - unhandled → console.error + 500 generic (ไม่ leak stack)
 */
export function mapAuctionError(e: unknown, logTag: string): NextResponse {
  if (e instanceof BelowReserveConfirmError) {
    return NextResponse.json(
      { error: e.message, code: e.code, currentPrice: e.currentPrice, hasReserve: e.hasReserve },
      { status: e.status },
    );
  }
  if (e instanceof BidError || e instanceof AuctionOpError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  if (e instanceof AuctionValidationError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error(`[${logTag}]`, e);
  return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่" }, { status: 500 });
}
