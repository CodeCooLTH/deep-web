import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rejectTopUp } from "@/services/topup.service";
import { AdminTopUpActionSchema } from "@/lib/validations";

// POST /api/admin/topups/[id]/reject
// admin กด reject TopUpRequest พร้อมเหตุผลภาษาไทย — ไม่แตะ wallet

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 1. admin gate — mirror verifications/[id]/route.ts:7-8
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึง" }, { status: 403 });

  const { id } = await params;

  // 2. RC-7 self-block — โหลด TopUpRequest พร้อม shop.userId ก่อนเรียก rejectTopUp
  //    ทำไมต้องตรวจที่ route (ไม่ใช่ service): service ไม่รู้จัก HTTP session / admin identity
  //    เกินกว่า adminId param — boundary ชัดใน topup.service.ts:62-66 comment (RC-7 NOTE)
  //    mirror: verifications/[id]/route.ts:13-23 (self-review guard)
  //    แม้ reject ไม่ขยับเงิน ก็กัน conflict-of-interest + state manipulation
  const topUpRequest = await prisma.topUpRequest.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      shop: { select: { userId: true } },
    },
  });

  if (!topUpRequest) {
    return NextResponse.json({ error: "ไม่พบคำขอเติมเครดิต" }, { status: 404 });
  }

  // RC-7: admin ที่เป็นเจ้าของร้านห้าม reject top-up ตัวเอง (conflict of interest)
  // isAdmin + isShop coexist ได้ — admin-เจ้าของร้านไม่ควรจัดการคำขอตัวเอง ทั้ง approve และ reject
  if (topUpRequest.shop.userId === admin.id) {
    return NextResponse.json(
      { error: "ไม่สามารถดำเนินการคำขอของร้านตัวเองได้" },
      { status: 403 },
    );
  }

  // 3. parse body — malformed JSON → 400 ก่อนถึง valibot
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }, { status: 400 });
  }

  // validate body ด้วย AdminTopUpActionSchema (reason: string 1..500)
  // ไม่ leak valibot internals กลับ client — ส่งเฉพาะ generic Thai message
  const parsed = v.safeParse(AdminTopUpActionSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: "กรุณาระบุเหตุผลในการปฏิเสธ (1–500 ตัวอักษร)" }, { status: 400 });
  }

  const { reason } = parsed.output;

  // 4. delegate — service ทำ atomic conditional-updateMany gate (กัน TOCTOU double-reject)
  try {
    await rejectTopUp(id, admin.id, reason);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";

    if (msg === "NOT_FOUND") {
      return NextResponse.json({ error: "ไม่พบคำขอเติมเครดิต" }, { status: 404 });
    }
    if (msg === "ALREADY_PROCESSED") {
      return NextResponse.json({ error: "คำขอนี้ถูกดำเนินการไปแล้ว" }, { status: 409 });
    }

    // RC-8: ไม่ log reason/amount/PII — เฉพาะ generic error ลงใน server log
    // ไม่ส่ง stack/message กลับ client (convention: orders/route.ts 959b7cd)
    console.error("[admin/topups/reject] unexpected error");
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่" }, { status: 500 });
  }
}
