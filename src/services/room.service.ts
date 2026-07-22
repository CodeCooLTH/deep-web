import { Prisma, type Room } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MAX_ROOM_IMAGES } from "@/lib/lodging";

// Lodging Vertical (feature 00017 Phase 1) — business logic ของห้องพัก
// SSOT: docs/20 - Features/00017 - Lodging Vertical/{BRD,SRS,SDS,API}.md
//
// IMPORTANT: ทุกฟังก์ชันรับ shopId เป็นพารามิเตอร์แรกและใส่ใน where เสมอ —
// ห้ามใช้ pattern `findUnique(roomId)` แล้วค่อยเช็คความเป็นเจ้าของทีหลัง เพราะข้อมูลจะถูก
// serialize เข้า RSC payload ไปแล้วก่อนถูกปฏิเสธ (feedback_rsc_dal_authz)

export class NotLodgingShopError extends Error {
  constructor() {
    super("NOT_LODGING_SHOP");
    this.name = "NotLodgingShopError";
  }
}

export class RoomNotFoundError extends Error {
  constructor() {
    super("ROOM_NOT_FOUND");
    this.name = "RoomNotFoundError";
  }
}

export class TooManyRoomImagesError extends Error {
  constructor() {
    super("TOO_MANY_ROOM_IMAGES");
    this.name = "TooManyRoomImagesError";
  }
}

export interface RoomInput {
  name: string;
  description?: string;
  images?: string[];
  pricePerNight: string;
  maxGuests?: number;
  facilities?: string[];
  depositMode?: "FIXED" | "PERCENT";
  depositValue?: string;
}

export type RoomUpdateInput = Partial<RoomInput> & { isActive?: boolean };

/**
 * assertLodgingShop — TFR-001: ทุก endpoint ของโดเมนบ้านพักต้องผ่านด่านนี้ "ก่อน" ตรรกะอื่น
 * ร้าน GENERAL เรียกได้ = 403 ไม่ใช่แค่ไม่เห็นเมนู (BR-LODG-03 — ซ่อนเมนูไม่ใช่การควบคุมสิทธิ์)
 */
export async function assertLodgingShop(shopId: string): Promise<void> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { vertical: true },
  });
  if (!shop || shop.vertical !== "LODGING") throw new NotLodgingShopError();
}

/** images เก็บเป็น Json — normalize ให้เป็น string[] เสมอตอนอ่านออกมา (มิเรอร์ Product.images) */
function parseImages(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

function assertImageLimit(images?: string[]): void {
  if (images && images.length > MAX_ROOM_IMAGES) throw new TooManyRoomImagesError();
}

/** แปลง input → payload ของ Prisma; เงินเป็น string → Decimal (ห้ามผ่าน number กันคลาดเคลื่อน) */
function toRoomData(input: RoomInput | RoomUpdateInput) {
  return {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.images !== undefined && { images: input.images }),
    ...(input.pricePerNight !== undefined && {
      pricePerNight: new Prisma.Decimal(input.pricePerNight),
    }),
    ...(input.maxGuests !== undefined && { maxGuests: input.maxGuests }),
    ...(input.facilities !== undefined && { facilities: input.facilities }),
    ...(input.depositMode !== undefined && { depositMode: input.depositMode }),
    ...(input.depositValue !== undefined && {
      depositValue: new Prisma.Decimal(input.depositValue),
    }),
    ...("isActive" in input && input.isActive !== undefined && { isActive: input.isActive }),
  };
}

export async function listRooms(
  shopId: string,
  opts: { activeOnly?: boolean } = {},
): Promise<Room[]> {
  return prisma.room.findMany({
    where: { shopId, ...(opts.activeOnly ? { isActive: true } : {}) },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  });
}

export async function getRoom(shopId: string, roomId: string): Promise<Room> {
  // scope shopId ใน where ตั้งแต่ query แรก — ไม่ใช่ findUnique แล้วเช็คทีหลัง
  const room = await prisma.room.findFirst({ where: { id: roomId, shopId } });
  if (!room) throw new RoomNotFoundError();
  return room;
}

export async function createRoom(shopId: string, input: RoomInput): Promise<Room> {
  await assertLodgingShop(shopId);
  assertImageLimit(input.images);
  return prisma.room.create({
    data: {
      shopId,
      name: input.name,
      description: input.description ?? null,
      images: input.images ?? [],
      pricePerNight: new Prisma.Decimal(input.pricePerNight),
      maxGuests: input.maxGuests ?? null,
      facilities: input.facilities ?? [],
      depositMode: input.depositMode ?? "FIXED",
      depositValue: new Prisma.Decimal(input.depositValue ?? "0"),
    },
  });
}

/**
 * updateRoom — แก้ไขห้อง รวมถึงปิดการใช้งาน (isActive=false)
 * ไม่มี deleteRoom โดยเจตนา: BR-LODG-06 ให้ใช้การปิดการใช้งานแทน และ Phase 2 จะมี FK
 * Order.roomId แบบ ON DELETE RESTRICT กันลบห้องที่มีการจองที่ระดับฐานข้อมูลอีกชั้น
 */
export async function updateRoom(
  shopId: string,
  roomId: string,
  input: RoomUpdateInput,
): Promise<Room> {
  await getRoom(shopId, roomId); // ยืนยันว่าเป็นห้องของร้านนี้จริงก่อนเขียน
  assertImageLimit(input.images);
  const data = toRoomData(input);
  if (Object.keys(data).length === 0) return getRoom(shopId, roomId);
  return prisma.room.update({ where: { id: roomId }, data });
}

/** ห้องที่แสดงบนโปรไฟล์สาธารณะ — เฉพาะที่เปิดใช้งาน และคืนเฉพาะ field ที่เปิดเผยได้ (FR-LODG-07) */
export async function getPublicRooms(shopId: string) {
  const rooms = await prisma.room.findMany({
    where: { shopId, isActive: true },
    select: {
      id: true,
      name: true,
      description: true,
      images: true,
      pricePerNight: true,
      maxGuests: true,
      facilities: true,
    },
    orderBy: { createdAt: "asc" },
  });
  // Decimal → string ที่ boundary นี้เลย: ส่ง Decimal object ข้าม RSC จะ crash runtime
  // แม้ type-check ผ่าน (บทเรียนเดียวกับ /u/[username] ที่ serialize Product.price)
  return rooms.map((r) => ({
    ...r,
    images: parseImages(r.images),
    pricePerNight: r.pricePerNight.toFixed(2),
  }));
}

/** serialize สำหรับส่งข้าม RSC/JSON boundary — ใช้กับหน้า seller */
export function serializeRoom(room: Room) {
  return {
    id: room.id,
    name: room.name,
    description: room.description,
    images: parseImages(room.images),
    pricePerNight: room.pricePerNight.toFixed(2),
    maxGuests: room.maxGuests,
    facilities: room.facilities,
    depositMode: room.depositMode,
    depositValue: room.depositValue.toFixed(2),
    isActive: room.isActive,
  };
}

export type SerializedRoom = ReturnType<typeof serializeRoom>;
