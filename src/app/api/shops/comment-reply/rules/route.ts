import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sessionUserId } from "@/lib/session-user";
import { resolveActiveShopContext } from "@/lib/shop-context";
import { CommentReplyRuleSchema } from "@/lib/validations";
import {
  createCommentRule,
  listCommentRules,
  type RuleWriteError,
} from "@/services/comment-reply-rule.service";

/**
 * กฎตอบคอมเมนต์ตามคีย์เวิร์ด (feature 00038 ส่วนขยาย E2)
 *   GET  — รายการกฎของร้านที่กำลังใช้งาน (เรียงเหมือนที่ระบบเลือกจริง)
 *   POST — สร้างกฎใหม่
 *
 * shopId derive จาก active shop ของ session เท่านั้น (resolveActiveShopContext re-verify
 * membership ทุกครั้ง) — pattern เดียวกับ `../config/route.ts` ข้าง ๆ
 *
 * 🛑 ใช้ `sessionUserId()` ไม่ใช่ `(session.user as {id}).id` — "มี session" ไม่เท่ากับ "รู้ว่าเป็นใคร"
 * (docs/conventions/session-exists-is-not-identity.md) route ข้างเคียงยังใช้ท่าเก่าอยู่ ซึ่งเป็น
 * หนี้ที่มีมาก่อน — ของใหม่ต้องไม่ก็อปท่านั้นไปเพิ่ม
 */
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

/** map error ของ service → HTTP — ทุกค่าใน RuleWriteError ต้องมีที่ลงที่นี่ ไม่งั้นตกเป็น 500 เงียบ */
const ERROR_STATUS: Record<RuleWriteError, { status: number; message: string }> = {
  NO_PHRASES: { status: 400, message: "ใส่คำที่จะให้ระบบตรวจจับอย่างน้อย 1 คำ" },
  NOTHING_TO_SEND: { status: 400, message: "กรอกคำตอบอย่างน้อยหนึ่งช่อง (ตอบใต้คอมเมนต์ หรือ ทักแชท)" },
  TOO_MANY_RULES: { status: 409, message: "สร้างกฎได้สูงสุด 50 ข้อต่อร้าน" },
  CHANNEL_NOT_FOUND: { status: 404, message: "ไม่พบเพจนี้" },
  NOT_FOUND: { status: 404, message: "ไม่พบกฎนี้" },
};

export async function requireShopContext(): Promise<
  { shopId: string; userId: string } | { error: NextResponse }
> {
  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
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
        (session?.user as { activeShopId?: string | null } | undefined)?.activeShopId ?? null,
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

export function ruleErrorResponse(error: RuleWriteError): NextResponse {
  const mapped = ERROR_STATUS[error];
  return NextResponse.json(
    { error: mapped.message, code: error },
    { status: mapped.status, headers: NO_STORE_HEADERS },
  );
}

export async function GET() {
  const ctx = await requireShopContext();
  if ("error" in ctx) return ctx.error;
  const rules = await listCommentRules(ctx.shopId);
  return NextResponse.json({ rules }, { headers: NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  const ctx = await requireShopContext();
  if ("error" in ctx) return ctx.error;

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(CommentReplyRuleSchema, body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", code: "VALIDATION_ERROR" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const result = await createCommentRule({
    shopId: ctx.shopId,
    actorUserId: ctx.userId,
    input: parsed.output,
  });
  if (!result.ok) return ruleErrorResponse(result.error);
  return NextResponse.json({ rule: result.rule }, { headers: NO_STORE_HEADERS });
}
