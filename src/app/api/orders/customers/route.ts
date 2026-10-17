import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireShopCapability } from "@/lib/shop-capability";
import { countsAsCustomerOrder } from "@/lib/customer-behavior";
import { ACTIVE_FORWARD_SHIPMENT } from "@/lib/shipment-direction";

// GET /api/orders/customers?q=<term>
// คืน list ลูกค้าที่เคยสั่งกับร้านนี้ — ใช้สำหรับ autocomplete ตอนสร้าง order ใหม่
// session-scoped: shopId ดึงจาก active shop context ของ session (ห้าม trust client)
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ดึง active shop ของ session — ถ้าไม่มีร้านคืน [] (ไม่ใช่ error)
  const gate = await requireShopCapability(session, "C1");
  if (!gate.ok) return gate.response;
  const active = gate.active;
  const shop = active.shop;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();

  // q สั้นกว่า 2 ตัวอักษร → คืน [] เพื่อป้องกัน query ที่ match ผลมากเกินไป
  if (q.length < 2) {
    return NextResponse.json([]);
  }

  // ดึง order ทั้งหมดของ shop ที่มี buyerContact ไม่ null — ไม่กรองด้วย q ที่นี่
  // เพื่อให้ orderCount สะท้อน "จำนวน order จริงทั้งหมด" ของแต่ละ contact (spec line 286)
  // การกรอง q ทำหลัง aggregation ใน JS แทน — ป้องกัน orderCount นับเฉพาะ order ที่ match q
  // orderBy createdAt desc — แถวแรกของแต่ละ contact = order ล่าสุด
  // ทำให้ tie-break ชื่อเป็น deterministic (ไม่พึ่ง DB iteration order)
  // รอบ 1: ดึงเบา ๆ (ไม่มี shipments) เพื่อหา contact ที่ตรง q — ชื่อใช้ "ล่าสุดที่ไม่ null" ของทุกใบ
  const rows = await prisma.order.findMany({
    where: {
      shopId: shop.id,
      // buyerContact ต้องไม่เป็น null (ใช้ใน group key ด้านล่าง)
      buyerContact: { not: null },
    },
    select: { buyerContact: true, buyerName: true },
    orderBy: { createdAt: "desc" },
  });

  const nameOf = new Map<string, string | null>();
  for (const row of rows) {
    if (!row.buyerContact) continue;
    // เก็บ name แรกที่ไม่ null เท่านั้น (แถวก่อน = ใหม่กว่า → most-recent)
    if (!nameOf.has(row.buyerContact) || (!nameOf.get(row.buyerContact) && row.buyerName)) {
      nameOf.set(row.buyerContact, row.buyerName ?? nameOf.get(row.buyerContact) ?? null);
    }
  }

  // กรอง q ก่อน — contact หรือ name มี q (case-insensitive)
  const qLower = q.toLowerCase();
  const matched = [...nameOf.entries()].filter(
    ([contact, name]) =>
      contact.toLowerCase().includes(qLower) || (name?.toLowerCase().includes(qLower) ?? false),
  );
  if (matched.length === 0) return NextResponse.json([]);

  // รอบ 2: หลักฐานรายใบ (พร้อมพัสดุ) เฉพาะ contact ที่ผ่าน q — query เดียว ไม่มี query ต่อแถว
  // orderCount = ตัวนับกลาง countsAsCustomerOrder (00078 S-5) ไม่ใช่ทุกแถว
  const evidence = await prisma.order.findMany({
    where: { shopId: shop.id, buyerContact: { in: matched.map(([c]) => c) } },
    select: {
      buyerContact: true,
      status: true,
      cancelInitiator: true,
      cancelReason: true,
      appointmentStatus: true,
      shipments: {
        where: ACTIVE_FORWARD_SHIPMENT,
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { carrierStatus: true },
      },
    },
  });
  const countOf = new Map<string, number>();
  for (const row of evidence) {
    if (!row.buyerContact) continue;
    const ok = countsAsCustomerOrder({
      status: row.status,
      cancelInitiator: row.cancelInitiator ?? null,
      cancelReason: row.cancelReason ?? null,
      activeShipmentCarrierStatus: row.shipments[0]?.carrierStatus ?? null,
      appointmentStatus: row.appointmentStatus ?? null,
    });
    countOf.set(row.buyerContact, (countOf.get(row.buyerContact) ?? 0) + (ok ? 1 : 0));
  }

  const result = matched
    .map(([contact, name]) => ({ name, contact, orderCount: countOf.get(contact) ?? 0 }))
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, 10);

  return NextResponse.json(result);
}
