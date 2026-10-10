import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sessionUserId } from "@/lib/session-user";
import { ForbiddenRoleError } from "@/lib/shop-capability";
import { forbiddenRoleResponse } from "@/lib/forbidden-role";
import { setCommentResolved } from "@/services/page-comment.service";

/**
 * POST/DELETE /api/chat/comments/[commentId]/resolve — "ทำเครื่องหมายว่าจัดการแล้ว" / ยกเลิก
 * (ส่วนขยาย 00038 2026-08-19 — FR-CR-15 / FR-CR-17)
 *
 * ยกโครงจากไฟล์พี่น้อง `../private-reply/route.ts` — auth เหมือนกันทุกประการ
 *
 * 🛑 ห้ามอ่าน/เช็ค session.activeShopId ในไฟล์นี้ — อยู่ใต้ src/app/api/chat/** ซึ่งเป็น
 * "ขอบเขตแชท" ตาม src/lib/chat-scope.ts: คอมเมนต์ 1 อันอาจเป็นของร้านที่ไม่ใช่ร้าน active ของ
 * ผู้ใช้ การตรวจสิทธิ์ที่ถูกต้องคือไล่จากแถวข้อมูลเอง (comment → post → channel → shop) ซึ่ง
 * setCommentResolved ทำให้แล้วผ่าน canAccessShopWith(cap) ภายในตัวมันเอง (BR-CR-R6)
 *
 * 🛑 ห้ามรับ `reason` จาก body — ค่านี้ hardcode เป็น 'MANUAL' เสมอ (BR-CR-R7)
 * `ALREADY_REPLIED_EXTERNALLY` เป็นข้อเท็จจริงที่มาจาก Meta เท่านั้น (ตั้งโดย
 * sendPrivateReplyToCommentById หลัง Graph ตอบ #10900) ถ้าเปิดให้ client ส่งมาได้ ผู้ใช้จะปลอม
 * ได้ว่า "เพจทักไปแล้ว" ทั้งที่ไม่เคยทัก แล้วจอจะโกหกคนอื่นในทีมตลอดไปโดยไม่มีอะไรฟ้อง
 */
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

/** ตัวตนจาก session (ไม่ใช่ด่านสิทธิ์ — ด่าน cap อยู่ใน setCommentResolved ที่ handler ส่ง literal เข้าไปตรง ๆ) */
async function sessionActor(): Promise<string | NextResponse> {
  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!session?.user || !userId) {
    return NextResponse.json(
      { error: "unauthorized", code: "UNAUTHORIZED" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }
  return userId;
}

/** แปลงผล/ข้อผิดพลาดของ setCommentResolved เป็น response — ร่วมกันทั้ง POST และ DELETE */
async function respond(run: () => ReturnType<typeof setCommentResolved>): Promise<NextResponse> {
  try {
    const result = await run();
    return NextResponse.json(
      {
        resolvedAt: result.resolvedAt?.toISOString() ?? null,
        resolvedReason: result.resolvedReason,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (err) {
    if (err instanceof ForbiddenRoleError) return forbiddenRoleResponse();
    const message = err instanceof Error ? err.message : String(err);
    if (message === "COMMENT_NOT_FOUND") {
      return NextResponse.json(
        { error: "ไม่พบความคิดเห็นนี้", code: "NOT_FOUND" },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "ไม่มีสิทธิ์จัดการความคิดเห็นนี้", code: "FORBIDDEN" },
        { status: 403, headers: NO_STORE_HEADERS },
      );
    }
    console.error("[/api/chat/comments/[commentId]/resolve]", message);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง", code: "INTERNAL_ERROR" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

export async function POST(_request: NextRequest, ctx: { params: Promise<{ commentId: string }> }) {
  const actor = await sessionActor();
  if (typeof actor !== "string") return actor;
  const { commentId } = await ctx.params;
  // cap เป็น literal ตรงนี้ให้ทะเบียน route-capabilities + เทส inventory ตรวจได้ (H2 = ลงมือกับคอมเมนต์)
  return respond(() => setCommentResolved({ commentId, actorUserId: actor, resolved: true, reason: "MANUAL", cap: "H2" }));
}

/**
 * ยกเลิก (FR-CR-17) — ใช้ได้ไม่ว่าเหตุผลเดิมจะเป็นค่าไหน รวม `ALREADY_REPLIED_EXTERNALLY`
 * ให้คนเป็นผู้ตัดสินว่าจะกลับคำ ไม่ใช่ระบบตัดสินแทนว่าเคสไหนแก้ไม่ได้ (เผื่อ Graph ตอบผิด)
 *
 * ทำซ้ำได้ (idempotent) — กดยกเลิกกับคอมเมนต์ที่ไม่ได้ resolved อยู่แล้ว คืน 200 พร้อม
 * `resolvedAt: null` ตามความจริง ไม่ต้อง 409: ผลลัพธ์ที่ผู้ใช้ต้องการเกิดขึ้นแล้ว การขึ้น error
 * กับสถานะที่ถูกต้องอยู่แล้วมีแต่ทำให้คนสับสน (ต่างจาก POST ที่การกดซ้ำจะเลื่อนเวลา resolvedAt
 * ซึ่งก็ยังไม่เป็นอันตราย — จอไม่ได้แสดงเวลานั้น)
 */
export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ commentId: string }> }) {
  const actor = await sessionActor();
  if (typeof actor !== "string") return actor;
  const { commentId } = await ctx.params;
  return respond(() => setCommentResolved({ commentId, actorUserId: actor, resolved: false, reason: "MANUAL", cap: "H2" }));
}
