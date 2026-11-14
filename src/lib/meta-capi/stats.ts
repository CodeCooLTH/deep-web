// feature 00089 — ตัวเลขผลการส่ง 7 วันของเพจ (หน้า detail การ์ด "ผลการส่ง") · อ่านอย่างเดียว ผูก shopId + เพจเสมอ
// ทำไมอยู่ที่นี่ ไม่ใช่ใน meta-capi-settings.service: รอบ UI ห้ามแตะ service ที่ทดสอบแล้ว — ย้ายเข้า service ได้ภายหลังโดยไม่เปลี่ยนสัญญา
import { prisma } from "@/lib/prisma";

export type CapiWeekStats = { sent: number; failed: number; pending: number; lastSentAt: Date | null };

export async function getCapiWeekStats(shopId: string, channelId: string): Promise<CapiWeekStats> {
  const since = new Date(Date.now() - 7 * 864e5);
  const where = { shopId, dataset: { shopChannelId: channelId } };
  const [groups, last] = await Promise.all([
    prisma.metaCapiEvent.groupBy({ by: ["status"], where: { ...where, createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.metaCapiEvent.findFirst({ where: { ...where, status: "SENT" }, orderBy: { sentAt: "desc" }, select: { sentAt: true } }),
  ]);
  const n = (s: string) => groups.find((g) => g.status === s)?._count._all ?? 0;
  return { sent: n("SENT"), failed: n("FAILED"), pending: n("PENDING"), lastSentAt: last?.sentAt ?? null };
}
