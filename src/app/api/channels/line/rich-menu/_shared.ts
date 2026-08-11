import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveActiveShopContext } from "@/lib/shop-context";
import { RichMenuError } from "@/services/line-rich-menu.service";

/**
 * ของใช้ร่วมของ route กลุ่มเมนูลัดใน LINE (feature 00045)
 *
 * 🛑 กลุ่มนี้อยู่ใต้ `api/channels/**` ซึ่งเป็น **ข้อยกเว้นที่ประกาศไว้ตรง ๆ ใน docs/SRS.md §7.14**
 * ของกติกา `resolveChatScope` — เพราะเป็น "การตั้งค่าเพจ" ที่ต้องอยู่ในบริบทร้านเดียวโดยตั้งใจ
 * (ไม่ใช่งานที่ผูกกับเธรด) แต่ **ยังต้อง scope `shopChannelId` ด้วย `shopId` ใน WHERE เสมอ**
 * ซึ่งทำอยู่แล้วใน service ทุกฟังก์ชัน
 */
export const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
};

export async function requireShopId(): Promise<{ shopId: string; userId: string } | { error: NextResponse }> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return {
      error: NextResponse.json(
        { error: "unauthorized", code: "UNAUTHORIZED" },
        { status: 401, headers: NO_STORE_HEADERS },
      ),
    };
  }
  const ctx = await resolveActiveShopContext({
    user: {
      id: userId,
      activeShopId:
        ((session?.user as { activeShopId?: string | null } | undefined)?.activeShopId) ?? null,
    },
  });
  if (!ctx) {
    return {
      error: NextResponse.json(
        { error: "ไม่พบร้านที่กำลังใช้งาน", code: "FORBIDDEN" },
        { status: 403, headers: NO_STORE_HEADERS },
      ),
    };
  }
  return { shopId: ctx.shopId, userId };
}

/**
 * แปลง error ของ service เป็น HTTP ตาม `API.md` §5
 *
 * 🛑 `CHANNEL_NOT_FOUND` = **404 ไม่ใช่ 403** — นอกขอบเขต = ไม่มีอยู่ (403 ยืนยันว่าทรัพยากรนั้น
 * มีจริง ซึ่งเป็นการรั่วข้อมูลว่าร้านอื่นมีเพจ id นี้อยู่)
 *
 * 🛑 คอลัมน์ "กดซ้ำมีผลไหม" ใน API.md §5 ต้องสะท้อนออกไปถึงหน้าจอ — `retryable` จึงติดมากับ
 * response ไม่ใช่ให้ฝั่งหน้าจอเดาจาก code เอง (บทเรียน iShip 2026-08-06: จัดประเภท error ที่
 * กดซ้ำไม่มีทางสำเร็จให้เป็น retryable = สั่งให้ผู้ใช้ทำสิ่งที่ไร้ผลซ้ำ ๆ)
 */
const STATUS_BY_CODE: Record<RichMenuError["code"], { status: number; retryable: boolean }> = {
  CHANNEL_NOT_FOUND: { status: 404, retryable: false },
  NOT_LINE_CHANNEL: { status: 400, retryable: false },
  CONSENT_REQUIRED: { status: 409, retryable: false },
  DRAFT_INCOMPLETE: { status: 400, retryable: false },
  IMAGE_REJECTED: { status: 400, retryable: false },
  TOKEN_INVALID: { status: 409, retryable: false },
  RATE_LIMITED: { status: 429, retryable: true },
  UPSTREAM_ERROR: { status: 502, retryable: true },
};

export function toErrorResponse(e: unknown): NextResponse {
  if (e instanceof RichMenuError) {
    const mapped = STATUS_BY_CODE[e.code];
    return NextResponse.json(
      { error: e.message, code: e.code, retryable: mapped.retryable, reasons: e.reasons ?? undefined },
      { status: mapped.status, headers: NO_STORE_HEADERS },
    );
  }
  console.error("[rich-menu] ข้อผิดพลาดที่ไม่ได้จำแนก", e);
  return NextResponse.json(
    { error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง", code: "UPSTREAM_ERROR", retryable: true },
    { status: 500, headers: NO_STORE_HEADERS },
  );
}
