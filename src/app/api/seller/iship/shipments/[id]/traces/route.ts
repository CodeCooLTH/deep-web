// feature 00022 — ประวัติการเดินทางของพัสดุ (FR-ISHIP-040)
// โหลดเมื่อผู้ใช้เปิดดูเท่านั้น ไม่ prefetch ทุกออเดอร์ (NFR — ค่าใช้จ่ายโตตามจำนวนออเดอร์)

import { requireGeneralShop } from "@/lib/shop-api-guard";
import { ishipJson, mapIShipError } from "@/lib/iship/route-helpers";
import { getTraces } from "@/services/iship.service";
import { readIShipShopIdFromQuery } from "@/lib/iship/request-shop";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireGeneralShop({ shopId: readIShipShopIdFromQuery(request) });
  if ("error" in guard) return guard.error;

  const { id } = await params;
  try {
    const { events, carrier } = await getTraces(guard.shopId, id);
    /**
     * 🛑 คืน `carrier` มาด้วยเสมอ ห้ามกลับไปคืนเป็น array เปล่า ๆ อีก
     *
     * การเรียกครั้งนี้ยิง `get_order` แล้วอาจ *เขียนสถานะใหม่ลงฐาน* ระหว่างทาง — ถ้าไม่ส่ง
     * ค่าใหม่กลับไป หน้าจอที่เพิ่งสั่งให้ทำแบบนั้นจะเป็นที่สุดท้ายที่รู้ (ต้องรีโหลดถึงเห็น)
     * ซึ่งคือบั๊กที่ user เจอบน prod 2026-08-20: รายการเดินทางขึ้น "ส่งคืนสำเร็จ" แต่หัวการ์ด
     * เหนือมัน 3 เซนติเมตรยังเขียนว่า "กำลังจัดส่ง" อยู่ 8 วัน
     */
    return ishipJson({
      events: events.map((e) => ({
        status: e.status,
        statusText: e.statusText,
        statusDesc: e.statusDesc,
        location: e.location,
        occurredAt: e.occurredAt,
      })),
      carrier,
    });
  } catch (err) {
    return mapIShipError(err);
  }
}
