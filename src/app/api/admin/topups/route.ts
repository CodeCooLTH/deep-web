import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getPendingTopUps } from "@/services/topup.service";

/**
 * GET /api/admin/topups — ดึงคิว TopUpRequest ที่ PENDING เพื่อ admin review
 *
 * Admin gate: ใช้ requireAdmin() เหมือน src/app/api/admin/verifications/[id]/route.ts
 * lines 7-8 — session + isAdmin flag; คืน null ถ้าไม่ผ่าน → 403
 *
 * Payload shape: PendingTopUp[] (TopUpRequest + shop{id,shopName})
 * — service select แค่ id/shopName (ไม่รวม user, buyerPhone หรือ PII อื่น)
 * — field reviewedById ที่มีใน TopUpRequest = id ของ admin คนอื่น (ไม่ใช่ PII ของ
 *   buyer/seller ที่ถูก expose เกิน); status PENDING หมายความว่า reviewedById = null
 *   อยู่แล้วสำหรับคิวนี้ แต่ Prisma type รวมไว้ → ok ไม่ต้อง strip
 *
 * slipFileId: คืนมาพร้อม TopUpRequest เพื่อให้ admin client load รูป slip
 * ผ่าน /api/files/[fileId] (ไม่ embed binary ใน payload นี้). หมายเหตุความปลอดภัย:
 * /api/files/[fileId] gate เฉพาะ fileId ที่อยู่ใน VerificationRecord.documents
 * (KYC map) — slipFileId ของ TopUpRequest จะถูก gate เพิ่ม (admin-or-shop-owner)
 * ใน rework เดียวกับ T9 ให้ตรง spec AR-3 "admin-only viewer". endpoint นี้คืนแค่
 * slipFileId (UUID ref) ให้ admin ที่ผ่าน requireAdmin แล้ว — ไม่ได้ทำให้ gap แย่ลง
 *
 * RC-8: ไม่ log PII — console.error log เฉพาะ "[GET /api/admin/topups] DB error"
 * ไม่ log shopId/slipFileId/amount ที่อาจมีข้อมูลธุรกรรม
 */
export async function GET() {
  // admin gate — mirror verifications/[id]/route.ts:7-8
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึง" }, { status: 403 });
  }

  // ดึงคิว PENDING FIFO — delegate ทั้งหมดให้ service (DAL ownership)
  try {
    const topups = await getPendingTopUps();
    return NextResponse.json({ topups });
  } catch (e) {
    // RC-8: log ไม่มี PII — ไม่ include e.message ใน response เพื่อกัน stack leak
    console.error("[GET /api/admin/topups] DB error", e);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" },
      { status: 500 },
    );
  }
}
