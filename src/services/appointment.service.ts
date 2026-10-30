import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withoutDrafted } from "@/lib/order-visibility";
import { isExclusionViolation } from "@/lib/prisma-errors";
import { appointmentDayBounds, appointmentDayWhere } from "@/lib/appointment-day";
import { ServiceJobClosedLockedError } from "@/lib/service-job";
import { runAfterResponse } from "@/lib/run-after-response";
import { dispatchAutoNotify, reserveAutoNotifyIntent } from "@/services/auto-notify.service";
import {
  APPOINTMENT_ORDER_TYPE,
  APPOINTMENT_STATUS,
  AppointmentFeatureUnavailableError,
  AppointmentNotFoundError,
  AppointmentPastError,
  AppointmentSlotFullError,
  AppointmentTerminalError,
  InvalidAppointmentRangeError,
  ServiceResourceInactiveError,
  ServiceResourceNotFoundError,
  canUseAppointments,
  isTerminalAppointmentStatus,
} from "@/lib/appointments";
import type { StoredArrivalMode } from "@/lib/arrival-mode";

// ระบบนัดหมายวันเข้าใช้บริการ (feature 00024)
// SSOT: docs/20 - Features/00024 - Service Appointment Booking/{BRD,SRS,SDS,API}.md
//
// IMPORTANT: การนัด = Order ที่ type = "SERVICE" ไม่ใช่ตารางแยก (BR-RSV-10)
// ทุกฟังก์ชันฝั่งร้าน scope shopId ใน where ตั้งแต่ query แรกเสมอ (บทเรียน feedback_rsc_dal_authz)

export type AppointmentInput = {
  resourceId: string;
  start: Date;
  end: Date;
  /**
   * feature 00086 (API.md §4.4) — ใช้เฉพาะ "ตั้งเวลาครั้งแรก" ของใบที่ยังไม่ระบุเวลา:
   * WALK_IN = เริ่มงานหน้าร้าน (เฉพาะเวลาเริ่ม <= ตอนนี้ + 5 นาที ไม่งั้นเก็บ BOOKED — firstScheduleArrivalMode)
   * · ไม่ส่ง/BOOKED = จองล่วงหน้า · ใบที่มีเวลาอยู่แล้ว (เลื่อนนัด) ไม่เปลี่ยน
   */
  arrivalMode?: StoredArrivalMode;
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
      // feature 00086 — ระยะเวลามาตรฐานของคิว ใช้เป็นช่วงงานของ "หน้าร้าน" ตอนสร้างบิล (walkInWindow)
      durationMinutes: true,
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

/** เวลาเริ่มของ "หน้าร้าน" เลยตอนนี้ได้ไม่เกินเท่านี้ (นาฬิกาเครื่องผู้ขายเพี้ยน/กดค้าง) — review P2 MINOR-2 */
export const WALK_IN_START_TOLERANCE_MS = 5 * 60_000;

/**
 * แบบการมาที่เก็บจริงตอนใบ "ได้เวลาครั้งแรก" (review P2 MINOR-2)
 *
 * WALK_IN = ลูกค้าอยู่ที่ร้านตอนนี้ ⇒ เชื่อได้ก็ต่อเมื่อเวลาเริ่ม <= ตอนนี้ + 5 นาที
 * ถ้า client ส่ง WALK_IN มากับเวลาในอนาคต (เช่นพรุ่งนี้ 10 โมง) นั่นคือ "นัด" ไม่ใช่หน้าร้าน
 * ⇒ เก็บเป็น BOOKED (และจึงจองแจ้งลูกค้า SERVICE_BOOKED แบบเดียวกับ BOOKED) — เลือก "ลดเป็น BOOKED"
 * แทนการตอบ 400 โดยตั้งใจ: StartWalkInSheet ส่งเวลาเริ่ม = ตอนนี้ของเครื่องผู้ขาย ถ้านาฬิกาเครื่องเพี้ยน
 * ผู้ขายต้องเริ่มงานได้เสมอ ไม่ใช่เจอ error ตอนลูกค้ายืนรออยู่หน้าร้าน · ค่าที่เก็บก็ยังตรงความจริง
 * ไม่ส่ง = BOOKED (พฤติกรรมเดิม)
 */
export function firstScheduleArrivalMode(
  requested: StoredArrivalMode | undefined,
  start: Date,
  nowMs: number,
): StoredArrivalMode {
  if (requested === "WALK_IN" && start.getTime() <= nowMs + WALK_IN_START_TOLERANCE_MS) return "WALK_IN";
  return "BOOKED";
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

  let ledgerId: string | null = null;
  const result = await prisma.$transaction(async (tx) => {
    ledgerId = null;
    // ownership อยู่ใน WHERE ตั้งแต่ query แรก — ห้าม findUnique แล้วค่อยเช็คทีหลัง
    const current = await tx.order.findFirst({
      where: { publicToken: orderToken, shopId },
      select: {
        id: true,
        serviceResourceId: true,
        serviceStart: true,
        serviceEnd: true,
        appointmentStatus: true,
        serviceClosedAt: true,
        conversationId: true,
        isDryRun: true,
        arrivalMode: true,
      },
    });
    if (!current) throw new AppointmentNotFoundError();
    if (isTerminalAppointmentStatus(current.appointmentStatus)) {
      throw new AppointmentTerminalError();
    }
    // feature 00073 (มติ D3) — งานที่ปิดแล้วถูกล็อก (รวม walk-in ที่ไม่มีสถานะนัดให้เช็กข้างบน)
    if (current.serviceClosedAt != null) throw new ServiceJobClosedLockedError();

    const hadAppointment = !!current.serviceStart && !!current.serviceEnd;
    /**
     * feature 00086 (API.md §4.4) — แบบการมาถูกตัดสิน "ครั้งเดียว" ตอนใบได้เวลาครั้งแรก
     * เลื่อนนัด = ไม่แตะ (ลูกค้าจองมาหรือมาหน้าร้านไม่เปลี่ยนเพราะเวลาเลื่อน) · ใบเก่าที่มีเวลาแต่ไม่มีค่าเก็บ
     * ก็ไม่เติมให้ — ปล่อยให้ arrivalModeOf ใช้สูตรเดิม ไม่เดาทับข้อมูลเก่า
     */
    const nowMs = Date.now();
    const arrivalMode: StoredArrivalMode | undefined = hadAppointment
      ? undefined
      : firstScheduleArrivalMode(input.arrivalMode, input.start, nowMs);
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
        // undefined = ไม่แตะคอลัมน์ (เลื่อนนัด) · allocateSeat ด้านบนเขียน serviceStart แล้ว ⇒ CHECK ผ่าน
        arrivalMode,
      },
      select: {
        publicToken: true,
        serviceStart: true,
        serviceEnd: true,
        appointmentStatus: true,
        arrivalMode: true,
      },
    });

    const rescheduleCount = await tx.appointmentReschedule.count({
      where: { orderId: current.id },
    });

    // แจ้งลูกค้าอัตโนมัติ (00078) — เฉพาะ "ตั้งนัดครั้งแรก" ในอนาคต; การย้ายนัดไม่ส่ง · createOrder เป็นเจ้าของกรณีสร้างพร้อมนัด (SDS §7.3)
    // 00086 — เริ่มงานหน้าร้านไม่แจ้ง "จองคิวแล้ว" (กันไว้ตรง ๆ ไม่พึ่งว่าเวลาเริ่มไม่อยู่ในอนาคต)
    if (!hadAppointment && arrivalMode !== "WALK_IN" && input.start.getTime() > nowMs) {
      ledgerId = await reserveAutoNotifyIntent(tx, {
        shopId, orderId: current.id, conversationId: current.conversationId,
        kind: "SERVICE_BOOKED", isDryRun: current.isDryRun, keyedInAt: new Date(),
      });
    }

    return { ...updated, resource: { id: resource.id, name: resource.name }, rescheduleCount };
  });
  const id = ledgerId as string | null;
  if (id) runAfterResponse(() => dispatchAutoNotify(id));
  return result;
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
    /** feature 00086 — แบบการมา (ร้านบริการ) · null/ไม่ส่ง = ไม่แตะคอลัมน์ */
    arrivalMode?: StoredArrivalMode | null;
  },
): Promise<number> {
  assertValidRange(args.start, args.end);
  const { arrivalMode, ...seatArgs } = args;
  const seat = await allocateSeat(tx, seatArgs);
  await tx.order.update({
    where: { id: args.orderId },
    data: {
      type: APPOINTMENT_ORDER_TYPE,
      appointmentStatus: APPOINTMENT_STATUS.SCHEDULED,
      // เขียนหลัง allocateSeat (serviceStart มีแล้ว) — CHECK Order_arrivalMode_check
      arrivalMode: arrivalMode ?? undefined,
    },
  });
  return seat;
}

/** โหลดทรัพยากรสำหรับใช้ใน tx ของ order.service (ตรวจ active + ownership ก่อนเปิด tx) */
export async function resolveResourceForOrder(shopId: string, resourceId: string) {
  await assertShopCanUseAppointments(shopId);
  return loadActiveResource(shopId, resourceId);
}

/*
 * ทำเครื่องหมายผลของนัด (FR-RSV-09) — ย้ายไปเป็น "ปิดงาน" แล้ว (feature 00073)
 * ⇒ `closeServiceJob` ใน src/services/service-job.service.ts (ผล + เงิน + วันปิดงาน ในทรานแซกชันเดียว)
 * เดิมฟังก์ชันนี้ตั้งแค่ appointmentStatus ⇒ ไม่มีวันปิดงาน ยอดร้านบริการจึงไม่เข้า (ต้นเหตุยอดสะสม ฿0)
 */

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
      ...withoutDrafted("CANCELLED"),
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
      ...withoutDrafted("CANCELLED"),
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
      // 00086 (QA 2026-10-30) — ป้ายรายการวันบนบอร์ด: แบบการมา + ขั้นระหว่างทำงาน (ไม่ใช่ข้อมูลติดต่อ)
      arrivalMode: true,
      createdAt: true,
      serviceStartedAt: true,
      serviceFinishedAt: true,
      serviceClosedAt: true,
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
    arrivalMode: r.arrivalMode,
    createdAt: r.createdAt.toISOString(),
    serviceStartedAt: r.serviceStartedAt ? r.serviceStartedAt.toISOString() : null,
    serviceFinishedAt: r.serviceFinishedAt ? r.serviceFinishedAt.toISOString() : null,
    serviceClosedAt: r.serviceClosedAt ? r.serviceClosedAt.toISOString() : null,
  }));
}

/**
 * รายการนัดของ "หนึ่งวัน" พร้อมสิ่งที่ต้องใช้ติดต่อลูกค้า (ส่วนขยาย 2026-08-11)
 *
 * 🛑 ทำไมเป็นฟังก์ชันแยก ไม่ใช่เติม field เข้า `listAppointments` — TFR-010 (ฉบับแก้ 2026-08-11)
 * ปฏิทินยิงครั้งเดียวครอบ **ทั้งเดือน** ถ้าเติมเบอร์ลงตัวนั้น flight payload ของหน้า `/queues`
 * จะมีเบอร์ลูกค้าทั้งเดือน (ร้านที่ยุ่ง = 100–200 เบอร์) เพียงเพื่อแสดงผลวันเดียว
 * ตัวนี้รับช่วงแคบ ๆ และถูกเรียกเมื่อผู้ขายเปิดดูวันนั้นจริง ๆ เท่านั้น
 *
 * ยังไม่คืนอีเมล — ไม่มีจอไหนขอ (กฎ "ตัดที่ server boundary" ของ TFR-010 ข้อ 1–2 ยังบังคับเต็ม)
 */
export type AppointmentDayItem = {
  orderToken: string;
  orderNo: string | null;
  /**
   * เวลาที่เปิดบิล (feature ร้านบริการ 2026-08-16) — ใช้ derive "วิธีเข้ารับบริการ"
   * ตัวที่แยก "เดินเข้ามา" ออกจาก "จองล่วงหน้า" คือระยะห่างระหว่างเวลานัดกับเวลาเปิดบิล
   * ไม่ใช่ตัวเวลานัดเอง จึงต้องส่งมาคู่กันเสมอ
   */
  createdAt: Date;
  /** feature 00086 — แบบการมาที่ร้านเลือก (BOOKED|WALK_IN) · null = ใบเก่า/ไม่ได้ระบุ ⇒ จอใช้ arrivalModeOf */
  arrivalMode: string | null;
  start: Date;
  end: Date;
  appointmentStatus: string | null;
  buyerName: string | null;
  /** ช่องทางติดต่อที่ร้านกรอกไว้ (เบอร์เป็นหลัก) — null = ไม่มี ซึ่งเกิดปกติกับนัดที่ร้านคีย์เอง */
  buyerContact: string | null;
  resource: { id: string; name: string; capacity: number } | null;
  /** เธรดแชทที่ลูกค้าทักเข้ามา — null = ใบนี้ไม่ได้เกิดจากแชท ⇒ ไม่มีเธรดให้เปิด */
  source: { channel: string; pageName: string; pageAvatarUrl: string | null } | null;
  /**
   * ช่องทางการขายที่ร้านเลือกเองตอนสร้าง (`STOREFRONT|FACEBOOK|LINE|TIKTOK|OTHER`) — ค่าตั้งต้น
   * ของฟอร์มคือ `STOREFRONT` จึงมีค่าเกือบทุกใบ
   *
   * 🛑 คนละเรื่องกับ `source` โดยสิ้นเชิง (สคีมาเตือนไว้ตรงตัวว่าห้ามใช้แทนกัน): `source` คือ
   * *ข้อเท็จจริง* ว่าใบนี้เกิดจากเธรดไหน · ตัวนี้คือ *หมวดที่ร้านเลือก/แก้เองได้*
   * ที่ต้องส่งทั้งคู่เพราะการ์ดตอบคำถาม "ลูกค้ามาจากไหน" — มีเธรดก็บอกเธรด ไม่มีก็บอกหมวดที่ร้านระบุ
   * ⇒ ไม่ต้องประดิษฐ์คำสำหรับเคส "ไม่มีเธรด" เลยสักคำ (user เคาะ 2026-08-12)
   */
  salesChannel: string | null;
  /**
   * รูปโปรไฟล์ลูกค้าในช่องทางนั้น
   *
   * 🛑 null เป็นค่าปกติ ไม่ใช่ข้อผิดพลาด — Messenger ถูก Meta บล็อกรูปทั้งหมดอยู่ (ต้องได้
   * Advanced Access ของ Business Asset User Profile Access ก่อน) ฝั่ง UI จึงต้องออกแบบให้
   * "ตัวย่อ" เป็นของหลัก ไม่ใช่ของสำรอง — ดูคอมเมนต์ที่ ExternalContact.avatarUrl ในสคีมา
   */
  customerAvatarUrl: string | null;
  /** เธรดแชทของลูกค้าคนนี้ในช่องทางนั้น — null = ไม่มีให้เปิด ⇒ UI ห้าม render ปุ่มทักแชท */
  conversationId: string | null;
  /**
   * ชื่อรายการแรกในบิล + จำนวนรายการทั้งหมด — "งานนี้คืองานอะไร"
   *
   * 🛑 นี่คือสิ่งเดียวที่ทำให้นัดสองใบในช่วงเวลาเดียวกันต่างกันจริง (ก่อนหน้านี้แยกได้แค่ด้วยชื่อคน)
   * ส่งแค่ชื่อแรก + ตัวนับ ไม่ส่งทั้งอาเรย์ — การ์ดแสดงบรรทัดเดียว การส่งรายการเต็มคือ payload
   * ที่ไม่มีใครอ่านและบวมตามจำนวนสินค้าในบิล
   */
  firstItemName: string | null;
  itemCount: number;
  /** ยอดรวมของบิล (string เพราะ Decimal ข้าม RSC boundary ไม่ได้) */
  totalAmount: string;
  /**
   * ยอดมัดจำที่ตกลงไว้ — snapshot ตอนสร้าง (BR-RSV-46)
   *
   * 🛑 **ไม่ใช่สถานะการจ่าย** ระบบไม่ติดตามว่าจ่ายแล้วหรือยังเลย (BR-RSV-50) UI จึงพูดได้แค่
   * "มัดจำ ฿900" ห้ามเขียน "จ่ายมัดจำแล้ว"/"ค้างมัดจำ" เด็ดขาด — จะเป็นการกุข้อมูลที่ไม่มีอยู่จริง
   * · "0" = ไม่เก็บมัดจำ (BR-RSV-44) ⇒ ไม่ต้องแสดงส่วนมัดจำเลย
   */
  depositAmount: string;
  /**
   * feature 00086 P3 — ผู้รับผิดชอบงาน (ชื่ออย่างเดียว ไม่มีเบอร์/อีเมล) · null = ยังไม่มีคนรับ
   * คน ไม่ใช่เงิน ⇒ ช่าง (ระดับเงิน NONE) ได้คีย์นี้ (toNoMoneyAppointmentDay ตัดแค่ยอด/มัดจำ)
   */
  assignee: { userId: string; displayName: string } | null;
  /** feature 00086 P3 — เวลากดเริ่มงาน / ทำเสร็จ / ปิดงาน (เวลา ไม่ใช่เงิน) · null = ยังไม่ถึงขั้นนั้น */
  serviceStartedAt: Date | null;
  serviceFinishedAt: Date | null;
  serviceClosedAt: Date | null;
};

/**
 * select เดียวของ "แถวนัดรายวัน" — ใช้ทั้งรายการของวัน และกลุ่ม "ค้างจากวันก่อน" (00086 P3)
 * 🛑 ห้ามแยก select สองชุด: สองจอแสดงการ์ดแบบเดียวกัน คอลัมน์ที่เติมฝั่งเดียวคือแถวที่ขาดข้อมูลเงียบ ๆ
 */
const APPOINTMENT_DAY_SELECT = {
  publicToken: true,
  orderNo: true,
  createdAt: true,
  arrivalMode: true,
  serviceStart: true,
  serviceEnd: true,
  appointmentStatus: true,
  buyerName: true,
  buyerContact: true,
  customerId: true,
  shopChannelId: true,
  salesChannel: true,
  // ห้องแชทต้นทางของออเดอร์ใบนี้ (คอลัมน์ที่ main เพิ่ม 2026-08-12) — ดู `originIds` ด้านล่าง
  conversationId: true,
  totalAmount: true,
  depositAmount: true,
  // ชื่อรายการแรกเท่านั้น + นับทั้งหมดแยก — ไม่ดึงทั้งบิลมาเพื่อแสดงบรรทัดเดียว
  items: { select: { name: true }, orderBy: { id: "asc" }, take: 1 },
  _count: { select: { items: true } },
  serviceResource: { select: { id: true, name: true, capacity: true } },
  // ห้าม select ทั้งแถวของ ShopChannel — แถวเดียวกันมี accessTokenEnc อยู่
  shopChannel: { select: { provider: true, name: true, avatarUrl: true } },
  // 00086 P3 — ผู้รับผิดชอบ (ชื่อเท่านั้น) + ขั้นของงาน
  assignedUserId: true,
  assignedUser: { select: { displayName: true } },
  serviceStartedAt: true,
  serviceFinishedAt: true,
  serviceClosedAt: true,
} satisfies Prisma.OrderSelect;

type AppointmentDayRow = Prisma.OrderGetPayload<{ select: typeof APPOINTMENT_DAY_SELECT }>;

export async function listAppointmentsForDay(args: {
  shopId: string;
  from: Date;
  to: Date;
  resourceId?: string | null;
}): Promise<AppointmentDayItem[]> {
  const { shopId, from, to, resourceId } = args;
  await assertShopCanUseAppointments(shopId);

  const rows = await prisma.order.findMany({
    where: {
      shopId,
      serviceResourceId: resourceId ? resourceId : { not: null },
      ...withoutDrafted("CANCELLED"),
      serviceStart: { lt: to },
      serviceEnd: { gt: from },
    },
    select: APPOINTMENT_DAY_SELECT,
    orderBy: { serviceStart: "asc" },
  });

  return toAppointmentDayItems(shopId, rows);
}

/**
 * งานของฉันที่ "ค้างจากวันก่อน" (00086 P3 · มติ user Q2 2026-10-27) — หน้า "งานของฉัน" ของช่าง
 *
 * = มอบให้ฉัน ∧ กดเริ่มแล้ว ∧ ยังไม่ทำเสร็จ ∧ ยังไม่ปิด ∧ ไม่ยกเลิก/คืน ∧ นัดจบก่อนวันนี้ (ปฏิทินไทย)
 *
 * 🛑 "จบก่อนวันนี้" (serviceEnd ≤ เที่ยงคืนวันนี้) ไม่ใช่แค่ "เริ่มก่อนวันนี้": นัดที่คร่อมเมื่อวาน→วันนี้
 * อยู่ในรายการของวันนี้ (`listAppointmentsForDay` คัดแบบคาบเกี่ยว) อยู่แล้ว ถ้านับซ้ำที่นี่จอจะขึ้นงานเดียวสองที่
 * ⇒ สองรายการนี้ไม่ซ้อนกันเสมอ และงานที่เริ่มแล้วไม่หายจากหน้าเพราะข้ามวัน
 * ขอบวันจาก `appointmentDayBounds` ตัวเดียวกับไทล์/รายการ "วันนี้" (ห้ามตัดวันเองที่นี่ — บทเรียน 00033)
 *
 * ไม่บังคับ serviceResourceId (ต่างจากรายการรายวัน): งานที่เริ่มแล้วของฉันต้องไม่หายเพราะคิวถูกถอดภายหลัง
 * แต่ต้องมี serviceEnd (เงื่อนไขขอบวันบังคับให้มีอยู่แล้ว) — แถวรุ่นเก่าที่ไม่มีช่วงเวลาไม่มีผู้รับผิดชอบอยู่แล้ว (P3 ใหม่กว่า)
 * เพดาน 100 แถว: endpoint นี้คืนเบอร์ลูกค้า — เพดานต้องอยู่ที่ server ไม่ใช่ความตั้งใจของผู้เรียก (เหตุผลเดียวกับ day route)
 *
 * ร้านไม่ใช่บริการ → AppointmentFeatureUnavailableError (เหมือนรายการรายวัน)
 */
export const CARRY_OVER_LIMIT = 100;

export async function listMyCarryOverJobs(args: {
  shopId: string;
  userId: string;
  now?: Date;
}): Promise<AppointmentDayItem[]> {
  const { shopId, userId } = args;
  await assertShopCanUseAppointments(shopId);
  const { from: todayStart } = appointmentDayBounds("today", args.now);

  const rows = await prisma.order.findMany({
    where: {
      shopId,
      assignedUserId: userId,
      ...withoutDrafted(["CANCELLED", "RETURNED"]),
      serviceStartedAt: { not: null },
      serviceFinishedAt: null,
      serviceClosedAt: null,
      serviceStart: { lt: todayStart },
      serviceEnd: { lte: todayStart },
    },
    select: APPOINTMENT_DAY_SELECT,
    orderBy: { serviceStart: "asc" },
    take: CARRY_OVER_LIMIT,
  });

  return toAppointmentDayItems(shopId, rows);
}

/**
 * งานของฉันที่ "ยังไม่ระบุเวลา" (00086 P3 · M1 · Controller decision (a) 2026-10-29) — หน้า "งานของฉัน" ของช่าง
 *
 * = มอบให้ฉัน ∧ ไม่มีเวลานัด (serviceStart IS NULL) ∧ ยังไม่ปิด ∧ ไม่ใช่ร่าง/ยกเลิก/คืน (withoutDrafted ชุดเดียวกับ carry-over)
 * ทำไมต้องมี: ใบที่ไม่มีเวลาไม่อยู่ทั้งรายการวันนี้ (คัดด้วยช่วงเวลา) และค้างจากวันก่อน (คัดด้วย serviceEnd)
 * ⇒ งานที่มอบให้ช่างแล้วแต่ไม่มีเวลา "หายจากทุกจอของช่าง" ทั้งที่เป็นงานของเขา
 * ไม่จำกัดว่าเริ่มแล้วหรือยัง (ต่างจาก carry-over) — ใบไม่มีเวลาไม่มีวันไหนให้โผล่เลย ต้องเห็นตั้งแต่ถูกมอบ
 * ไม่บังคับ serviceResourceId (เหตุผลเดียวกับ carry-over) · เพดานเดียวกับ carry-over (endpoint คืนเบอร์ลูกค้า)
 * แถวที่คืน start/end = null (ไม่มีเวลาให้แสดง — จอใช้ป้าย "ยังไม่ระบุเวลา" ของ ARRIVAL_MODE_META แทน)
 *
 * ร้านไม่ใช่บริการ → AppointmentFeatureUnavailableError (เหมือนรายการรายวัน)
 */
export type UnscheduledJobItem = Omit<AppointmentDayItem, "start" | "end"> & { start: null; end: null };

export async function listMyUnscheduledJobs(args: {
  shopId: string;
  userId: string;
}): Promise<UnscheduledJobItem[]> {
  const { shopId, userId } = args;
  await assertShopCanUseAppointments(shopId);

  const rows = await prisma.order.findMany({
    where: {
      shopId,
      assignedUserId: userId,
      ...withoutDrafted(["CANCELLED", "RETURNED"]),
      serviceStart: null,
      serviceClosedAt: null,
    },
    select: APPOINTMENT_DAY_SELECT,
    orderBy: { createdAt: "asc" },
    take: CARRY_OVER_LIMIT,
  });

  // toAppointmentDayItems เขียน start/end จาก serviceStart/serviceEnd — แถวกลุ่มนี้ไม่มีเวลา จึงตั้ง null ให้ชัด
  return (await toAppointmentDayItems(shopId, rows)).map((i) => ({ ...i, start: null, end: null }));
}

/** แถวนัด (select ร่วม) → AppointmentDayItem พร้อมรูปลูกค้า/ห้องแชท — ownership scope ด้วย shopId ทุกคำขอลูก */
async function toAppointmentDayItems(shopId: string, rows: AppointmentDayRow[]): Promise<AppointmentDayItem[]> {
  /**
   * รูปโปรไฟล์ + เธรดแชท: Order → คู่ (shopChannelId, customerId) → ExternalContact
   *
   * 🛑 ต้องใช้ **คู่** เป็นคีย์ ห้ามหาด้วย customerId อย่างเดียว — PSID เป็น page-scoped
   * (`@@unique([shopChannelId, externalUserId])`) ลูกค้าคนเดียวที่ทักมาสองเพจมีคนละ contact
   * คนละรูป การจับด้วย customerId เฉย ๆ จะเอารูปจากเพจอื่นมาแปะ
   */
  const linkable = rows.filter((r) => r.shopChannelId && r.customerId);
  const contacts = linkable.length
    ? await prisma.externalContact.findMany({
        where: {
          shopChannelId: {
            in: [...new Set(linkable.map((r) => r.shopChannelId!))],
          },
          customerId: { in: [...new Set(linkable.map((r) => r.customerId!))] },
          // ownership scope ใน WHERE เสมอ ไม่พึ่งว่า id พวกนี้มาจากแถวของร้านตัวเองอยู่แล้ว
          // (feedback_rsc_dal_authz)
          channel: { shopId },
        },
        select: {
          shopChannelId: true,
          customerId: true,
          avatarUrl: true,
          // เธรดล่าสุดของ contact นี้ — ปุ่ม "ทักแชท" ต้องพาไปห้องที่มีบทสนทนาอยู่จริง
          conversations: {
            select: { id: true },
            orderBy: { lastMessageAt: "desc" },
            take: 1,
          },
        },
      })
    : [];

  const byPair = new Map(
    contacts.map((c) => [`${c.shopChannelId}:${c.customerId}`, c]),
  );

  /**
   * ห้องต้นทางของออเดอร์ — ชนะห้องที่ derive จากลูกค้าเสมอถ้ารู้
   *
   * 🛑 การหาห้องด้วย "contact ของลูกค้าคนนี้ แล้วเอาห้องที่คุยล่าสุด" **เลือกผิดห้องทันทีที่ลูกค้า
   * คนเดียวกันทักมาสองเพจ** แล้วเพจที่คุยล่าสุดไม่ใช่เพจที่นัดเกิดขึ้น — บั๊กเดียวกันนี้ถูกปิดไปแล้ว
   * ที่ `GET /api/orders/[token]/appointment-summary` (commit 21d72638) ด้วยคอลัมน์ `Order.conversationId`
   * ที่นี่จึงต้องใช้กติกาเดียวกัน ไม่ใช่ปล่อยให้เป็นนิยามที่สองของคำว่า "ห้องแชทของลูกค้า" (HR16)
   *
   * ยัง fallback ไป contact ได้ เพราะคอลัมน์นี้เพิ่งเพิ่ม 2026-08-12 — นัดที่สร้างก่อนหน้านั้น
   * เป็น null ทั้งหมด ถ้าตัด fallback ทิ้ง ปุ่ม "ทักแชท" จะหายไปจากออเดอร์เก่าทุกใบ
   *
   * ownership อยู่ใน WHERE เสมอ — ไม่เชื่อค่าในคอลัมน์ฝ่ายเดียวว่าเป็นห้องของร้านนี้จริง
   */
  const originIds = [
    ...new Set(rows.map((r) => r.conversationId).filter((v): v is string => !!v)),
  ];
  const validOrigin = originIds.length
    ? new Set(
        (
          await prisma.conversation.findMany({
            where: { id: { in: originIds }, shopId },
            select: { id: true },
          })
        ).map((c) => c.id),
      )
    : new Set<string>();

  return rows.map((r) => {
    const contact =
      r.shopChannelId && r.customerId
        ? (byPair.get(`${r.shopChannelId}:${r.customerId}`) ?? null)
        : null;
    return {
      orderToken: r.publicToken,
      orderNo: r.orderNo,
      createdAt: r.createdAt,
      arrivalMode: r.arrivalMode,
      start: r.serviceStart!,
      end: r.serviceEnd!,
      appointmentStatus: r.appointmentStatus,
      buyerName: r.buyerName,
      buyerContact: r.buyerContact,
      resource: r.serviceResource,
      source: r.shopChannel
        ? {
            channel: r.shopChannel.provider,
            pageName: r.shopChannel.name,
            pageAvatarUrl: r.shopChannel.avatarUrl,
          }
        : null,
      salesChannel: r.salesChannel,
      firstItemName: r.items[0]?.name ?? null,
      itemCount: r._count.items,
      // Decimal → string ที่ server boundary เสมอ (ข้าม RSC ไม่ได้)
      totalAmount: r.totalAmount.toString(),
      depositAmount: r.depositAmount?.toString() ?? "0",
      customerAvatarUrl: contact?.avatarUrl ?? null,
      conversationId:
        r.conversationId && validOrigin.has(r.conversationId)
          ? r.conversationId
          : (contact?.conversations[0]?.id ?? null),
      assignee:
        r.assignedUserId && r.assignedUser
          ? { userId: r.assignedUserId, displayName: r.assignedUser.displayName }
          : null,
      serviceStartedAt: r.serviceStartedAt,
      serviceFinishedAt: r.serviceFinishedAt,
      serviceClosedAt: r.serviceClosedAt,
    };
  });
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
 * 🛑 2026-08-10: นิยามย้ายไป `src/lib/appointment-day.ts` ทั้งก้อน — ตัวเลขบนไทล์กับจำนวนแถว
 * ที่ตัวกรอง `?apptDay=` คัดได้ ต้องมาจากนิยามเดียวกัน (BR-SOV-06).
 * 🛑 2026-08-15 (AC-SQ-05): ไทล์เปลี่ยนปลายทางไป `/queues` แล้ว ตัวนับยังใช้นิยามเดิมทุกประการ
 * — เลขตรงกับตารางงานเพราะ `serviceStart`/`serviceResourceId` ถูกเขียนคู่กันเสมอโดย `allocateSeat()`. พร้อมกันนั้นเกณฑ์คัดเปลี่ยนจาก `serviceResourceId != null` เป็น `serviceStart != null`
 * ให้ตรงกับที่รายการใช้ — ของเดิมสองที่ไม่ตรงกันอยู่แล้วสำหรับนัดที่ถูกถอด resource ออกภายหลัง
 */
export async function getTodayAppointmentCount(shopId: string): Promise<number> {
  return prisma.order.count({
    where: { shopId, ...appointmentDayWhere("today") },
  });
}
