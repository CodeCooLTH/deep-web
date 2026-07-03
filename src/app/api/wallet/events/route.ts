import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBalance } from "@/services/wallet.service";
import { prisma } from "@/lib/prisma";
import { requireActiveShop } from "@/lib/shop-context";

/**
 * GET /api/wallet/events — poll หา TopUpRequest ที่ approved แต่ยังไม่แจ้ง seller
 *
 * ทำไม shop derive จาก session เท่านั้น (S-C7 DAL ownership):
 * ไม่รับ shopId จาก client — กัน seller A poll event ของ seller B
 *
 * ทำไม no-shop → 200 empty (ไม่ใช่ 404):
 * seller ที่ยังไม่มีร้านควร poll ได้โดยไม่ error — แค่ไม่มี event
 * ป้องกัน poller หยุดทำงานก่อนร้านถูกสร้าง (dashboard auto-create shop ใน layout)
 *
 * RC-8: ไม่คืน slipFileId / buyerContact / shop ของคนอื่น — แค่ id, amount, reviewedAt, balance
 */
export async function GET() {
  // auth gate — ไม่มี session → 401 (client poller จะหยุด poll เมื่อเจอ 401)
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // DAL: shop derive จาก active shop context ของ session เท่านั้น — ไม่รับ shopId จาก query param (S-C7)
  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } });

  // seller ยังไม่มีร้าน → empty response (ไม่ error — poller ยังทำงานต่อ)
  if (!active) {
    return NextResponse.json({ approved: [], balance: 0 });
  }
  const shop = active.shop;

  try {
    // query ใช้ composite index [shopId, status, notifiedAt] ที่ migration 20260517040000 สร้าง
    // ไม่ select slipFileId / reviewedById / rejectedReason / buyerContact (RC-8)
    const [approvedItems, balance] = await Promise.all([
      prisma.topUpRequest.findMany({
        where: {
          shopId: shop.id,
          status: "APPROVED",
          notifiedAt: null,
        },
        select: {
          id: true,
          amount: true,
          reviewedAt: true,
        },
        orderBy: { reviewedAt: "asc" },
      }),
      getBalance(shop.id),
    ]);

    // แปลง reviewedAt เป็น ISO string — JSON serialization consistent
    const approved = approvedItems.map((item) => ({
      id: item.id,
      amount: item.amount,
      reviewedAt: item.reviewedAt?.toISOString() ?? null,
    }));

    return NextResponse.json({ approved, balance });
  } catch (e) {
    // convention 959b7cd: log server-side ไม่ leak DB error body ออก client; ไม่มี PII
    console.error("[GET /api/wallet/events] DB error shopId:", shop.id, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}

/**
 * POST /api/wallet/events (ack) — mark TopUpRequest ว่าแจ้ง seller แล้ว (fire-once)
 *
 * ทำไม conditional updateMany (S-C8 pattern / DAL ownership):
 * WHERE ครอบ { id: {in: ids}, shopId: shop.id, status: "APPROVED", notifiedAt: null }
 * - shopId: shop.id → กัน seller ack request ของ shop อื่น (cross-shop S-C7)
 * - notifiedAt: null → idempotent: ack ซ้ำ count=0 ไม่พัง
 * - status: "APPROVED" → กัน ack request ที่ถูก reject แล้วถูก approve ทีหลัง edge case
 *
 * RC-8: ไม่ log ids / PII ใน response หรือ console
 * ทำไม count=0 ไม่ error: idempotent — หลายแท็บ poll พร้อมกัน → ตัวแรก mark ได้
 * ตัวหลัง count=0 ก็ไม่พัง (acceptable MVP per spec)
 */
export async function POST(request: Request) {
  // auth gate เหมือน GET
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // parse body — ต้องมี ids: string[]
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  // inline guard: ids ต้องเป็น string[] length 1..50
  // ทำไม 50 (ไม่ใช่ unlimited): กัน payload ขนาดใหญ่ที่ผิดปกติ (attack surface)
  if (
    !body ||
    typeof body !== "object" ||
    !Array.isArray((body as any).ids) ||
    (body as any).ids.length === 0 ||
    (body as any).ids.length > 50 ||
    !(body as any).ids.every((id: unknown) => typeof id === "string")
  ) {
    return NextResponse.json(
      { error: "ids ต้องเป็น array ของ string (1–50 รายการ)" },
      { status: 400 },
    );
  }

  const ids: string[] = (body as any).ids;

  // DAL: shop derive จาก active shop context ของ session เท่านั้น (S-C7)
  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } });
  if (!active) {
    // ไม่มีร้าน → ไม่มี record ที่ต้อง ack; คืน ok=true (idempotent)
    return NextResponse.json({ ok: true, marked: 0 });
  }
  const shop = active.shop;

  try {
    // S-C8 + S-C7 conditional updateMany:
    // WHERE shopId: shop.id → กัน seller ack record ของ shop อื่น
    // WHERE notifiedAt: null → idempotent (ack ซ้ำ count=0 ไม่พัง)
    // WHERE status: "APPROVED" → defense-in-depth (ไม่ mark record ที่ไม่ควร)
    const res = await prisma.topUpRequest.updateMany({
      where: {
        id: { in: ids },
        shopId: shop.id,
        status: "APPROVED",
        notifiedAt: null,
      },
      data: {
        notifiedAt: new Date(),
      },
    });

    // RC-8: ไม่ log ids หรือ count detail ที่เป็น PII ออก console
    return NextResponse.json({ ok: true, marked: res.count });
  } catch (e) {
    console.error("[POST /api/wallet/events] DB error shopId:", shop.id, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
