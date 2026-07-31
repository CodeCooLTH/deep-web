import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isExclusionViolation } from "@/lib/prisma-errors";
import { normalizePhone } from "@/lib/phone";
import { findOrCreateCustomer } from "@/services/customer.service";
import { genShortCode } from "@/services/order.service";

// Lodging Vertical — Phase 2: การจอง (feature 00017)
// SSOT: docs/20 - Features/00017 - Lodging Vertical/{BRD,SRS,SDS,API}.md
//
// IMPORTANT: การจอง = Order ที่ type = "BOOKING" ไม่ใช่ตารางแยก (BR-LODG-08)
// ทุกฟังก์ชัน scope shopId ใน where ตั้งแต่ query แรกเสมอ

export const BOOKING_ORDER_TYPE = "BOOKING";

export class RoomUnavailableError extends Error {
  constructor(readonly conflict?: { from: string; to: string }) {
    super("ROOM_UNAVAILABLE");
    this.name = "RoomUnavailableError";
  }
}
export class BookingRoomNotFoundError extends Error {
  constructor() { super("ROOM_NOT_FOUND"); this.name = "BookingRoomNotFoundError"; }
}
export class RoomInactiveError extends Error {
  constructor() { super("ROOM_INACTIVE"); this.name = "RoomInactiveError"; }
}
export class InvalidDateRangeError extends Error {
  constructor() { super("INVALID_DATE_RANGE"); this.name = "InvalidDateRangeError"; }
}
export class DepositExceedsTotalError extends Error {
  constructor() { super("DEPOSIT_EXCEEDS_TOTAL"); this.name = "DepositExceedsTotalError"; }
}
export class DepositLockedError extends Error {
  constructor() { super("DEPOSIT_LOCKED"); this.name = "DepositLockedError"; }
}
export class BookingNotFoundError extends Error {
  constructor() { super("NOT_FOUND"); this.name = "BookingNotFoundError"; }
}
export class BookingNotEditableError extends Error {
  constructor() { super("BOOKING_NOT_EDITABLE"); this.name = "BookingNotEditableError"; }
}
export class SlipRequiredError extends Error {
  constructor() { super("SLIP_REQUIRED"); this.name = "SlipRequiredError"; }
}

/**
 * ตรวจ error ของ EXCLUDE constraint (Postgres SQLSTATE 23P01)
 *
 * ย้ายตัวจริงไป src/lib/prisma-errors.ts แล้วตอนทำ feature 00024 (มีผู้ใช้สองฟีเจอร์)
 * คง re-export ไว้ที่เดิมเพื่อไม่ให้ import path ของโค้ด 00017 เปลี่ยน
 * ดู DATABASE.md §4.2.1 ของทั้ง 00017 และ 00024 (ผลการทดลองจริงทั้งสองรอบ)
 */
export { isExclusionViolation };

/**
 * ดึงช่วงวันที่ชนจาก DETAIL ของ error เพื่อบอกผู้ใช้ว่าติดวันไหน (API §5.2)
 *
 * IMPORTANT: ต้องอ่านทั้ง meta.message และ err.message เพราะรูปร่าง error ต่างกันตามวิธีเรียก
 * (วัดจริง 2026-07-22):
 *   $executeRaw  → PrismaClientKnownRequestError, meta.code '23P01', DETAIL อยู่ใน meta.message
 *   model call   → PrismaClientUnknownRequestError, meta = undefined, DETAIL อยู่ใน err.message
 * ของจริงที่ createBooking ใช้คือ model call — เคยเขียนอ่านแค่ meta.message แล้วแกะไม่ออก
 *
 * IMPORTANT: ห้ามใช้ regex แบบ /conflicts with existing key[^[]*\[.../ เพราะข้อความมี
 * `'[)'::text` (นิยาม bound ของ daterange) ซึ่งมี `[` อยู่ข้างใน ทำให้ [^[]* หยุดผิดที่
 * วิธีที่ทนกว่า: เก็บช่วงวันทุกอันในข้อความ — ตัวแรกคือช่วงที่พยายามจอง ตัวที่สองคือช่วงที่มีอยู่แล้ว
 */
export function parseConflictRange(err: unknown): { from: string; to: string } | undefined {
  const meta = (err as { meta?: { message?: string } })?.meta?.message ?? "";
  const text = `${meta} ${(err as Error)?.message ?? ""}`;
  const all = [...text.matchAll(/\[(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})\)/g)];
  // [0] = ช่วงที่ผู้ใช้พยายามจอง, [1] = ช่วงที่มีอยู่แล้วและชน — เราต้องการตัวหลัง
  const m = all[1] ?? all[0];
  return m ? { from: m[1]!, to: m[2]! } : undefined;
}

/** แปลง 'YYYY-MM-DD' → Date ที่ตรงวันเป๊ะ (UTC midnight) — เลี่ยงปัญหาเลื่อนวันข้าม timezone */
export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

/** Date → 'YYYY-MM-DD' สำหรับส่งออก JSON */
export function toDateOnlyString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function nightsBetween(checkIn: Date, checkOut: Date): number {
  return Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000);
}

export interface BookingQuote {
  nights: number;
  pricePerNight: string;
  totalAmount: string;
  depositMode: string;
  depositValue: string;
  depositAmount: string;
}

/**
 * quoteBooking — แหล่งเดียวของสูตรคำนวณ (SRS TFR-002)
 *
 * IMPORTANT: ห้ามมีสำเนาสูตรนี้ที่อื่น ทั้ง endpoint quote และ create ต้องเรียกตัวนี้
 * ฝั่งหน้าเว็บคำนวณซ้ำได้เฉพาะเพื่อ preview เท่านั้น ยอดที่บันทึกมาจากที่นี่เสมอ
 *
 *   nights        = checkOut - checkIn
 *   totalAmount   = pricePerNight * nights
 *   depositAmount = FIXED   → depositValue
 *                   PERCENT → ceil(totalAmount * depositValue / 100)   ปัดขึ้นบาทเต็ม (BR-LODG-35)
 */
export async function quoteBooking(
  shopId: string,
  roomId: string,
  checkInStr: string,
  checkOutStr: string,
): Promise<BookingQuote & { checkIn: Date; checkOut: Date; room: { pricePerNight: Prisma.Decimal } }> {
  const room = await prisma.room.findFirst({ where: { id: roomId, shopId } });
  if (!room) throw new BookingRoomNotFoundError();

  const checkIn = parseDateOnly(checkInStr);
  const checkOut = parseDateOnly(checkOutStr);
  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) throw new InvalidDateRangeError();

  const total = room.pricePerNight.mul(nights);
  const deposit =
    room.depositMode === "PERCENT"
      ? // ปัดขึ้นเป็นบาทเต็ม — ผู้ใช้โอนเป็นบาทเต็ม ยอดเศษสตางค์ทำให้ที่โอนจริงไม่ตรงกับที่บันทึก
        new Prisma.Decimal(Math.ceil(total.mul(room.depositValue).div(100).toNumber()))
      : room.depositValue;

  return {
    nights,
    pricePerNight: room.pricePerNight.toFixed(2),
    totalAmount: total.toFixed(2),
    depositMode: room.depositMode,
    depositValue: room.depositValue.toFixed(2),
    // มัดจำต้องไม่เกินยอดรวมเสมอ แม้ตั้งค่าห้องไว้สูงกว่า (BR-LODG-16)
    depositAmount: (deposit.gt(total) ? total : deposit).toFixed(2),
    checkIn,
    checkOut,
    room: { pricePerNight: room.pricePerNight },
  };
}

export interface CreateBookingInput {
  roomId: string;
  checkIn: string;
  checkOut: string;
  guestName: string;
  guestPhone: string;
  depositAmount?: string;
  internalNote?: string;
}

/**
 * createBooking — สร้างการจอง + ล็อกคิวทันที (BR-LODG-09)
 *
 * IMPORTANT: คำนวณยอดที่ server ซ้ำเสมอ ไม่เชื่อค่าที่ client ส่งมา ยกเว้น depositAmount
 * ที่เจ้าของตั้งใจ override ซึ่งยังต้องผ่านการตรวจขอบเขต 0..totalAmount ที่นี่
 */
export async function createBooking(shopId: string, input: CreateBookingInput) {
  const q = await quoteBooking(shopId, input.roomId, input.checkIn, input.checkOut);

  const room = await prisma.room.findFirst({
    where: { id: input.roomId, shopId },
    select: { isActive: true, name: true },
  });
  if (!room) throw new BookingRoomNotFoundError();
  if (!room.isActive) throw new RoomInactiveError();

  const total = new Prisma.Decimal(q.totalAmount);
  const deposit =
    input.depositAmount !== undefined ? new Prisma.Decimal(input.depositAmount) : new Prisma.Decimal(q.depositAmount);
  if (deposit.lt(0) || deposit.gt(total)) throw new DepositExceedsTotalError();

  const phone = normalizePhone(input.guestPhone);

  // IMPORTANT: retry loop ต้องครอบ $transaction ทั้งก้อน ไม่ใช่อยู่ข้างใน
  // Postgres mark ทั้ง transaction เป็น aborted ทันทีที่คำสั่งใดล้ม (25P02) — retry ใน tx เดิม
  // จะ fail ทุกครั้งโดยไม่ได้ retry จริง (บทเรียนเดียวกับ createOrder + ยืนยันด้วย spike 2026-07-22)
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        // findOrCreateCustomer รับ TransactionClient และคืน id เป็น string — ต้องเรียกในธุรกรรม
        // (P2002-safe: มี re-find ในตัวกรณีสองคำขอสร้างเบอร์เดียวกันพร้อมกัน)
        const customerId = phone ? await findOrCreateCustomer(tx, phone) : undefined;
        const order = await tx.order.create({
          data: {
            shopId,
            type: BOOKING_ORDER_TYPE,
            status: "PENDING",
            // การจองไม่มีการจัดส่ง — กัน guard shippingAddress ของ order flow เดิมทำงานผิดบริบท
            fulfillmentMode: "PICKUP",
            totalAmount: total,
            depositAmount: deposit,
            roomId: input.roomId,
            checkIn: q.checkIn,
            checkOut: q.checkOut,
            buyerName: input.guestName,
            buyerContact: phone ?? input.guestPhone,
            customerId,
            internalNote: input.internalNote,
            shortCode: genShortCode(),
            // OrderItem 1 แถวเป็น snapshot ของห้อง เพื่อให้หน้าออเดอร์/สรุปยอดเดิมทำงานได้
            // โดยไม่ต้องแก้ — qty = จำนวนคืน, price = ราคาต่อคืน
            items: {
              create: [{
                name: `${room.name} (${input.checkIn} ถึง ${input.checkOut})`,
                qty: q.nights,
                price: new Prisma.Decimal(q.pricePerNight),
              }],
            },
          },
        });
        return order;
      });
    } catch (err) {
      // EXCLUDE constraint ยิง = ช่วงวันทับกับการจองที่ยังไม่ถูกยกเลิก — ไม่ต้อง retry
      if (isExclusionViolation(err)) throw new RoomUnavailableError(parseConflictRange(err));
      // ชน shortCode (P2002) → retry ด้วย transaction ใหม่ทั้งก้อน
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && attempt < 4) continue;
      throw err;
    }
  }
  throw new Error("BOOKING_CREATE_RETRY_EXHAUSTED");
}

/** ปฏิทินว่าง/ไม่ว่าง — query เดียว ห้าม N+1 ต่อห้อง (SRS NFR) */
export async function getAvailability(
  shopId: string,
  from: string,
  to: string,
  roomId?: string,
) {
  const fromDate = parseDateOnly(from);
  const toDate = parseDateOnly(to);

  const rooms = await prisma.room.findMany({
    where: { shopId, isActive: true, ...(roomId ? { id: roomId } : {}) },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  const bookings = await prisma.order.findMany({
    where: {
      shopId,
      type: BOOKING_ORDER_TYPE,
      status: { not: "CANCELLED" },
      roomId: roomId ? roomId : { in: rooms.map((r) => r.id) },
      // ทับช่วงที่ขอ: checkIn < to AND checkOut > from
      checkIn: { lt: toDate },
      checkOut: { gt: fromDate },
    },
    select: {
      publicToken: true, roomId: true, checkIn: true, checkOut: true,
      buyerName: true, status: true,
    },
    orderBy: { checkIn: "asc" },
  });

  const byRoom = new Map<string, typeof bookings>();
  for (const b of bookings) {
    if (!b.roomId) continue;
    const list = byRoom.get(b.roomId) ?? [];
    list.push(b);
    byRoom.set(b.roomId, list);
  }

  return rooms.map((r) => ({
    roomId: r.id,
    name: r.name,
    bookings: (byRoom.get(r.id) ?? []).map((b) => ({
      token: b.publicToken,
      checkIn: b.checkIn ? toDateOnlyString(b.checkIn) : null,
      checkOut: b.checkOut ? toDateOnlyString(b.checkOut) : null,
      // PII: คืนชื่อเท่านั้น ห้ามคืนเบอร์โทรบนหน้าปฏิทิน (ลดพื้นที่รั่วโดยไม่จำเป็น)
      guestName: b.buyerName,
      status: b.status,
    })),
  }));
}

async function getBookingForShop(shopId: string, token: string) {
  const order = await prisma.order.findFirst({
    where: { publicToken: token, shopId, type: BOOKING_ORDER_TYPE },
  });
  if (!order) throw new BookingNotFoundError();
  return order;
}

/** แก้ยอดมัดจำ/ช่วงวัน — ทำได้ก่อนผู้จองแนบสลิปเท่านั้น (BR-LODG-18) */
export async function updateBooking(
  shopId: string,
  token: string,
  data: { depositAmount?: string; checkIn?: string; checkOut?: string },
) {
  const order = await getBookingForShop(shopId, token);
  if (order.status !== "PENDING") throw new BookingNotEditableError();
  // ผู้จองชำระตามยอดเดิมไปแล้ว — เปลี่ยนเงื่อนไขย้อนหลังไม่ได้
  if (order.slipFileId) throw new DepositLockedError();

  const patch: Prisma.OrderUpdateInput = {};

  if (data.checkIn && data.checkOut) {
    const q = await quoteBooking(shopId, order.roomId!, data.checkIn, data.checkOut);
    patch.checkIn = q.checkIn;
    patch.checkOut = q.checkOut;
    patch.totalAmount = new Prisma.Decimal(q.totalAmount);
  }

  if (data.depositAmount !== undefined) {
    const total = (patch.totalAmount as Prisma.Decimal) ?? order.totalAmount;
    const deposit = new Prisma.Decimal(data.depositAmount);
    if (deposit.lt(0) || deposit.gt(total)) throw new DepositExceedsTotalError();
    patch.depositAmount = deposit;
  }

  if (Object.keys(patch).length === 0) return order;

  try {
    return await prisma.order.update({ where: { id: order.id }, data: patch });
  } catch (err) {
    if (isExclusionViolation(err)) throw new RoomUnavailableError(parseConflictRange(err));
    throw err;
  }
}

/**
 * confirmBooking — เจ้าของยืนยันหลังตรวจสลิป (FR-LODG-16)
 *
 * IMPORTANT: ต่างจาก confirmOrder เดิมที่ผู้ซื้อเป็นคนกด — การจองต้องให้เจ้าของยืนยัน
 * เท่านั้น มิฉะนั้นผู้จองจะยืนยันการจองตัวเองได้โดยไม่ต้องโอนเงิน (TFR-006)
 */
export async function confirmBooking(shopId: string, token: string) {
  const order = await getBookingForShop(shopId, token);
  if (order.status !== "PENDING") throw new BookingNotEditableError();
  // มัดจำ 0 = ไม่เก็บมัดจำ → ยืนยันได้ทันทีโดยไม่ต้องมีสลิป (BR-LODG-17)
  const needsSlip = order.depositAmount != null && order.depositAmount.gt(0);
  if (needsSlip && !order.slipFileId) throw new SlipRequiredError();

  return prisma.order.update({ where: { id: order.id }, data: { status: "CONFIRMED" } });
}

/**
 * listBookings — รายการจองของร้าน เรียงตามวันเข้าพัก
 * แยกกลุ่ม "ต้องจัดการ" (PENDING) ออกมาให้เจ้าของเห็นก่อน เพราะเป็นงานค้างจริง
 */
export async function listBookings(shopId: string) {
  return prisma.order.findMany({
    where: { shopId, type: BOOKING_ORDER_TYPE },
    include: { room: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { checkIn: "asc" }],
    take: 200,
  });
}

/** รายละเอียดการจอง — scope shopId ใน where ตั้งแต่ query แรก */
export async function getBookingDetail(shopId: string, token: string) {
  const order = await prisma.order.findFirst({
    where: { publicToken: token, shopId, type: BOOKING_ORDER_TYPE },
    include: { room: { select: { id: true, name: true } } },
  });
  if (!order) throw new BookingNotFoundError();
  return order;
}

/** serialize สำหรับส่งข้าม RSC/JSON boundary — Decimal/Date → string */
export function serializeBooking(o: {
  id: string; publicToken: string; shortCode: string | null; status: string;
  totalAmount: Prisma.Decimal; depositAmount: Prisma.Decimal | null;
  checkIn: Date | null; checkOut: Date | null; roomId: string | null;
  buyerName: string | null; slipFileId: string | null; cancelReason: string | null;
}) {
  return {
    id: o.id,
    token: o.publicToken,
    shortCode: o.shortCode,
    status: o.status,
    totalAmount: o.totalAmount.toFixed(2),
    depositAmount: o.depositAmount?.toFixed(2) ?? null,
    checkIn: o.checkIn ? toDateOnlyString(o.checkIn) : null,
    checkOut: o.checkOut ? toDateOnlyString(o.checkOut) : null,
    nights: o.checkIn && o.checkOut ? nightsBetween(o.checkIn, o.checkOut) : null,
    roomId: o.roomId,
    guestName: o.buyerName,
    hasSlip: !!o.slipFileId,
    cancelReason: o.cancelReason,
  };
}

export type SerializedBooking = ReturnType<typeof serializeBooking>;
