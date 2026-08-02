import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { approveTopUp } from "@/services/topup.service";

// POST /api/admin/topups/[id]/approve
// action ชัดจาก path — approve ไม่ต้อง parse body (spec: AdminTopUpActionSchema ใช้กับ reject เท่านั้น)

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 1. admin gate — mirror verifications/[id]/route.ts:7-8
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึง" }, { status: 403 });

  const { id } = await params;

  // 2. RC-7 self-approve block — โหลด TopUpRequest พร้อม shop.userId ก่อน approveTopUp
  //    ทำไมต้องตรวจที่ route (ไม่ใช่ service): service ไม่รู้จัก HTTP session / admin identity
  //    เกินกว่า adminId param — boundary ชัดใน topup.service.ts:62-66 comment (RC-7 NOTE)
  //    mirror: verifications/[id]/route.ts:13-23 (self-review guard)
  const topUpRequest = await prisma.topUpRequest.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      shop: { select: { userId: true } },
    },
  });

  if (!topUpRequest) {
    return NextResponse.json({ error: "ไม่พบคำขอเติมเงิน" }, { status: 404 });
  }

  // RC-7: admin ที่เป็นเจ้าของร้านห้าม approve top-up ตัวเอง
  // isAdmin + isShop coexist ได้ → admin-ที่มีร้าน top-up ฟรีได้ = financial fraud
  if (topUpRequest.shop.userId === admin.id) {
    return NextResponse.json(
      { error: "ไม่สามารถอนุมัติคำขอของร้านตัวเองได้" },
      { status: 403 },
    );
  }

  // 3. delegate — service ทำ atomic conditional-updateMany gate + creditWallet ใน $transaction
  try {
    await approveTopUp(id, admin.id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";

    if (msg === "NOT_FOUND") {
      return NextResponse.json({ error: "ไม่พบคำขอเติมเงิน" }, { status: 404 });
    }
    if (msg === "ALREADY_PROCESSED") {
      return NextResponse.json({ error: "คำขอนี้ถูกดำเนินการไปแล้ว" }, { status: 409 });
    }
    if (msg === "INVALID_AMOUNT") {
      return NextResponse.json({ error: "จำนวนเงินไม่ถูกต้อง" }, { status: 400 });
    }

    // RC-8: ไม่ log PII/amount/slip — เฉพาะ generic error ลงใน server log
    // ไม่ส่ง stack/message กลับ client (convention: orders/route.ts 959b7cd)
    console.error("[admin/topups/approve] unexpected error");
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่" }, { status: 500 });
  }
}
