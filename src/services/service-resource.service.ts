import { prisma } from "@/lib/prisma";
import { isForeignKeyRestrictViolation } from "@/lib/prisma-errors";
import {
  CapacityReductionBlockedError,
  ServiceResourceHasAppointmentsError,
  ServiceResourceNotFoundError,
} from "@/lib/appointments";
import { assertShopCanUseAppointments } from "@/services/appointment.service";

// ทรัพยากรที่จองเวลาได้ (feature 00024)
// SSOT: docs/20 - Features/00024 - Service Appointment Booking/{BRD,SRS,SDS,API}.md
//
// ทุกฟังก์ชัน scope shopId ใน where ตั้งแต่ query แรกเสมอ (บทเรียน feedback_rsc_dal_authz)

const RESOURCE_SELECT = {
  id: true,
  name: true,
  description: true,
  durationMinutes: true,
  capacity: true,
  // มัดจำเริ่มต้น (FR-RSV-12) — UI ใช้เติมยอดให้อัตโนมัติตอนเลือกทรัพยากรในฟอร์มสร้างออเดอร์
  depositMode: true,
  depositValue: true,
  isActive: true,
} as const;

export async function listServiceResources(
  shopId: string,
  // publicOnly — feature 00053 (TFR-003): เอาเฉพาะบริการที่ร้านเลือกให้โชว์บนหน้าร้าน
  // 🛑 opt-in เท่านั้น — ผู้เรียกส่วนใหญ่เป็นหลังร้าน (หน้าสร้างออเดอร์ · แผงคิวงานในแชท ·
  // /queues · /settings/job-types · API shop-context) ซึ่งต้องเห็นบริการครบทุกรายการ
  // คนละแกนกับ activeOnly ("ยังรับนัดไหม") — ส่งพร้อมกันได้และมักส่งคู่กันบนหน้าสาธารณะ
  opts?: { activeOnly?: boolean; publicOnly?: boolean },
) {
  await assertShopCanUseAppointments(shopId);
  return prisma.serviceResource.findMany({
    where: {
      shopId,
      ...(opts?.activeOnly ? { isActive: true } : {}),
      ...(opts?.publicOnly ? { showOnProfile: true } : {}),
    },
    select: RESOURCE_SELECT,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
}

/**
 * ทรัพยากรหนึ่งหน่วยสำหรับหน้าแก้ไข
 *
 * IMPORTANT: scope shopId ใน where ตั้งแต่ query แรก — ทรัพยากรของร้านอื่นจะไม่ถูกอ่าน
 * ขึ้นมาเลย ไม่ใช่อ่านแล้วค่อยเช็คสิทธิ์ทีหลัง (ข้อมูลจะไหลเข้า RSC payload ไปก่อนถูกปฏิเสธ
 * — บทเรียน feedback_rsc_dal_authz)
 */
export async function getServiceResource(shopId: string, resourceId: string) {
  await assertShopCanUseAppointments(shopId);
  const resource = await prisma.serviceResource.findFirst({
    where: { id: resourceId, shopId },
    select: RESOURCE_SELECT,
  });
  if (!resource) throw new ServiceResourceNotFoundError();
  return resource;
}

/**
 * แปลง Decimal → string ก่อนข้าม RSC boundary
 *
 * IMPORTANT: ส่ง Prisma.Decimal ตรง ๆ เข้า client component จะ crash ตอน runtime
 * แม้ tsc จะผ่าน (มิเรอร์ serializeRoom ของ feature 00017 ด้วยเหตุผลเดียวกัน)
 */
export function serializeServiceResource(resource: {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number | null;
  capacity: number;
  depositMode: string;
  depositValue: { toFixed(dp: number): string };
  isActive: boolean;
}) {
  return {
    id: resource.id,
    name: resource.name,
    description: resource.description,
    durationMinutes: resource.durationMinutes,
    capacity: resource.capacity,
    depositMode: resource.depositMode,
    depositValue: resource.depositValue.toFixed(2),
    isActive: resource.isActive,
  };
}

export type SerializedServiceResource = ReturnType<typeof serializeServiceResource>;

export async function createServiceResource(
  shopId: string,
  input: {
    name: string;
    description?: string | null;
    durationMinutes?: number | null;
    capacity?: number;
    depositMode?: "FIXED" | "PERCENT";
    depositValue?: string;
  },
) {
  await assertShopCanUseAppointments(shopId);
  return prisma.serviceResource.create({
    data: {
      shopId,
      name: input.name,
      description: input.description ?? null,
      durationMinutes: input.durationMinutes ?? null,
      // ค่าเริ่มต้น 1 = ร้านที่ไม่สนใจเรื่องความจุไม่ต้องตั้งค่าอะไรเลย (BR-RSV-06)
      capacity: input.capacity ?? 1,
      // ค่าเริ่มต้น FIXED/0 = "ไม่เก็บมัดจำ" — ร้านที่ไม่ใช้เรื่องนี้ไม่ต้องตั้งอะไรเลย (BR-RSV-44)
      depositMode: input.depositMode ?? "FIXED",
      depositValue: input.depositValue ?? "0",
    },
    select: RESOURCE_SELECT,
  });
}

export async function updateServiceResource(
  shopId: string,
  resourceId: string,
  input: {
    name?: string;
    description?: string | null;
    durationMinutes?: number | null;
    capacity?: number;
    depositMode?: "FIXED" | "PERCENT";
    depositValue?: string;
    isActive?: boolean;
  },
) {
  await assertShopCanUseAppointments(shopId);

  const current = await prisma.serviceResource.findFirst({
    where: { id: resourceId, shopId },
    select: { id: true, capacity: true },
  });
  if (!current) throw new ServiceResourceNotFoundError();

  // ลดความจุ — ต้องไม่มีนัดที่ยังไม่ผ่านซึ่งใช้ที่นั่งเกินความจุใหม่ (BR-RSV-06.2)
  //
  // IMPORTANT: เกณฑ์นี้เข้มกว่าที่ BRD เขียนไว้เล็กน้อยเมื่อ "ที่นั่งเป็นรู"
  // เช่น ความจุ 3 มีนัดที่นั่ง 2 กับ 3 → จำนวนนัดจริง 2 แต่ลดเหลือ 2 ไม่ได้
  // เป็นข้อจำกัดที่ทราบและยอมรับแล้ว ดู DATABASE.md §4.4
  // ข้อความที่ผู้ใช้เห็นต้องเป็นภาษาธุรกิจ ห้ามพูดถึงคำว่า "ที่นั่ง" (กลไกภายใน)
  if (input.capacity !== undefined && input.capacity < current.capacity) {
    const blocking = await prisma.order.findFirst({
      where: {
        serviceResourceId: resourceId,
        shopId,
        status: { not: "CANCELLED" },
        serviceSeat: { gt: input.capacity },
        serviceEnd: { gt: new Date() }, // นัดที่ผ่านไปแล้วไม่บล็อก
      },
      select: { orderNo: true, serviceStart: true, serviceEnd: true },
      orderBy: { serviceStart: "asc" },
    });
    if (blocking) {
      throw new CapacityReductionBlockedError({
        orderNo: blocking.orderNo,
        start: blocking.serviceStart!,
        end: blocking.serviceEnd!,
      });
    }
  }

  return prisma.serviceResource.update({
    where: { id: current.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.durationMinutes !== undefined
        ? { durationMinutes: input.durationMinutes }
        : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
      // แก้มัดจำเริ่มต้นได้ตลอด — ไม่กระทบยอดของออเดอร์ที่สร้างไปแล้ว เพราะยอดถูก
      // snapshot ไว้ที่ Order.depositAmount ตั้งแต่ตอนสร้าง (BR-RSV-46)
      ...(input.depositMode !== undefined ? { depositMode: input.depositMode } : {}),
      ...(input.depositValue !== undefined ? { depositValue: input.depositValue } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    select: RESOURCE_SELECT,
  });
}

/**
 * ลบทรัพยากร — ทำได้เฉพาะที่ไม่มีนัดผูกอยู่ (BR-RSV-08)
 *
 * ตัวบังคับจริงคือ FK ON DELETE RESTRICT ที่ระดับฐานข้อมูล ไม่ใช่การนับในแอป
 * (การนับก่อนลบมีช่องว่างเหมือนกัน) — ที่นี่แค่แปลง error ให้เป็นข้อความที่ผู้ใช้เข้าใจ
 */
export async function deleteServiceResource(shopId: string, resourceId: string) {
  await assertShopCanUseAppointments(shopId);

  const current = await prisma.serviceResource.findFirst({
    where: { id: resourceId, shopId },
    select: { id: true },
  });
  if (!current) throw new ServiceResourceNotFoundError();

  try {
    await prisma.serviceResource.delete({ where: { id: current.id } });
  } catch (err) {
    if (isForeignKeyRestrictViolation(err)) {
      throw new ServiceResourceHasAppointmentsError();
    }
    throw err;
  }
}

/** จำนวนนัดที่ผูกกับทรัพยากรนี้ — ใช้ประกอบข้อความตอนลบไม่ได้ */
export async function countAppointmentsForResource(shopId: string, resourceId: string) {
  return prisma.order.count({
    where: { serviceResourceId: resourceId, shopId, status: { not: "CANCELLED" } },
  });
}
