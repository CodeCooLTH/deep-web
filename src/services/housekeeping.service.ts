import type { Housekeeper } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { isHousekeepingStatus } from "@/lib/lodging";
import { BOOKING_ORDER_TYPE, BookingNotFoundError, toDateOnlyString } from "@/services/booking.service";

// Lodging Vertical — Phase 3: แม่บ้าน (feature 00017)
// SSOT: docs/20 - Features/00017 - Lodging Vertical/{BRD,SRS,API}.md
//
// IMPORTANT: ทุกฟังก์ชัน scope shopId ใน where ตั้งแต่ query แรกเสมอ
// name/phone ของแม่บ้านเป็น PII ของบุคคลที่สาม — ห้ามส่งข้ามไปฝั่งผู้จอง (BR-LODG-23)

export class HousekeeperNotFoundError extends Error {
  constructor() { super("HOUSEKEEPER_NOT_FOUND"); this.name = "HousekeeperNotFoundError"; }
}
export class BookingCancelledError extends Error {
  constructor() { super("BOOKING_CANCELLED"); this.name = "BookingCancelledError"; }
}
export class InvalidHousekeepingStatusError extends Error {
  constructor() { super("INVALID_STATUS"); this.name = "InvalidHousekeepingStatusError"; }
}

export async function listHousekeepers(
  shopId: string,
  opts: { activeOnly?: boolean } = {},
): Promise<Housekeeper[]> {
  return prisma.housekeeper.findMany({
    where: { shopId, ...(opts.activeOnly ? { isActive: true } : {}) },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  });
}

export async function createHousekeeper(
  shopId: string,
  data: { name: string; phone: string },
): Promise<Housekeeper> {
  return prisma.housekeeper.create({
    data: { shopId, name: data.name, phone: normalizePhone(data.phone) ?? data.phone },
  });
}

export async function updateHousekeeper(
  shopId: string,
  id: string,
  data: { name?: string; phone?: string; isActive?: boolean },
): Promise<Housekeeper> {
  // scope shopId ก่อนเขียน — กันแก้ของร้านอื่น
  const existing = await prisma.housekeeper.findFirst({ where: { id, shopId } });
  if (!existing) throw new HousekeeperNotFoundError();
  return prisma.housekeeper.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.phone !== undefined && { phone: normalizePhone(data.phone) ?? data.phone }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  });
}

/** มอบหมาย/ยกเลิกมอบหมายแม่บ้านให้การจอง (housekeeperId=null = ยกเลิกมอบหมาย) */
export async function assignHousekeeper(
  shopId: string,
  token: string,
  housekeeperId: string | null,
) {
  const order = await prisma.order.findFirst({
    where: { publicToken: token, shopId, type: BOOKING_ORDER_TYPE },
    select: { id: true, status: true },
  });
  if (!order) throw new BookingNotFoundError();
  // มอบหมายงานให้การจองที่ยกเลิกแล้วไม่ได้ (BR-LODG-20 acceptance)
  if (order.status === "CANCELLED") throw new BookingCancelledError();

  if (housekeeperId !== null) {
    const hk = await prisma.housekeeper.findFirst({ where: { id: housekeeperId, shopId } });
    if (!hk) throw new HousekeeperNotFoundError();
  }

  return prisma.order.update({
    where: { id: order.id },
    data: {
      housekeeperId,
      // มอบหมายใหม่ → เริ่มที่ PENDING; ยกเลิกมอบหมาย → ล้างสถานะด้วย
      housekeepingStatus: housekeeperId ? "PENDING" : null,
    },
  });
}

/** อัปเดตสถานะงาน — ไม่กระทบ Order.status และไม่ trigger recalc Trust Score (BR-LODG-26) */
export async function setHousekeepingStatus(shopId: string, token: string, status: string) {
  if (!isHousekeepingStatus(status)) throw new InvalidHousekeepingStatusError();
  const order = await prisma.order.findFirst({
    where: { publicToken: token, shopId, type: BOOKING_ORDER_TYPE },
    select: { id: true },
  });
  if (!order) throw new BookingNotFoundError();
  return prisma.order.update({ where: { id: order.id }, data: { housekeepingStatus: status } });
}

/** หน้ารวมงานแม่บ้านที่ค้าง — เรียงตามวันเช็คเอาท์ (BR-LODG-21) */
export async function listHousekeepingTasks(shopId: string) {
  const orders = await prisma.order.findMany({
    where: {
      shopId,
      type: BOOKING_ORDER_TYPE,
      status: { not: "CANCELLED" },
      housekeeperId: { not: null },
    },
    include: {
      room: { select: { name: true } },
      housekeeper: { select: { name: true } },
    },
    orderBy: { checkOut: "asc" },
    take: 200,
  });
  return orders.map((o) => ({
    token: o.publicToken,
    roomName: o.room?.name ?? "—",
    housekeeperName: o.housekeeper?.name ?? null,
    checkOut: o.checkOut ? toDateOnlyString(o.checkOut) : null,
    status: o.housekeepingStatus,
  }));
}
