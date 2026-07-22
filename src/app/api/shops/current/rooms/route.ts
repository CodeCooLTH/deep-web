import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { CreateRoomSchema } from "@/lib/validations";
import { requireActiveShop } from "@/lib/shop-context";
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
const NO_STORE = { "cache-control": "private, no-store" } as const;

async function requireShopMember() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE }) };
  // cast จำเป็น: NextAuth Session.user ไม่ประกาศ id/activeShopId และโปรเจกต์ไม่มี d.ts
  // augmentation — comment ใน shop-context ที่ว่า "รับ Session ตรง ๆ ได้" ไม่เป็นจริงที่ call site
  // (ลองตัด cast แล้ว tsc ฟ้อง TS2345 — verified 2026-07-22)
  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  );
  if (!active) return { error: NextResponse.json({ error: "FORBIDDEN" }, { status: 403, headers: NO_STORE }) };
  return { shopId: active.shop.id };
}

export async function GET(_request: NextRequest) {
  const ctx = await requireShopMember();
  if ("error" in ctx) return ctx.error;

  try {
    const rooms = await listRooms(ctx.shopId);
    return NextResponse.json({ rooms: rooms.map(serializeRoom) }, { headers: NO_STORE });
  } catch (e: unknown) {
    console.error("[GET /api/shops/current/rooms] shopId:", ctx.shopId, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireShopMember();
  if ("error" in ctx) return ctx.error;

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(CreateRoomSchema, body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400, headers: NO_STORE });
  }

  try {
    const room = await createRoom(ctx.shopId, parsed.output);
    return NextResponse.json(serializeRoom(room), { status: 201, headers: NO_STORE });
  } catch (e: unknown) {
    // service throw error ชนิดใหม่ ต้องมี catch ครอบทุกตัวที่นี่ มิฉะนั้นตกเป็น 500
    // (บทเรียน feat 00003 OutOfStockError — feedback_service_error_route_mapping)
    if (e instanceof NotLodgingShopError) {
      return NextResponse.json({ error: "NOT_LODGING_SHOP" }, { status: 403, headers: NO_STORE });
    }
    if (e instanceof TooManyRoomImagesError) {
      return NextResponse.json({ error: "TOO_MANY_ROOM_IMAGES" }, { status: 400, headers: NO_STORE });
    }
    console.error("[POST /api/shops/current/rooms] shopId:", ctx.shopId, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500, headers: NO_STORE });
  }
}
