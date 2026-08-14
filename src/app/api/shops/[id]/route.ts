import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { updateShop } from "@/services/shop.service";
import { prisma } from "@/lib/prisma";
import { canAccessShop } from "@/lib/shop-context";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const shop = await prisma.shop.findUnique({ where: { id } });
  // access guard — owner (PERSONAL หรือ BUSINESS owner) หรือ admin/staff ของร้านนี้ แก้ได้
  //
  // 🛑 bug fix 2026-08-01: เดิมใช้ isShopMember() อย่างเดียว ซึ่งดูแค่ตาราง ShopMember
  // คอมเมนต์เดิมอ้างว่า "Personal shop: owner เป็น ShopMember(OWNER) ของตัวเองอยู่แล้วจาก backfill"
  // แต่ backfill นั้นครอบเฉพาะร้านที่มีอยู่ ณ ตอนรัน — ร้าน PERSONAL ที่สร้างหลังจากนั้นไม่มีแถว
  // ShopMember เลย (ensurePersonalShop / shop-info / auth.ts / createShop สร้างแต่แถว Shop)
  // ผลคือ PATCH คืน 404 ทุกครั้ง = แก้ชื่อร้าน/หมวดหมู่/ที่อยู่/โลโก้/ภาพปก ไม่ได้เลยสักอย่าง
  // ตรวจจริง: ร้าน PERSONAL ทั้ง 3 ร้านในระบบ ไม่มี ShopMember สักร้าน และ updatedAt ยังเท่ากับ
  // createdAt ทุกร้าน (ไม่เคยอัปเดตสำเร็จ) — ผู้ใช้เห็นแค่ toast "บันทึกไม่สำเร็จ กรุณาลองใหม่"
  // ซึ่งดูเหมือนเน็ตมีปัญหาชั่วคราว จึงไม่มีใครรายงาน
  //
  // canAccessShop() = owner-by-userId OR member — helper ตัวเดียวกับที่ฟีเจอร์แชทใช้
  // (assertParticipant ใน chat.service) ซึ่งเคยเจอบั๊กคลาสเดียวกันมาก่อนและแก้ด้วยวิธีนี้แล้ว
  if (!shop || !(await canAccessShop(id, (session.user as any).id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  try {
    const updated = await updateShop(id, body);
    return NextResponse.json(updated);
  } catch (e) {
    /**
     * error ใหม่จาก updateShop (2026-08-14) ต้องมี route-catch เสมอ ไม่งั้นค่าพิกัดที่ผิดจะ
     * กลายเป็น 500 ที่ client อ่านเหตุผลไม่ได้ แล้วผู้ใช้จะเห็นแค่ "บันทึกไม่สำเร็จ ลองใหม่"
     * ซึ่งเชิญให้กดวนสิ่งที่ไม่มีทางผ่าน (docs/conventions/service-error-route-mapping.md)
     */
    const code = e instanceof Error ? e.message : "";
    if (code === "GEO_PAIR_REQUIRED" || code === "GEO_OUT_OF_RANGE") {
      return NextResponse.json({ error: code }, { status: 400 });
    }
    throw e;
  }
}
