import { prisma } from "@/lib/prisma";
import { pickAdAttribution, type OrderAdAttribution } from "@/lib/ad-attribution";

/**
 * 00091 — หาแอดล่าสุดที่ห้องแชทนี้คลิก ณ เวลาอ้างอิง (ผูก shop ผ่านห้อง — ห้องร้านอื่นไม่เข้า)
 * ใช้ร่วมกันระหว่างตอนสร้างคำสั่งซื้อกับสคริปต์เติมย้อนหลัง เพื่อให้กฎเป็นตัวเดียว (BR-ATT-01)
 */
export async function findAdAttribution(
  shopId: string,
  conversationId: string,
  referenceTime: Date,
): Promise<OrderAdAttribution | null> {
  const rows = await prisma.conversationAdReferral.findMany({
    where: {
      conversationId,
      conversation: { shopId },
      source: "ADS",
      adId: { not: null },
      receivedAt: { lte: referenceTime },
    },
    orderBy: { receivedAt: "desc" },
    take: 1, // ใช้ index (conversationId, receivedAt) — 1 query ต่อการสร้างคำสั่งซื้อ (BRD §5)
    select: { source: true, adId: true, adTitle: true, photoFileId: true, receivedAt: true },
  });
  return pickAdAttribution(rows, referenceTime);
}

/**
 * บันทึกแอดลงคำสั่งซื้อ หลัง commit — เขียนเฉพาะแถวที่ adId ยังว่าง (BR-ATT-02/04)
 * 🛑 ไม่ throw (BR-ATT-03): หาแอดล้ม = คำสั่งซื้อยังสร้างสำเร็จ ช่องแอดว่าง
 */
export async function stampOrderAdAttribution(
  order: { id: string; shopId: string; conversationId: string | null; isDryRun: boolean },
  referenceTime: Date,
): Promise<void> {
  try {
    if (order.isDryRun || !order.conversationId) return;
    const found = await findAdAttribution(order.shopId, order.conversationId, referenceTime);
    if (!found) return;
    await prisma.order.updateMany({
      where: { id: order.id, shopId: order.shopId, adId: null },
      data: found,
    });
  } catch (e) {
    console.error("[ad-attribution] stamp failed", order.id, e);
  }
}

export interface BackfillResult { scanned: number; matched: number; written: number }

/**
 * 00091 FR-005 — เติมย้อนหลัง: เฉพาะใบที่ adId ว่าง + ผูกห้อง + ไม่ใช่ร่าง/ทดสอบ (BR-ATT-04)
 * เวลาอ้างอิง = createdAt ของใบนั้น · รันซ้ำได้ (ใบที่มีค่าแล้วไม่เข้า where) · apply=false = นับอย่างเดียว
 * `shopId` ไว้จำกัดขอบเขต (เทส/รันทีละร้าน)
 */
export async function backfillOrderAdAttribution(opts: { apply: boolean; shopId?: string; batchSize?: number }): Promise<BackfillResult> {
  const batch = opts.batchSize ?? 500;
  const res: BackfillResult = { scanned: 0, matched: 0, written: 0 };
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.order.findMany({
      where: {
        adId: null,
        conversationId: { not: null },
        status: { not: "DRAFTED" },
        isDryRun: false,
        ...(opts.shopId ? { shopId: opts.shopId } : {}),
      },
      orderBy: { id: "asc" },
      take: batch,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, shopId: true, conversationId: true, createdAt: true },
    });
    if (rows.length === 0) break;
    for (const o of rows) {
      res.scanned++;
      const found = await findAdAttribution(o.shopId, o.conversationId!, o.createdAt);
      if (!found) continue;
      res.matched++;
      if (opts.apply) {
        const r = await prisma.order.updateMany({ where: { id: o.id, adId: null }, data: found });
        res.written += r.count;
      }
    }
    cursor = rows[rows.length - 1].id;
  }
  return res;
}
