import { NextRequest } from "next/server";
import * as v from "valibot";
import { CreateRoomSchema } from "@/lib/validations";
import { requireShopMember, jsonNoStore } from "@/lib/shop-api-guard";
import {
  createRoom,
  listRooms,
  serializeRoom,
  NotLodgingShopError,
  TooManyRoomImagesError,
} from "@/services/room.service";

/**
 * GET  /api/shops/current/rooms — รายการห้องพักของร้านปัจจุบัน
 * POST /api/shops/current/rooms — สร้างห้องพัก
 *
 * feature 00017 Lodging Vertical, Phase 1 (API.md #1, #2 / FR-LODG-04..06)
 *
 * สิทธิ์: สมาชิกของร้าน (OWNER หรือ ADMIN) — ต่างจาก invite-links ที่จำกัด OWNER
 * เพราะการจัดการห้องพักเป็นงานประจำวันที่ผู้ดูแลร้านต้องทำได้
 *
 * IMPORTANT: ต้องผ่าน assertLodgingShop() ที่ service ก่อนเสมอ — ร้าน GENERAL เรียกได้ 403
 * ไม่ใช่แค่ไม่เห็นเมนู (BR-LODG-03 การซ่อนเมนูไม่ใช่การควบคุมสิทธิ์)
 */

// per-user data — กัน shared/carrier cache ส่งข้อมูลข้ามผู้ใช้ (feedback_auth_api_cache_control)
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const ctx = await requireShopMember();
  if ("error" in ctx) return ctx.error;

  try {
    const rooms = await listRooms(ctx.shopId);
    return jsonNoStore({ rooms: rooms.map(serializeRoom) });
  } catch (e: unknown) {
    console.error("[GET /api/shops/current/rooms] shopId:", ctx.shopId, e instanceof Error ? e.message : e);
    return jsonNoStore({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireShopMember();
  if ("error" in ctx) return ctx.error;

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(CreateRoomSchema, body ?? {});
  if (!parsed.success) {
    return jsonNoStore({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const room = await createRoom(ctx.shopId, parsed.output);
    return jsonNoStore(serializeRoom(room), { status: 201 });
  } catch (e: unknown) {
    // service throw error ชนิดใหม่ ต้องมี catch ครอบทุกตัวที่นี่ มิฉะนั้นตกเป็น 500
    // (บทเรียน feat 00003 OutOfStockError — feedback_service_error_route_mapping)
    if (e instanceof NotLodgingShopError) {
      return jsonNoStore({ error: "NOT_LODGING_SHOP" }, { status: 403 });
    }
    if (e instanceof TooManyRoomImagesError) {
      return jsonNoStore({ error: "TOO_MANY_ROOM_IMAGES" }, { status: 400 });
    }
    console.error("[POST /api/shops/current/rooms] shopId:", ctx.shopId, e instanceof Error ? e.message : e);
    return jsonNoStore({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
