// feature 00022 — ใบปะหน้า A6 ของพัสดุใบเดียว (FR-ISHIP-030)
//
// ข้อควรระวัง: ต้อง proxy ผ่านเซิร์ฟเวอร์เสมอ
// ถ้าให้เบราว์เซอร์ยิงไป iShip เอง จะต้องส่ง token ของร้านลงไปที่หน้าเว็บ
// = ทุกคนที่เปิด devtools เห็น token แล้วเอาไปเปิดพัสดุกินเงินร้านได้

import { requireGeneralShop } from "@/lib/shop-api-guard";
import { mapIShipError, NO_STORE } from "@/lib/iship/route-helpers";
import { getLabelPdf } from "@/services/iship.service";
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
    const { pdf } = await getLabelPdf(guard.shopId, [id]);
    return new Response(pdf, {
      headers: {
        ...NO_STORE,
        "content-type": "application/pdf",
        // inline = เปิดดู/สั่งพิมพ์ได้ทันที ไม่บังคับดาวน์โหลดเป็นไฟล์
        "content-disposition": `inline; filename="label-${id}.pdf"`,
      },
    });
  } catch (err) {
    return mapIShipError(err);
  }
}
