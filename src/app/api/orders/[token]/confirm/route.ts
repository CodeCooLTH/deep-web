import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { confirmOrder, OrderOwnershipError, BookingConfirmViaShopError } from "@/services/order.service";

// POST /api/orders/[token]/confirm
//
// feature 00015 (Order Claim & Forced Login) TD-004 — เลิกใช้ SMS-unlock
// cookie (Path A) / contact-parity (Path B) ทั้งคู่ เหลือ path เดียว:
// session + ownership (Order.buyerUserId ถูก guarantee ให้ตรงกับ session
// มาก่อนแล้วโดย Access Gate ของหน้า /o/[token]) — body ที่ส่งมาถูกละเว้น
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });
  }
  const buyerUserId = (session.user as { id: string }).id;

  try {
    const order = await confirmOrder(token, buyerUserId);
    return NextResponse.json(order);
  } catch (err: unknown) {
    if (err instanceof BookingConfirmViaShopError) {
      // feature 00017 TFR-006 — ผู้จองยืนยันการจองตัวเองไม่ได้
      return NextResponse.json(
        { error: "เจ้าของที่พักจะยืนยันการจองให้หลังตรวจสลิปแล้ว" },
        { status: 403 },
      );
    }
    if (err instanceof OrderOwnershipError) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์ยืนยันคำสั่งซื้อนี้" }, { status: 403 });
    }
    // F2 security fix: ห้าม echo err.message ดิบ (order not found / invalid transition)
    console.error("[confirm]", err);
    return NextResponse.json(
      { error: "ยืนยันคำสั่งซื้อไม่สำเร็จ กรุณาตรวจสอบและลองใหม่" },
      { status: 400 },
    );
  }
}
