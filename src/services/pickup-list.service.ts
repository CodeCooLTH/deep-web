/**
 * รายการคำขอเรียกรถของร้าน (feature 00087) — อ่านจาก ShipmentPickup อย่างเดียว ไม่ยิงขนส่ง (BRD BR-2)
 * สถานะเปลี่ยนจาก webhook ของ iShip/Flash ที่มีอยู่แล้ว
 */
import { prisma } from "@/lib/prisma";
import { pickupFilterStatuses, type PickupFilterKey } from "@/lib/shipping/pickup-list-view";

export const PICKUP_PAGE_SIZE = 20;

export type PickupListRow = {
  id: string;
  provider: string;
  courierCode: string;
  ticketId: string | null;
  parcelCount: number;
  status: string;
  staffName: string | null;
  staffPhone: string | null;
  timeoutAtText: string | null;
  isDryRun: boolean;
  lastErrorMessage: string | null;
  createdByName: string | null;
  createdAt: string;
};

export async function listShopPickups(
  shopId: string,
  opts: { filter: PickupFilterKey; page: number },
): Promise<{ rows: PickupListRow[]; total: number; page: number; pageSize: number }> {
  const statuses = pickupFilterStatuses(opts.filter);
  const where = { shopId, ...(statuses ? { status: { in: statuses } } : {}) };
  const page = Math.max(1, Math.floor(opts.page) || 1);

  const [total, rows] = await Promise.all([
    prisma.shipmentPickup.count({ where }),
    prisma.shipmentPickup.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PICKUP_PAGE_SIZE,
      take: PICKUP_PAGE_SIZE,
    }),
  ]);

  const userIds = [...new Set(rows.map((r) => r.createdByUserId))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, u.displayName]));

  return {
    total,
    page,
    pageSize: PICKUP_PAGE_SIZE,
    rows: rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      courierCode: r.courierCode,
      ticketId: r.currentTicketPickupId ?? r.ticketPickupId,
      parcelCount: r.parcelCount,
      status: r.status,
      staffName: r.staffName,
      staffPhone: r.staffPhone,
      timeoutAtText: r.timeoutAtText,
      isDryRun: r.isDryRun,
      lastErrorMessage: r.lastErrorMessage,
      createdByName: nameOf.get(r.createdByUserId) ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
