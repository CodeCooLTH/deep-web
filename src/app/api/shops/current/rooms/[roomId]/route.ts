import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest } from "next/server";
import * as v from "valibot";
import { UpdateRoomSchema } from "@/lib/validations";
import { jsonNoStore } from "@/lib/shop-api-guard";
import { requireShopCapability } from "@/lib/shop-capability";
import {
  getRoom,
  updateRoom,
  serializeRoom,
  RoomNotFoundError,
  TooManyRoomImagesError,
} from "@/services/room.service";

/**
 * GET   /api/shops/current/rooms/[roomId] — รายละเอียดห้อง
 * PATCH /api/shops/current/rooms/[roomId] — แก้ไข / ปิดการใช้งาน (isActive)
 *
 * feature 00017 Lodging Vertical, Phase 1 (API.md #3, #4)
 *
 * ไม่มี DELETE โดยเจตนา — BR-LODG-06 ให้ใช้การปิดการใช้งานแทน และ Phase 2 จะมี FK
 * Order.roomId แบบ ON DELETE RESTRICT กันลบห้องที่มีการจองอีกชั้นที่ระดับฐานข้อมูล
 */

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const gate = await requireShopCapability(await getServerSession(authOptions), "Q1");
  if (!gate.ok) return gate.response;
  const ctx = gate;

  try {
    // getRoom scope shopId ใน where ตั้งแต่ query แรก — ห้องของร้านอื่นจะไม่ถูกอ่านขึ้นมาเลย
    const room = await getRoom(ctx.shopId, roomId);
    return jsonNoStore(serializeRoom(room));
  } catch (e: unknown) {
    if (e instanceof RoomNotFoundError) {
      return jsonNoStore({ error: "ROOM_NOT_FOUND" }, { status: 404 });
    }
    console.error("[GET /api/shops/current/rooms/:id] shopId:", ctx.shopId, e instanceof Error ? e.message : e);
    return jsonNoStore({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const gate = await requireShopCapability(await getServerSession(authOptions), "Q2");
  if (!gate.ok) return gate.response;
  const ctx = gate;

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(UpdateRoomSchema, body ?? {});
  if (!parsed.success) {
    return jsonNoStore({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const room = await updateRoom(ctx.shopId, roomId, parsed.output);
    return jsonNoStore(serializeRoom(room));
  } catch (e: unknown) {
    if (e instanceof RoomNotFoundError) {
      return jsonNoStore({ error: "ROOM_NOT_FOUND" }, { status: 404 });
    }
    if (e instanceof TooManyRoomImagesError) {
      return jsonNoStore({ error: "TOO_MANY_ROOM_IMAGES" }, { status: 400 });
    }
    console.error("[PATCH /api/shops/current/rooms/:id] shopId:", ctx.shopId, e instanceof Error ? e.message : e);
    return jsonNoStore({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
