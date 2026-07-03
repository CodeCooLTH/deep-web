import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireActiveShop } from "@/lib/shop-context";
import {
  AuctionOpError,
  AuctionValidationError,
  BelowReserveConfirmError,
  BidError,
} from "@/services/auction.service";

// shared helper สำหรับ 7 endpoint ใต้ src/app/api/seller/auctions/**
// (feature 00002 Seller Auction, Batch C task #6; wire active-shop-context Phase 4 00008 P4-3)

/**
 * resolve seller session + active shop (Personal หรือ Business ตาม session.activeShopId — membership
 * guard ได้ฟรีจาก requireActiveShop) จาก session เท่านั้น (ห้ามรับ shopId/userId จาก body/param —
 * FR-AUC-01-AC-09). คืน { response } ถ้าไม่ผ่าน guard (401/404/403) —
 * caller เช็ค `if ('response' in auth) return auth.response` ตาม pattern requireAppUser (`src/lib/app-auth.ts`)
 *
 * opts.mutate = true → gate เพิ่ม: Business ที่ package lock (read-only) ห้ามสร้าง/แก้ไขประมูล → 403
 * (ใช้เฉพาะ POST /auctions สร้าง + PATCH /auctions/[id] แก้ไข — endpoint อื่น (list/detail/cancel/
 * publish/end-early) เป็น read หรือ lifecycle-transition ของประมูลที่มีอยู่แล้ว ไม่ใช่ "สร้าง/แก้ประมูล" ใหม่)
 */
export async function requireSellerShop(opts?: { mutate?: boolean }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return {
      response: NextResponse.json({ error: "กรุณาเข้าสู่ระบบก่อนใช้งาน" }, { status: 401 }),
    } as const;
  }
  const userId = (session.user as { id: string }).id;

  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  );
  if (!active) {
    return {
      response: NextResponse.json(
        { error: "ไม่พบร้านค้า กรุณาเปิดร้านก่อนใช้งาน" },
        { status: 404 },
      ),
    } as const;
  }

  if (opts?.mutate && active.locked) {
    return {
      response: NextResponse.json(
        { error: "ร้านค้าถูกล็อกแพ็กเกจ ไม่สามารถสร้าง/แก้ไขประมูลได้" },
        { status: 403 },
      ),
    } as const;
  }

  return { userId, shop: active.shop, locked: active.locked } as const;
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
