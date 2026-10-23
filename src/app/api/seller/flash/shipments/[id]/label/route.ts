// feature 00084 — ใบปะหน้า Flash (API.md §4.16) · proxy ผ่านเซิร์ฟเวอร์เสมอ (key ห้ามถึงเบราว์เซอร์)
// service คืน Buffer เฉพาะ %PDF จริง — ไม่ใช่ PDF = โยน error → ตอบ JSON ไม่ส่งไฟล์เสีย
import type { NextRequest } from "next/server";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { mapFlashError } from "@/lib/flash/route-helpers";
import { readIShipShopIdFromQuery } from "@/lib/iship/request-shop";
import { NO_STORE } from "@/lib/iship/route-helpers";
import { getFlashLabelPdf } from "@/services/flash-ops.service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireGeneralShop({ cap: "S1", shopId: readIShipShopIdFromQuery(request) });
  if ("error" in guard) return guard.error;

  const { id } = await params;
  try {
    const pdf = await getFlashLabelPdf(guard.shopId, id);
    return new Response(new Uint8Array(pdf), {
      headers: {
        ...NO_STORE,
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="label-${id}.pdf"`,
      },
    });
  } catch (err) {
    return mapFlashError(err);
  }
}
