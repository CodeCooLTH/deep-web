import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/orders/customers?q=<term>
// คืน list ลูกค้าที่เคยสั่งกับร้านนี้ — ใช้สำหรับ autocomplete ตอนสร้าง order ใหม่
// session-scoped: shopId ดึงจาก session userId (ห้าม trust client)
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as { id: string }).id;

  // ดึง shop จาก userId — ถ้าไม่มีร้านคืน [] (ไม่ใช่ error)
  const shop = await prisma.shop.findFirst({ where: { userId, kind: "PERSONAL" } });
  if (!shop) {
    return NextResponse.json([]);
  }

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
  const rows = await prisma.order.findMany({
    where: {
      shopId: shop.id,
      // buyerContact ต้องไม่เป็น null (ใช้ใน group key ด้านล่าง)
      buyerContact: { not: null },
    },
    select: {
      buyerContact: true,
      buyerName: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // group ใน JS โดยใช้ buyerContact เป็น key — นับจำนวน order จริงทั้งหมดต่อ contact
  // buyerName: เก็บ name แรกที่ไม่ null ที่เจอ = order ล่าสุด (most-recent non-null)
  // เพราะ rows เรียง createdAt desc แล้ว และ seller มีแนวโน้มแก้ชื่อให้ถูกใน order หลัง ๆ
  const contactMap = new Map<string, { name: string | null; orderCount: number }>();
  for (const row of rows) {
    // buyerContact ถูก filter not:null ข้างบน แต่ TypeScript ยังเห็นเป็น string|null
    if (!row.buyerContact) continue;
    const existing = contactMap.get(row.buyerContact);
    if (existing) {
      existing.orderCount += 1;
      // เก็บ name แรกที่ไม่ null เท่านั้น (แถวก่อน = ใหม่กว่า → most-recent)
      if (!existing.name && row.buyerName) {
        existing.name = row.buyerName;
      }
    } else {
      contactMap.set(row.buyerContact, {
        name: row.buyerName ?? null,
        orderCount: 1,
      });
    }
  }

  // กรอง q หลัง aggregation — contact หรือ name มี q (case-insensitive)
  const qLower = q.toLowerCase();
  const result = Array.from(contactMap.entries())
    .map(([contact, { name, orderCount }]) => ({ name, contact, orderCount }))
    .filter(
      (entry) =>
        entry.contact.toLowerCase().includes(qLower) ||
        (entry.name?.toLowerCase().includes(qLower) ?? false),
    )
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, 10);

  return NextResponse.json(result);
}
