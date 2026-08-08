/**
 * chat-service-progress — adapter ของ deriveAppointmentStage สำหรับแถบสถานะออเดอร์ในห้องแชท
 * ฝั่งร้าน SERVICE_QUEUE (user report 2026-08-08)
 *
 * คู่ขนานกับ chat-order-progress.ts ฝั่งขนส่งแบบตั้งใจ — แยกไฟล์เพราะไฟล์นั้นประกาศตัวเอง
 * ในหัวไฟล์ว่าเป็น "adapter ของ deriveShippingStage" ตรงตัว การยัดตรรกะคนละแกนเข้าไป
 * จะทำให้ชื่อไฟล์โกหก (mirror pattern เดียวกับที่ appointment-stage.ts แยกจาก order-stage.ts)
 *
 * pure module — ห้าม import prisma/server-only (ใช้ทั้งฝั่ง server enrich และ client render)
 *
 * ทำไมต้องมีไฟล์นี้: ก่อนหน้านี้ห้องแชทรู้จักแกนเดียวคือ "ของอยู่ไหน" ร้านคิวงานที่ไม่เคยส่งของ
 * เลยจึงถูกบอกว่า "รอเลขพัสดุ" ทุกใบตลอดกาล — และไม่ใช่แค่คำผิด: filterActiveOrders ของแกน
 * ขนส่งตัดสิน "ใบไหนยังเป็นงานค้าง" ด้วยเกณฑ์เดียวกัน ออเดอร์บริการจึงไม่มีวันหลุดจากรายการ
 *
 * [สำคัญ] ตัวนับ/ตัวกรอง/ป้าย ต้องมาจากฟังก์ชันในไฟล์นี้เท่านั้น ห้ามเขียนเงื่อนไขซ้ำที่ component
 * (บทเรียนตรงจาก deriveShippingStage — order-stage.ts บรรทัด 82-84)
 *
 * [สำคัญ] ห้ามตั้งคำใหม่ — ป้ายทุกตัวมาจาก APPOINTMENT_STATUS_LABEL / ORDER_STATUS_META
 * ที่มีอยู่แล้ว (BR-SOV-03) ปฏิทินคิวงาน หน้า /orders และห้องแชท ต้องเรียกสถานะเดียวกัน
 * ด้วยคำเดียวกัน
 */

import { APPOINTMENT_STAGE_META, deriveAppointmentStage } from "./appointment-stage";
import { isTerminalAppointmentStatus, type AppointmentStatus } from "./appointments";
import { ORDER_STATUS_META } from "./order-display";

/**
 * กองของออเดอร์บริการ 1 ใบ
 *
 * PENDING = ใบที่ไม่มีนัดผูก (walk-in) แต่ยังเปิดอยู่ — **ไม่ใช่** กองของแกนนัด แต่เป็น
 * "ยังเป็นงานค้างของ Order.status" ตาม BR-RSV-04 ที่ยืนยันว่า walk-in เดินเส้นทางปกติทุกอย่าง
 * ไม่มีเหตุผลจะซ่อนออกจากรายการงานค้างเพียงเพราะไม่มีนัด
 *
 * DONE = ไม่ใช่งานค้าง (จบแล้ว/ยกเลิก/ให้บริการแล้ว/ไม่มาตามนัด) — หายจากรายการทันที
 * ไม่มีช่วงค้างแสดงแบบ DELIVERED_VISIBLE_MS เพราะนั่นเป็นกติกาของ deriveOrderStage
 * (ป้ายในแถวรายการแชท) คนละฟังก์ชันกับ filterActiveOrders ที่ของเราเทียบเคียงด้วย
 */
export type ServiceProgressStageKey =
  | Exclude<AppointmentStatus, "COMPLETED" | "NO_SHOW">
  | "PENDING"
  | "DONE";

export interface ServiceProgressOrderInput {
  status: string;
  serviceStart?: string | Date | null;
  appointmentStatus?: string | null;
}

export function serviceProgressStage(
  o: ServiceProgressOrderInput,
): ServiceProgressStageKey {
  if (o.status === "CANCELLED") return "DONE";
  const stage = deriveAppointmentStage({
    serviceStart: o.serviceStart ?? null,
    appointmentStatus: o.appointmentStatus ?? null,
  });
  if (stage) {
    if (isTerminalAppointmentStatus(stage)) return "DONE";
    // บรรทัดบนตัด COMPLETED/NO_SHOW ออกไปแล้ว แต่ isTerminalAppointmentStatus เป็นฟังก์ชัน
    // คืน boolean ไม่ใช่ type guard TS จึงยังไม่แคบชนิดให้ — ยืนยันด้วย cast ตรงนี้แทนการ
    // เขียนรายชื่อสถานะซ้ำ (รายชื่อต้องอยู่ที่ TERMINAL_APPOINTMENT_STATUSES ที่เดียว)
    return stage as Exclude<AppointmentStatus, "COMPLETED" | "NO_SHOW">;
  }
  // ไม่มีนัดผูก (walk-in) — ตกกลับไปใช้สถานะออเดอร์ตามปกติ
  if (o.status === "CONFIRMED") return "DONE";
  return "PENDING";
}

/** เฉพาะใบที่ยังเป็นงานค้าง — ลำดับคงเดิมตามที่ caller เรียงมา (ล่าสุดก่อน) */
export function filterActiveServiceOrders<T extends ServiceProgressOrderInput>(
  orders: T[],
): T[] {
  return orders.filter((o) => serviceProgressStage(o) !== "DONE");
}

/**
 * ป้าย/สี/ไอคอนของแต่ละกอง — ยกจาก SSOT ที่มีอยู่แล้วทั้งหมด ไม่ประกาศคำหรือสีใหม่แม้แต่ช่องเดียว
 *
 * PENDING ใช้ ORDER_STATUS_META.PENDING (ของ Order.status) เพราะใบ walk-in ไม่มีสถานะนัด
 * ให้อ้าง — เป็นการ reuse SSOT อีกตัว ไม่ใช่การตั้งคำใหม่
 */
export const SERVICE_STAGE_CHIP_META: Record<
  Exclude<ServiceProgressStageKey, "DONE">,
  { label: string; cls: string; icon: string }
> = {
  SCHEDULED: APPOINTMENT_STAGE_META.SCHEDULED,
  CONFIRMED_BY_BUYER: APPOINTMENT_STAGE_META.CONFIRMED_BY_BUYER,
  RESCHEDULE_REQUESTED: APPOINTMENT_STAGE_META.RESCHEDULE_REQUESTED,
  PENDING: {
    label: ORDER_STATUS_META.PENDING.label,
    cls: ORDER_STATUS_META.PENDING.cls,
    icon: ORDER_STATUS_META.PENDING.icon,
  },
};
