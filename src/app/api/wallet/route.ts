import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBalance, getTransactions } from "@/services/wallet.service";
import { requireActiveShop } from "@/lib/shop-context";

/**
 * GET /api/wallet — ดึง balance + transactions ของ seller ที่ login อยู่
 *
 * ทำไมไม่รับ shopId จาก query param:
 * DAL ownership (S-C7) — shop ต้อง derive จาก session userId เสมอ
 * เพื่อกันกรณี seller A ส่ง shopId ของ seller B มาดูข้อมูล wallet คนอื่น
 *
 * ทำไม no-shop → 200 {balance:0, transactions:[]} ไม่ใช่ 404:
 * UI wallet page ของ seller ที่ยังไม่มีร้าน ควร render ได้โดยไม่ error —
 * แสดง balance=0, รายการว่าง. 404 ทำให้ UI ต้องจัดการ error state พิเศษโดยไม่จำเป็น
 *
 * ทำไม getBalance (read-only) ไม่ใช่ getOrCreateWallet:
 * GET ต้องเป็น read-only (idempotent) — ไม่ควร side-effect สร้าง wallet ใหม่
 * getBalance คืน 0 เองถ้ายังไม่มี wallet ซึ่งครอบ case นี้แล้ว
 */
export async function GET() {
  // auth gate — session ต้องมีก่อน
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // DAL: shop derive จาก active shop context ของ session เท่านั้น — ไม่รับ shopId จาก client
  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } });

  // seller ยังไม่มีร้าน → คืน wallet ว่าง (ไม่ 404 เพื่อให้ UI render ได้)
  if (!active) {
    return NextResponse.json({ balance: 0, transactions: [] });
  }
  const shop = active.shop;

  // try/catch ตาม convention orders/route.ts (959b7cd) — ถ้า Prisma throw
  // (connection drop / timeout) ต้องไม่ปล่อย unhandled rejection (dev-mode
  // อาจ leak DB error/connection string ใน body); log server-side ไม่มี PII
  try {
    // อ่าน balance + transactions แบบ parallel — ทั้งคู่ read-only ไม่มี dependency
    const [balance, transactions] = await Promise.all([
      getBalance(shop.id),
      getTransactions(shop.id, 50),
    ]);
    return NextResponse.json({ balance, transactions });
  } catch (e) {
    console.error("[GET /api/wallet] DB error", e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
