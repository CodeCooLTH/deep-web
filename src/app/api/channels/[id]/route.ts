import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveActiveShopContext } from "@/lib/shop-context";
import { disconnectChannel } from "@/services/shop-channel.service";
import { sessionUserId } from "@/lib/session-user";

// T1 (feature 00018): ถอดการเชื่อมต่อช่องทาง — ใช้โดยหน้า /settings/channels ปุ่ม "ถอด"
//
// per-user authenticated data — ห้าม shared cache (CDN/carrier proxy) เก็บ/serve ทับข้าม user
// (บทเรียนโปรเจกต์ 2026-07-04: default header เป็น public ทำให้ carrier cache ข้าม user)
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

// path param channelId ต้องเป็น uuid — ไม่ผ่าน = 400 ชัดเจนแทนปล่อยไป service→404
const ChannelIdParamSchema = v.pipe(v.string(), v.uuid());

/**
 * DELETE /api/channels/{id} — ถอดการเชื่อมต่อช่องทาง (soft: ตั้ง status='DISCONNECTED')
 *
 * ownership อยู่ใน WHERE ของ disconnectChannel(id, shopId) เอง (updateMany atomic guard) —
 * route หน้าที่แค่ resolve shopId จาก session แล้วส่งต่อ ไม่ query แยกก่อน (กัน TOCTOU/IDOR)
 *
 * bug fix (แชทไม่แยกตามร้าน): เดิมใช้ getShopByUserId ซึ่งคืน PERSONAL เสมอ ไม่สนว่ากำลัง active
 * ร้านไหนอยู่ — ถอดจากหน้าร้าน B ได้จริงแต่กลับไปแก้ record ของ PERSONAL. เปลี่ยนเป็น
 * resolveActiveShopContext; resolve ไม่ได้ → 404 ตรง ๆ ห้าม fallback เงียบ ๆ ไป PERSONAL
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!session?.user || !userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const activeCtx = await resolveActiveShopContext({
    user: { id: userId, activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null },
  });
  if (!activeCtx) {
    return NextResponse.json({ error: "ไม่พบร้านที่กำลังใช้งาน" }, { status: 404 });
  }

  const { id: rawChannelId } = await params;
  const idCheck = v.safeParse(ChannelIdParamSchema, rawChannelId);
  if (!idCheck.success) {
    return NextResponse.json({ error: "รหัสช่องทางไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    await disconnectChannel(idCheck.output, activeCtx.shopId);
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "CHANNEL_NOT_FOUND_OR_FORBIDDEN") {
      return NextResponse.json({ error: "ไม่พบช่องทางนี้" }, { status: 404 });
    }
    console.error("[DELETE /api/channels/[id]] shopId:", activeCtx.shopId, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
