import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { UpdateRoomSchema } from "@/lib/validations";
import { requireActiveShop } from "@/lib/shop-context";
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const ctx = await requireShopMember();
  if ("error" in ctx) return ctx.error;

  try {
    // getRoom scope shopId ใน where ตั้งแต่ query แรก — ห้องของร้านอื่นจะไม่ถูกอ่านขึ้นมาเลย
    const room = await getRoom(ctx.shopId, roomId);
    return NextResponse.json(serializeRoom(room), { headers: NO_STORE });
  } catch (e: unknown) {
    if (e instanceof RoomNotFoundError) {
      return NextResponse.json({ error: "ROOM_NOT_FOUND" }, { status: 404, headers: NO_STORE });
    }
    console.error("[GET /api/shops/current/rooms/:id] shopId:", ctx.shopId, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500, headers: NO_STORE });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const ctx = await requireShopMember();
  if ("error" in ctx) return ctx.error;

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(UpdateRoomSchema, body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400, headers: NO_STORE });
  }

  try {
    const room = await updateRoom(ctx.shopId, roomId, parsed.output);
    return NextResponse.json(serializeRoom(room), { headers: NO_STORE });
  } catch (e: unknown) {
    if (e instanceof RoomNotFoundError) {
      return NextResponse.json({ error: "ROOM_NOT_FOUND" }, { status: 404, headers: NO_STORE });
    }
    if (e instanceof TooManyRoomImagesError) {
      return NextResponse.json({ error: "TOO_MANY_ROOM_IMAGES" }, { status: 400, headers: NO_STORE });
    }
    console.error("[PATCH /api/shops/current/rooms/:id] shopId:", ctx.shopId, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500, headers: NO_STORE });
  }
}
