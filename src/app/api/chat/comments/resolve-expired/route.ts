import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sessionUserId } from "@/lib/session-user";
import { resolveChatScope } from "@/lib/chat-scope";
import { resolveAllExpiredComments, type CommentChannelFilter } from "@/services/page-comment.service";

/**
 * POST /api/chat/comments/resolve-expired — "ทำเครื่องหมายทั้งหมด" ของแท็บ "หมดอายุ"
 * (ส่วนขยาย 00038, 2026-08-19 รอบสอง — user: "พวก หมดอายุ ให้ทำ mark all ด้วยได้ไหม")
 *
 * 🛑 **ไม่มีพารามิเตอร์ `state`** — เกณฑ์ "หมดอายุ" เขียนตายอยู่ใน `resolveAllExpiredComments()`
 * ทั้ง path และชื่อ endpoint ประกาศตัวเองว่าทำอะไรได้อย่างเดียว. ถ้าเปิดให้ส่ง state เข้ามาได้
 * วันหนึ่งจะมีคนส่ง `UNANSWERED` แล้วคำขอเดียวจะล้าง **คิวงานจริงทั้งกอง** ของร้าน ซึ่งกู้คืนได้
 * ทีละแถวเท่านั้น — ด่านต้องอยู่ในรูปร่างของ API ไม่ใช่ในวินัยของผู้เรียก
 *
 * ยังรับ `channelId`/`provider` เพราะขอบเขตต้องตรงกับที่จอกำลังกรองอยู่เป๊ะ — ผู้ใช้ที่เห็นเลข 41
 * ใต้ตัวกรอง "เพจ A" ต้องไม่ไปโดนของเพจ B ด้วย และกดแล้วเลขต้องลงเป็น 0 จริง
 *
 * 🛑 ห้ามอ่าน session.activeShopId ตรง ๆ — ใช้ `resolveChatScope` เหมือนพี่น้องใน
 * `src/app/api/chat/comments/list/route.ts` (ขอบเขตแชทครอบได้หลายร้าน ดู src/lib/chat-scope.ts)
 */
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!session?.user || !userId) {
    return NextResponse.json({ error: "unauthorized", code: "UNAUTHORIZED" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const scope = await resolveChatScope({
    user: {
      id: userId,
      activeShopId: ((session.user as { activeShopId?: string | null }).activeShopId ?? null) as string | null,
    },
  });
  if (!scope) {
    return NextResponse.json(
      { error: "ไม่พบร้านที่กำลังใช้งาน", code: "NOT_FOUND" },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { channelId?: string | null; provider?: string | null }
    | null;
  const shopChannelId = typeof body?.channelId === "string" && body.channelId ? body.channelId : undefined;
  // allow-list เหมือน route พี่น้อง — ค่าที่ไม่รู้จักตกไป 'ALL' (ไม่กรอง) ไม่ใช่หลุดลงไปเป็น
  // provider ดิบใน SQL
  const providerRaw = body?.provider;
  const provider: CommentChannelFilter =
    providerRaw === "DEEP" || providerRaw === "MESSENGER" || providerRaw === "INSTAGRAM" ? providerRaw : "ALL";

  try {
    const { resolved } = await resolveAllExpiredComments({
      shopIds: scope.shopIds,
      actorUserId: userId,
      shopChannelId,
      provider,
    });
    // คืนจำนวนที่ **แตะจริง** ไม่ใช่จำนวนที่หน้าจอเดาไว้ก่อนกด — ระหว่างที่ผู้ใช้อ่านกล่องยืนยัน
    // เพื่อนร่วมทีมอาจปิดไปแล้วบางใบ ตัวเลขใน toast ต้องเป็นของที่เกิดขึ้นจริง
    return NextResponse.json({ resolved }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "ไม่มีสิทธิ์จัดการร้านนี้", code: "FORBIDDEN" },
        { status: 403, headers: NO_STORE_HEADERS },
      );
    }
    console.error("[POST /api/chat/comments/resolve-expired]", message);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง", code: "INTERNAL_ERROR" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
