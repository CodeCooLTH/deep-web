import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as v from "valibot";
import { authOptions } from "@/lib/auth";
import { ConfirmOrderSchema } from "@/lib/validations";
import { cancelOrder } from "@/services/order.service";
import { prisma } from "@/lib/prisma";

// POST /api/orders/[token]/cancel
//
// Access model (Task 3 hardening — safepay-security MEDIUM on 230ad2b):
// ─────────────────────────────────────────────────────────────────────
// Seller  = session เป็น owner ของ shop นั้น → ยืนยันตัวตนผ่าน session แล้ว → ไม่ต้องการ phone
// Buyer   = ทุกกรณีอื่น (guest หรือ logged-in non-owner)
//           → ต้องส่ง contact (phone) ตรงกับ order.buyerContact (phone parity กับ confirmOrder)
//           → ถ้า order.buyerContact ยังว่าง (buyer ยังไม่เคย unlock/confirm) → ห้าม cancel
//             เพราะ CANCELLED ไม่มีการ reverse ใน MVP; เฉพาะ seller cancel ได้
// Route เป็น public (ไม่ 401/403 สำหรับ "ไม่มี session") — guest buyer ที่ phone ตรงยังใช้ได้
// State machine: assertTransition ใน cancelOrder ปฏิเสธ cancel หลัง CONFIRMED อัตโนมัติ
// cancelInitiator ถูก derive จาก session เสมอ — ไม่รับจาก body (ป้องกัน spoofing)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // โหลด order ก่อน session check เพื่อป้องกัน timing leak
  const order = await prisma.order.findUnique({
    where: { publicToken: token },
    include: { shop: true },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  // session optional — buyer อาจเป็น guest (ไม่ 401 ถ้าไม่มี session)
  const session = await getServerSession(authOptions);
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id;

  // isOwner คำนวณจาก session เท่านั้น — body ไม่มีผลต่อค่านี้ (ป้องกัน body spoofing)
  const isOwner = !!sessionUserId && sessionUserId === order.shop.userId;

  let initiator: "seller" | "buyer";

  if (isOwner) {
    // Seller path: authenticated session owner → ไม่ต้องการ phone
    initiator = "seller";
  } else {
    // Buyer path: ต้องมี phone parity กับ confirmOrder
    // parse body ด้วย schema เดียวกับ confirm route (ConfirmOrderSchema — field: contact)
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const parsed = v.safeParse(ConfirmOrderSchema, body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const { contact } = parsed.output;

    // ถ้า order.buyerContact ยังว่าง → buyer ยังไม่เคย unlock order นี้เลย
    // CANCELLED ไม่มีการย้อนกลับใน MVP → ห้ามให้ guest ที่ไม่รู้จักยกเลิก
    // เฉพาะ seller (session owner) เท่านั้นที่ cancel order ที่ยังไม่มี buyer ได้
    if (!order.buyerContact) {
      return NextResponse.json(
        { error: "ไม่สามารถยกเลิกได้ กรุณาติดต่อผู้ขาย" },
        { status: 403 },
      );
    }

    // phone parity check — mirror confirmOrder (order.service.ts line 79-81)
    // ใช้ comparison เดียวกัน: order.buyerContact !== contact
    if (order.buyerContact !== contact) {
      return NextResponse.json(
        { error: "เบอร์ไม่ตรงกับคำสั่งซื้อนี้" },
        { status: 400 },
      );
    }

    initiator = "buyer";
  }

  try {
    // cancelOrder → assertTransition → throw ถ้า cancel-after-CONFIRMED
    const updated = await cancelOrder(token, initiator);
    return NextResponse.json(updated);
  } catch (err: unknown) {
    // assertTransition throw → 400 (invalid state transition, เช่น cancel-after-CONFIRMED)
    const message = err instanceof Error ? err.message : "Cancel failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
