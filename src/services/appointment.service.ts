import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isExclusionViolation } from "@/lib/prisma-errors";
import { appointmentDayWhere } from "@/lib/appointment-day";
import {
  APPOINTMENT_ORDER_TYPE,
  APPOINTMENT_STATUS,
  AppointmentFeatureUnavailableError,
  AppointmentNotFoundError,
  AppointmentNotStartedError,
  AppointmentPastError,
  AppointmentSlotFullError,
  AppointmentTerminalError,
  InvalidAppointmentRangeError,
  ServiceResourceInactiveError,
  ServiceResourceNotFoundError,
  canUseAppointments,
  isTerminalAppointmentStatus,
  type AppointmentStatus,
} from "@/lib/appointments";

// ระบบนัดหมายวันเข้าใช้บริการ (feature 00024)
// SSOT: docs/20 - Features/00024 - Service Appointment Booking/{BRD,SRS,SDS,API}.md
//
// IMPORTANT: การนัด = Order ที่ type = "SERVICE" ไม่ใช่ตารางแยก (BR-RSV-10)
// ทุกฟังก์ชันฝั่งร้าน scope shopId ใน where ตั้งแต่ query แรกเสมอ (บทเรียน feedback_rsc_dal_authz)

export type AppointmentInput = {
  resourceId: string;
  start: Date;
  end: Date;
};

/** ตรวจตัวกั้นฟีเจอร์จาก shopId — โยน 403 ถ้าร้านไม่เข้าเงื่อนไข BR-RSV-01 */
export async function assertShopCanUseAppointments(shopId: string): Promise<void> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { kind: true, vertical: true },
  });
  if (!canUseAppointments(shop)) throw new AppointmentFeatureUnavailableError();
}

/** โหลดทรัพยากรพร้อม scope shopId — ต้องเปิดใช้งานอยู่ถึงจะรับนัดใหม่ได้ (BR-RSV-07) */
async function loadActiveResource(shopId: string, resourceId: string) {
  const resource = await prisma.serviceResource.findFirst({
    where: { id: resourceId, shopId },
    select: {
      id: true,
      name: true,
      capacity: true,
      isActive: true,
      // มัดจำเริ่มต้น (FR-RSV-12) — ใช้คำนวณยอดตั้งต้นตอนสร้างออเดอร์พร้อมนัด
      depositMode: true,
      depositValue: true,
    },
  });
  if (!resource) throw new ServiceResourceNotFoundError();
  if (!resource.isActive) throw new ServiceResourceInactiveError();
  return resource;
}

/**
 * คำนวณยอดมัดจำของออเดอร์หนึ่งใบ (FR-RSV-12, BR-RSV-46/47/48)
 *
 * IMPORTANT: ผลลัพธ์นี้ถูก "snapshot" ลง Order.depositAmount ตอนสร้าง — ห้ามให้ที่ไหน
 * คำนวณสดจาก ServiceResource ตอนแสดงผล มิฉะนั้นยอดของออเดอร์เก่าจะขยับเมื่อร้าน
 * แก้ค่าเริ่มต้นของทรัพยากร (BR-RSV-46 — บทเรียนเดียวกับ Room.depositMode ของ 00017)
 *
 * IMPORTANT: มัดจำไม่กั้นการกันคิว (BR-RSV-49) และไม่มีการติดตามสถานะจ่าย (BR-RSV-50)
 * ฟังก์ชันนี้จึงคืนแค่ "ยอด" ไม่มีสถานะใด ๆ ติดมาด้วย
 *
 * @param override ยอดที่ร้านกรอกเอง — มีค่าเมื่อไร ชนะค่าเริ่มต้นของทรัพยากรเสมอ (BR-RSV-48)
 */
export function computeAppointmentDeposit(args: {
  resource: { depositMode: string; depositValue: Prisma.Decimal };
  totalAmount: Prisma.Decimal;
  override?: string | null;
}): Prisma.Decimal {
  const { resource, totalAmount, override } = args;

  const raw =
    override !== undefined && override !== null
      ? new Prisma.Decimal(override)
      : resource.depositMode === "PERCENT"
        ? totalAmount.mul(resource.depositValue).div(100)
        : resource.depositValue;

  // ปัดให้ตรงกับ Decimal(12,2) ของคอลัมน์ ก่อนเทียบเพดาน — กัน 33.333... ที่มาจาก PERCENT
  const rounded = raw.toDecimalPlaces(2);

  // ยอดมัดจำต้องไม่เกินยอดรวมของออเดอร์ (BR-RSV-47)
  if (rounded.gt(totalAmount)) return totalAmount;
  // กันค่าติดลบเชิงลึก — validation กันไว้แล้วแต่ service ไม่ควรเชื่อผู้เรียกฝ่ายเดียว
  if (rounded.lt(0)) return new Prisma.Decimal(0);
  return rounded;
}

function assertValidRange(start: Date, end: Date): void {
  if (!(end.getTime() > start.getTime())) throw new InvalidAppointmentRangeError();
}

/**
 * namespace ของ advisory lock ในระบบ — เลือกเลขคงที่ที่ไม่ชนกับฟีเจอร์อื่น
 * (ตรวจแล้ว 2026-07-31: ยังไม่มีที่ไหนในโปรเจกต์ใช้ advisory lock เลย ตัวนี้เป็นตัวแรก)
 * ถ้าจะเพิ่มที่อื่นในอนาคต ให้จองเลข namespace ใหม่ ห้ามใช้ซ้ำ
 */
const ADVISORY_NS_APPOINTMENT_SEAT = 24;

/**
 * ลำดับที่จะลองจองที่นั่ง — "ที่น่าจะว่าง" ขึ้นก่อน ที่เหลือต่อท้าย (2026-08-10)
 *
 * 🛑 invariant ที่ต้องไม่มีวันเสีย: **ผลลัพธ์เป็น permutation ของ 1..capacity เสมอ**
 * ไม่ว่า `taken` จะมีอะไรอยู่ (รวมค่าที่เพี้ยน/นอกช่วง/ซ้ำ) — เพราะนี่คือตัวจัดลำดับ ไม่ใช่ตัวกรอง
 * ถ้าวันไหนมันตัดที่นั่งทิ้งได้ ระบบจะรายงาน "เต็ม" ทั้งที่ยังจองได้ โดยไม่มีอะไรฟ้อง
 *
 * แยกออกมาเป็นฟังก์ชันบริสุทธิ์เพราะ `allocateSeat` แตะ DB จริงทั้งตัว — ตรรกะที่ตัดสินพฤติกรรม
 * ต้องมีที่ให้เทสจับได้โดยไม่ต้องมีฐานข้อมูล
 */
export function seatTryOrder(capacity: number, taken: readonly number[]): number[] {
  const takenSet = new Set(taken);
  const all = Array.from({ length: capacity }, (_, i) => i + 1);
  return [...all.filter((s) => !takenSet.has(s)), ...all.filter((s) => takenSet.has(s))];
}

/**
 * จัดสรร "ที่นั่งลำดับที่ n" ให้ออเดอร์หนึ่งใบ — หัวใจของการรองรับความจุ > 1 (BR-RSV-16)
 *
 * วิธีทำงาน: กัน "การจัดสรรของทรัพยากรเดียวกัน" ให้เรียงคิวทีละคนด้วย advisory lock
 * แล้ววนลองที่นั่ง 1..capacity — ที่นั่งไหน UPDATE ผ่าน = ได้ที่นั่งนั้น ครบแล้วยังชน = เต็มจริง
 *
 * IMPORTANT: ห้าม implement ด้วยการ count() นัดที่ทับกันแล้วเทียบ capacity เป็นตัวตัดสิน
 * มีช่องว่างระหว่าง "นับ" กับ "เขียน" เสมอ → กดพร้อมกันแล้วจองทะลุความจุได้ (BR-RSV-18.1)
 * ตัวตัดสินสุดท้ายคือ EXCLUDE constraint `Order_service_seat_no_overlap` เสมอ
 *
 * IMPORTANT: ทุกครั้งที่ลองต้องครอบ SAVEPOINT — Postgres poison ทั้ง transaction ทันที
 * ที่ constraint ยิง (25P02 current transaction is aborted) ถ้าไม่ครอบ ที่นั่งแรกที่ชน
 * จะทำให้ทั้งธุรกรรมตาย ทั้งที่ยังมีที่ว่างอยู่
 *
 * IMPORTANT: advisory lock ไม่ใช่ของประดับ — TC-A05 (ยิง 12 request พร้อมกันบนความจุ 8)
 * พิสูจน์เมื่อ 2026-07-31 ว่า **ถ้าไม่มี lock นี้ ระบบจองไม่ได้เลยสักคน (สำเร็จ 0 จาก 12)**
 * เพราะ EXCLUDE บน GiST สร้าง predicate lock: เมื่อ tx อื่นเขียนที่นั่งเดียวกันไว้แต่ยัง
 * ไม่ commit เราจะ **ถูกบล็อกให้รอ ไม่ใช่ได้ error ทันที** → ติดค้างที่นั่งนั้น ไปลองที่นั่ง
 * ถัดไปไม่ได้ → รอกันเป็นลูกโซ่จนเกิด deadlock (40P01) และหมดเวลา transaction ยกชุด
 *
 * spike รุ่นแรกไม่เจอเพราะทดสอบกับแถวที่ commit ไปแล้ว (ยิงทีละตัว) ซึ่งได้ error ทันทีจริง
 * — พฤติกรรมคนละแบบกับการชน transaction ที่ยังไม่ commit (บทเรียน
 * feedback_spike_must_match_production_path)
 *
 * ขอบเขตของ lock = ต่อทรัพยากรหนึ่งหน่วย ไม่ใช่ทั้งร้าน — ทรัพยากรคนละตัวจองพร้อมกันได้ปกติ
 * เป็น xact lock จึงปลดเองตอน transaction จบ ไม่มีทางลืมปลด และมีแค่ lock เดียวจึงไม่มี deadlock
 */
async function allocateSeat(
  tx: Prisma.TransactionClient,
  args: {
    orderId: string;
    resource: { id: string; name: string; capacity: number };
    start: Date;
    end: Date;
  },
): Promise<number> {
  const { orderId, resource, start, end } = args;

  // เรียงคิวการจัดสรรของทรัพยากรนี้ — ทำให้ลูปด้านล่างเห็นเฉพาะแถวที่ commit แล้ว
  // ซึ่งเป็นเงื่อนไขที่กลไก "ลองแล้วชน = ข้ามไปที่นั่งถัดไป" ต้องการจึงจะทำงานถูก
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_NS_APPOINTMENT_SEAT}::int, hashtext(${resource.id})::int)`;

  /**
   * อ่านที่นั่งที่ถูกจองไว้ในช่วงเวลานี้ 1 ครั้ง เพื่อ **จัดลำดับ** การลอง (2026-08-10)
   *
   * 🛑 ใช้ "จัดลำดับ" เท่านั้น ห้ามใช้ "ตัดที่นั่งทิ้ง" — นั่นคือ count-แล้ว-เทียบ-capacity ที่
   * IMPORTANT ด้านบนห้ามไว้ (BR-RSV-18.1) และถ้า WHERE ของ query นี้กว้างกว่าของ constraint
   * แม้แต่นิดเดียว ที่นั่งที่ว่างจริงจะถูกตัดทิ้งแล้วรายงาน "เต็ม" ทั้งที่ยังจองได้
   * การจัดลำดับทำให้เดาผิดมีโทษสูงสุดแค่ "เท่าเดิม" — ลูปยังลองครบ 1..capacity เหมือนเดิมทุกที่นั่ง
   * ตัวตัดสินสุดท้ายยังเป็น EXCLUDE constraint เท่านั้น
   *
   * ทำไมต้องมี: ทุกที่นั่งที่ชนจ่าย 3 round trip (SAVEPOINT / UPDATE ที่ล้ม / ROLLBACK TO
   * SAVEPOINT) + tuple ที่เขียนแล้ว rollback (dead tuple ให้ autovacuum ตามเก็บ) + 1 บรรทัด
   * ERROR 23P01 ใน log — และมันเกิด **ขณะถือ advisory lock ที่บล็อกคนอื่นที่จองทรัพยากรตัวเดียวกัน
   * อยู่** ความจุ 8 ที่เต็ม 7 = ~21 round trip ต่อการจอง 1 ใบ โดยแพงที่สุดตอนใกล้เต็ม ซึ่งคือ
   * ตอนที่คนแย่งกันจองมากที่สุดพอดี (user เห็น 23P01 4 บรรทัดรวดใน log 2026-08-10 10:01:34)
   *
   * WHERE ต้องสะท้อน constraint ให้ตรงที่สุด (ดู migration 20260731000100): resource เดียวกัน ·
   * status <> 'CANCELLED' · ช่วงเวลาทับกันแบบ '[)' · ตัดตัวเองออกเพราะแถวไม่ชนกับตัวเอง
   * ตอน UPDATE (เคสเลื่อนนัด ที่นั่งเดิมของออเดอร์ใบนี้ยังใช้ได้อยู่)
   */
  const takenRows = await tx.$queryRaw<{ serviceSeat: number }[]>`
    SELECT DISTINCT "serviceSeat"
    FROM "Order"
    WHERE "serviceResourceId" = ${resource.id}
      AND "status" <> 'CANCELLED'
      AND "serviceSeat" IS NOT NULL
      AND "id" <> ${orderId}
      AND tstzrange("serviceStart", "serviceEnd", '[)')
          && tstzrange(${start}::timestamptz, ${end}::timestamptz, '[)')
  `;
  for (const seat of seatTryOrder(resource.capacity, takenRows.map((r) => r.serviceSeat))) {
    const savepoint = `seat_try_${seat}`;
    await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
    try {
      await tx.order.update({
        where: { id: orderId },
        data: {
          serviceResourceId: resource.id,
          serviceSeat: seat,
          serviceStart: start,
          serviceEnd: end,
        },
      });
      await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
      return seat;
    } catch (err) {
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      // error อื่นที่ไม่ใช่การชนที่นั่ง ต้องไม่ถูกกลืน
      if (!isExclusionViolation(err)) throw err;
    }
  }

  throw new AppointmentSlotFullError(resource.name, resource.capacity);
}

/**
 * ตั้งนัดให้ออเดอร์ที่ยังไม่มีนัด หรือเลื่อนนัดที่มีอยู่ (FR-RSV-03/08)
 *
 * ถ้ามีนัดเดิมอยู่แล้ว จะเขียนแถวประวัติการเลื่อนสะสมเสมอ ไม่ทับของเดิม (BR-RSV-30)
 */
export async function setOrRescheduleAppointment(args: {
  shopId: string;
  orderToken: string;
  input: AppointmentInput;
  actorUserId: string | null;
  reason?: string | null;
}) {
  const { shopId, orderToken, input, actorUserId, reason } = args;

  await assertShopCanUseAppointments(shopId);
  assertValidRange(input.start, input.end);
  const resource = await loadActiveResource(shopId, input.resourceId);

  return prisma.$transaction(async (tx) => {
    // ownership อยู่ใน WHERE ตั้งแต่ query แรก — ห้าม findUnique แล้วค่อยเช็คทีหลัง
    const current = await tx.order.findFirst({
      where: { publicToken: orderToken, shopId },
      select: {
        id: true,
        serviceResourceId: true,
        serviceStart: true,
        serviceEnd: true,
        appointmentStatus: true,
      },
    });
    if (!current) throw new AppointmentNotFoundError();
    if (isTerminalAppointmentStatus(current.appointmentStatus)) {
      throw new AppointmentTerminalError();
    }

    const hadAppointment = !!current.serviceStart && !!current.serviceEnd;
    if (hadAppointment) {
      await tx.appointmentReschedule.create({
        data: {
          orderId: current.id,
          fromResourceId: current.serviceResourceId,
          fromStart: current.serviceStart!,
          fromEnd: current.serviceEnd!,
          toResourceId: resource.id,
          toStart: input.start,
          toEnd: input.end,
          // การย้ายเวลาจริงเป็นการกระทำของร้านเสมอ แม้จะเกิดจากคำขอของลูกค้า (BR-RSV-23)
          actorRole: "SHOP",
          actorUserId,
          reason: reason ?? null,
        },
      });
    }

    // ที่ว่างของช่วงเวลาเดิมคืนอัตโนมัติเพราะแถวเดิมถูกเขียนทับ (BR-RSV-29)
    await allocateSeat(tx, {
      orderId: current.id,
      resource,
      start: input.start,
      end: input.end,
    });

    const updated = await tx.order.update({
      where: { id: current.id },
      data: {
        type: APPOINTMENT_ORDER_TYPE,
        appointmentStatus: APPOINTMENT_STATUS.SCHEDULED,
        // ล้างคำขอเลื่อนเดิมทิ้งเมื่อร้านจัดการแล้ว
        rescheduleRequestNote: null,
        // นัดถูกย้าย = การยืนยันเดิมของลูกค้าไม่ผูกกับเวลาใหม่อีกต่อไป
        buyerConfirmedAt: hadAppointment ? null : undefined,
      },
      select: {
        publicToken: true,
        serviceStart: true,
        serviceEnd: true,
        appointmentStatus: true,
      },
    });

    const rescheduleCount = await tx.appointmentReschedule.count({
      where: { orderId: current.id },
    });

    return { ...updated, resource: { id: resource.id, name: resource.name }, rescheduleCount };
  });
}

/**
 * สร้างนัดให้ออเดอร์ที่เพิ่งถูกสร้างในธุรกรรมเดียวกัน (โหมด A — FR-RSV-03)
 *
 * แยกจาก setOrRescheduleAppointment เพราะ order.service สร้างออเดอร์อยู่ใน tx ของตัวเองแล้ว
 * IMPORTANT: ผู้เรียกต้องสร้างออเดอร์ "โดยยังไม่ใส่ฟิลด์นัด" แล้วค่อยเรียกฟังก์ชันนี้ (SDS D-07)
 * ถ้าใส่ที่นั่งไปตั้งแต่ INSERT แล้วชน จะต้องสร้างออเดอร์ใหม่ทั้งใบเพื่อ retry
 */
export async function attachAppointmentInTx(
  tx: Prisma.TransactionClient,
  args: {
    orderId: string;
    resource: { id: string; name: string; capacity: number };
    start: Date;
    end: Date;
  },
): Promise<number> {
  assertValidRange(args.start, args.end);
  const seat = await allocateSeat(tx, args);
  await tx.order.update({
    where: { id: args.orderId },
    data: {
      type: APPOINTMENT_ORDER_TYPE,
      appointmentStatus: APPOINTMENT_STATUS.SCHEDULED,
    },
  });
  return seat;
}

/** โหลดทรัพยากรสำหรับใช้ใน tx ของ order.service (ตรวจ active + ownership ก่อนเปิด tx) */
export async function resolveResourceForOrder(shopId: string, resourceId: string) {
  await assertShopCanUseAppointments(shopId);
  return loadActiveResource(shopId, resourceId);
}

/**
 * ทำเครื่องหมายผลของนัด (FR-RSV-09)
 *
 * IMPORTANT: ห้ามแตะ Order.status ในฟังก์ชันนี้ (BR-RSV-33)
 * และห้ามให้กระทบ Trust Score (BR-RSV-35) — no-show บันทึกไว้เฉย ๆ ไม่หักคะแนน
 */
export async function setAppointmentOutcome(args: {
  shopId: string;
  orderToken: string;
  outcome: Extract<AppointmentStatus, "COMPLETED" | "NO_SHOW">;
  now?: Date;
}) {
  const { shopId, orderToken, outcome } = args;
  const now = args.now ?? new Date();

  await assertShopCanUseAppointments(shopId);

  const order = await prisma.order.findFirst({
    where: { publicToken: orderToken, shopId },
    select: { id: true, serviceStart: true, appointmentStatus: true },
  });
  if (!order?.serviceStart) throw new AppointmentNotFoundError();
  if (isTerminalAppointmentStatus(order.appointmentStatus)) {
    throw new AppointmentTerminalError();
  }
  // ทำเครื่องหมายได้ตั้งแต่ถึงเวลาเริ่มนัดเป็นต้นไปเท่านั้น (BR-RSV-34)
  if (now.getTime() < order.serviceStart.getTime()) {
    throw new AppointmentNotStartedError();
  }

  return prisma.order.update({
    where: { id: order.id },
    data: { appointmentStatus: outcome },
    select: { appointmentStatus: true },
  });
}

/**
 * ลูกค้ายืนยันนัด (FR-RSV-06) — idempotent (BR-RSV-26)
 *
 * IMPORTANT: ownership ฝั่งลูกค้าตัดสินจาก order.buyerUserId เท่านั้น (BR-RSV-21)
 * การเข้าถึงหน้า /o/{token} เป็นหน้าที่ของ feature 00015 — ฟังก์ชันนี้ไม่ทำซ้ำและไม่แก้
 */
export async function confirmAppointmentByBuyer(args: {
  orderToken: string;
  buyerUserId: string;
}) {
  const { orderToken, buyerUserId } = args;

  const order = await prisma.order.findFirst({
    where: { publicToken: orderToken, buyerUserId },
    select: {
      id: true,
      serviceStart: true,
      appointmentStatus: true,
      buyerConfirmedAt: true,
    },
  });
  if (!order?.serviceStart) throw new AppointmentNotFoundError();
  if (isTerminalAppointmentStatus(order.appointmentStatus)) {
    throw new AppointmentTerminalError();
  }

  // กดซ้ำ = คืนค่าเดิม ไม่เขียนทับเวลาที่ยืนยันครั้งแรก
  if (order.buyerConfirmedAt) {
    return {
      appointmentStatus: order.appointmentStatus,
      buyerConfirmedAt: order.buyerConfirmedAt,
    };
  }

  return prisma.order.update({
    where: { id: order.id },
    data: {
      appointmentStatus: APPOINTMENT_STATUS.CONFIRMED_BY_BUYER,
      buyerConfirmedAt: new Date(),
    },
    select: { appointmentStatus: true, buyerConfirmedAt: true },
  });
}

/**
 * ลูกค้าขอเลื่อนนัด (FR-RSV-07)
 *
 * IMPORTANT: ไม่ย้ายเวลาใด ๆ — ช่วงเวลาเดิมยังนับเข้าความจุจนกว่าร้านจะตัดสิน (BR-RSV-27)
 * ลูกค้าเปลี่ยนวันเองไม่ได้ ทำได้แค่ "ขอ" (BR-RSV-23)
 */
export async function requestAppointmentReschedule(args: {
  orderToken: string;
  buyerUserId: string;
  note?: string | null;
  now?: Date;
}) {
  const { orderToken, buyerUserId, note } = args;
  const now = args.now ?? new Date();

  const order = await prisma.order.findFirst({
    where: { publicToken: orderToken, buyerUserId },
    select: { id: true, serviceStart: true, serviceEnd: true, appointmentStatus: true },
  });
  if (!order?.serviceStart || !order.serviceEnd) throw new AppointmentNotFoundError();
  if (isTerminalAppointmentStatus(order.appointmentStatus)) {
    throw new AppointmentTerminalError();
  }
  if (now.getTime() >= order.serviceEnd.getTime()) throw new AppointmentPastError();

  return prisma.order.update({
    where: { id: order.id },
    data: {
      appointmentStatus: APPOINTMENT_STATUS.RESCHEDULE_REQUESTED,
      rescheduleRequestNote: note ?? null,
    },
    select: { appointmentStatus: true },
  });
}

/**
 * จำนวนนัดที่จองแล้วต่อช่วงเวลาของทรัพยากรหนึ่งหน่วย (TFR-005)
 *
 * IMPORTANT: ใช้ "แสดงผลเท่านั้น" ไม่ใช่กลไกตัดสิน — ระหว่างที่ผู้ใช้ดูอยู่
 * อาจมีคนจองแทรกเข้ามาได้เสมอ ตัวตัดสินคือ EXCLUDE constraint ตอนบันทึกจริง
 */
export async function getResourceAvailability(args: {
  shopId: string;
  resourceId: string;
  from: Date;
  to: Date;
}) {
  const { shopId, resourceId, from, to } = args;
  await assertShopCanUseAppointments(shopId);

  const resource = await prisma.serviceResource.findFirst({
    where: { id: resourceId, shopId },
    select: { id: true, capacity: true },
  });
  if (!resource) throw new ServiceResourceNotFoundError();

  const busy = await prisma.order.findMany({
    where: {
      serviceResourceId: resourceId,
      shopId,
      status: { not: "CANCELLED" },
      // ช่วงที่ทับกับหน้าต่างที่ขอ: start < to AND end > from
      serviceStart: { lt: to },
      serviceEnd: { gt: from },
    },
    select: { serviceStart: true, serviceEnd: true },
    orderBy: { serviceStart: "asc" },
  });

  return {
    resourceId: resource.id,
    capacity: resource.capacity,
    busy: busy.map((b) => ({ start: b.serviceStart!, end: b.serviceEnd! })),
  };
}

/**
 * ปฏิทินคิวของร้าน (FR-RSV-04)
 *
 * IMPORTANT: หน้านี้อยู่ใต้ client layout → ทุก field ที่คืนไปจะถูก serialize เข้า flight payload
 * จึงคืนเฉพาะที่ปฏิทินต้องใช้จริง ห้ามคืนเบอร์/อีเมลลูกค้า (TFR-010, บทเรียน
 * feedback_rsc_pii_neutralize_at_source)
 */
export async function listAppointments(args: {
  shopId: string;
  from: Date;
  to: Date;
  resourceId?: string | null;
}) {
  const { shopId, from, to, resourceId } = args;
  await assertShopCanUseAppointments(shopId);

  const rows = await prisma.order.findMany({
    where: {
      shopId,
      serviceResourceId: resourceId ? resourceId : { not: null },
      status: { not: "CANCELLED" },
      serviceStart: { lt: to },
      serviceEnd: { gt: from },
    },
    select: {
      publicToken: true,
      orderNo: true,
      serviceStart: true,
      serviceEnd: true,
      appointmentStatus: true,
      buyerName: true,
      serviceResource: { select: { id: true, name: true, capacity: true } },
      // ห้าม select buyerContact / customer.phone ที่นี่ — ไม่ได้ใช้และจะรั่วเข้า payload
    },
    orderBy: { serviceStart: "asc" },
  });

  return rows.map((r) => ({
    orderToken: r.publicToken,
    orderNo: r.orderNo,
    resource: r.serviceResource,
    start: r.serviceStart!,
    end: r.serviceEnd!,
    appointmentStatus: r.appointmentStatus,
    buyerName: r.buyerName,
  }));
}

/**
 * getTodayAppointmentCount — จำนวนนัดของ "วันนี้" สำหรับไทล์บน Command Center (user สั่ง 2026-08-07)
 *
 * ทำไมมีอยู่: ไทล์ที่ 2 ของ OrderStatusBand เดิมคือ Order.status='SHIPPED' ซึ่งร้าน SERVICE_QUEUE
 * ไม่มีวันเข้าถึง (fulfillmentMode = NO_SHIPPING → ไม่มี SHIPPED state ดู order-display.ts) ไทล์นั้น
 * จึงขึ้น 0 ตลอดกาล กินพื้นที่ 1 ใน 4 ช่องของแถบ "งานค้างวันนี้" ไปเปล่า ๆ
 *
 * ขอบเขตวันใช้ปฏิทินไทย — ห้ามตัดวันด้วย UTC (บทเรียน feature 00033: /sales กับ /orders เคยตัด
 * คนละแบบกับ dashboard แล้วตัวเลขสองหน้าไม่ตรงกัน)
 *
 * เกณฑ์ = ช่วงนัด "คาบเกี่ยว" วันนี้ ไม่ใช่ `serviceStart` อยู่ในวันนี้ — โหมด DAY ที่นัดข้ามหลายวัน
 * จะหายไปจากวันกลาง ๆ
 *
 * นับรวมนัดที่จบไปแล้ววันนี้ (COMPLETED/NO_SHOW) โดยตั้งใจ — ป้ายเขียนว่า "นัดวันนี้" ซึ่งเป็น
 * ข้อเท็จจริงของทั้งวัน ไม่ใช่ "ที่ยังไม่ได้ทำ" ตัดออกเฉพาะ CANCELLED เหมือน listAppointments
 *
 * 🛑 2026-08-10: นิยามย้ายไป `src/lib/appointment-day.ts` ทั้งก้อน เพราะไทล์นี้ลิงก์เข้า
 * `/orders?apptDay=today` แล้ว — ตัวเลขบนไทล์กับจำนวนแถวที่กรองได้ต้องมาจากนิยามเดียวกัน
 * (BR-SOV-06). พร้อมกันนั้นเกณฑ์คัดเปลี่ยนจาก `serviceResourceId != null` เป็น `serviceStart != null`
 * ให้ตรงกับที่รายการใช้ — ของเดิมสองที่ไม่ตรงกันอยู่แล้วสำหรับนัดที่ถูกถอด resource ออกภายหลัง
 */
export async function getTodayAppointmentCount(shopId: string): Promise<number> {
  return prisma.order.count({
    where: { shopId, ...appointmentDayWhere("today") },
  });
}
