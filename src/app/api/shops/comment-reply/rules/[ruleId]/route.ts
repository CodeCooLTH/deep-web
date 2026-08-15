import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { CommentReplyRuleSchema } from "@/lib/validations";
import { deleteCommentRule, updateCommentRule } from "@/services/comment-reply-rule.service";
import { requireShopContext, ruleErrorResponse } from "../route";

/**
 * แก้/ลบกฎตอบคอมเมนต์รายข้อ (feature 00038 ส่วนขยาย E2)
 *
 * 🛑 ไม่มีการเช็ค "กฎนี้เป็นของร้านเราไหม" ที่นี่โดยตั้งใจ — service ทำด้วย `updateMany`/`deleteMany`
 * ที่มี `shopId` อยู่ใน `where` ซึ่งเป็นด่านแบบ atomic
 * ถ้าเช็คที่นี่ด้วย `findFirst` แล้วค่อยสั่ง update by id จะเปิดช่องว่างระหว่างสองคำสั่ง และเป็น
 * ด่านที่ "อยู่ผิดชั้น" — ด่านของข้อมูลต้องอยู่ติดกับคำสั่งที่แตะข้อมูล (หลักเดียวกับ claimJob /
 * atomic deduct ของ wallet.service) `count === 0` = ไม่มีสิทธิ์ หรือ ไม่มีแถว ซึ่งตอบ 404
 * เหมือนกันโดยตั้งใจ ไม่บอกคนนอกว่า id นี้มีอยู่จริงไหม
 */
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> },
) {
  const ctx = await requireShopContext();
  if ("error" in ctx) return ctx.error;
  const { ruleId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(CommentReplyRuleSchema, body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", code: "VALIDATION_ERROR" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const result = await updateCommentRule({ shopId: ctx.shopId, ruleId, input: parsed.output });
  if (!result.ok) return ruleErrorResponse(result.error);
  return NextResponse.json({ rule: result.rule }, { headers: NO_STORE_HEADERS });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> },
) {
  const ctx = await requireShopContext();
  if ("error" in ctx) return ctx.error;
  const { ruleId } = await params;

  const { ok } = await deleteCommentRule({ shopId: ctx.shopId, ruleId });
  if (!ok) return ruleErrorResponse("NOT_FOUND");
  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}
