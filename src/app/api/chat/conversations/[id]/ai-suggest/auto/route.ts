import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveConversationShopId } from "@/lib/chat-scope";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { sessionUserId } from "@/lib/session-user";
import { AutoSuggestPostSchema, AutoSuggestPatchSchema } from "@/lib/validations";
import {
  requestAutoSuggest,
  getLatestAutoSuggest,
  submitAutoSuggestFeedback,
} from "@/services/ai-suggest-auto.service";

// 00019-ext — คำแนะนำคำตอบอัตโนมัติ (Typhoon). พื้นที่รอคิว ≤5 วิ + timeout Typhoon 8 วิ เกิน default
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
const IdParamSchema = v.pipe(v.string(), v.uuid());
// key เดียวกับเส้นเดิม เพื่อแบ่งงบกัน
const AI_RATE_LIMIT_MAX = 15;
const AI_RATE_LIMIT_WINDOW_MS = 60_000;

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { ...NO_STORE_HEADERS, ...extra } });

type Ctx = { params: Promise<{ id: string }> };
type Guard =
  | { res: NextResponse }
  | { userId: string; shopId: string; conversationId: string };

/** session → id param → shop จากเธรด → ownership {id, shopId}; 🛑 ห้ามใช้ร้านที่ active (00037) */
async function guard(ctx: Ctx): Promise<Guard> {
  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!session?.user || !userId) return { res: json({ error: "unauthorized" }, 401) };

  const { id: rawId } = await ctx.params;
  const idCheck = v.safeParse(IdParamSchema, rawId);
  if (!idCheck.success) return { res: json({ error: "รหัสบทสนทนาไม่ถูกต้อง" }, 400) };

  const resolved = await resolveConversationShopId(
    { user: { id: userId, activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null } },
    idCheck.output,
  );
  if (!resolved) return { res: json({ error: "ไม่พบบทสนทนานี้" }, 404) };

  const conversation = await prisma.conversation.findFirst({
    where: { id: idCheck.output, shopId: resolved.shopId },
    select: { id: true },
  });
  if (!conversation) return { res: json({ error: "ไม่พบบทสนทนานี้" }, 404) };

  return { userId, shopId: resolved.shopId, conversationId: conversation.id };
}

export async function POST(request: NextRequest, ctx: Ctx) {
  // ต้อง parse body/rate-limit ก่อน resolve ร้าน ตามลำดับในแผน 5.3 → แยก session+id ออกมาทำเอง
  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!session?.user || !userId) return json({ error: "unauthorized" }, 401);

  const { id: rawId } = await ctx.params;
  const idCheck = v.safeParse(IdParamSchema, rawId);
  if (!idCheck.success) return json({ error: "รหัสบทสนทนาไม่ถูกต้อง" }, 400);

  const rawBody = await request.json().catch(() => null);
  const parsed = v.safeParse(AutoSuggestPostSchema, rawBody);
  if (!parsed.success) return json({ error: parsed.issues[0]?.message ?? "Invalid input" }, 400);
  const body = parsed.output;

  if (body.manual && !checkApiRateLimit(`ai-suggest:${userId}`, AI_RATE_LIMIT_MAX, AI_RATE_LIMIT_WINDOW_MS)) {
    return json({ error: "ใช้ AI ถี่เกินไป กรุณารอสักครู่" }, 429, { "Retry-After": "60" });
  }

  const resolved = await resolveConversationShopId(
    { user: { id: userId, activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null } },
    idCheck.output,
  );
  if (!resolved) return json({ error: "ไม่พบบทสนทนานี้" }, 404);
  const conversation = await prisma.conversation.findFirst({
    where: { id: idCheck.output, shopId: resolved.shopId },
    select: { id: true },
  });
  if (!conversation) return json({ error: "ไม่พบบทสนทนานี้" }, 404);

  try {
    const result = await requestAutoSuggest({
      shopId: resolved.shopId,
      conversationId: conversation.id,
      userId,
      userDisplayName: session.user.name ?? null,
      anchorMessageId: body.anchorMessageId,
      manual: body.manual,
      trigger: body.manual ? "MANUAL" : (body.trigger ?? "AUTO_NEW_MESSAGE"),
    });
    if (result.status === "INVALID_ANCHOR") return json({ error: "ข้อความอ้างอิงไม่ถูกต้อง" }, 400);
    return json(result);
  } catch (e) {
    console.error("[POST ai-suggest/auto]", e instanceof Error ? e.name : "unknown"); // ชื่อชนิดเท่านั้น — message ของ Prisma อาจมีค่าที่ส่งเข้าไป (BR-AIT-09)
    return json({ status: "NONE", anchorMessageId: body.anchorMessageId, attempt: null, reason: "ERROR" });
  }
}

export async function GET(_request: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("res" in g) return g.res;
  try {
    return json(await getLatestAutoSuggest(g.shopId, g.conversationId));
  } catch (e) {
    console.error("[GET ai-suggest/auto]", e instanceof Error ? e.name : "unknown"); // ชื่อชนิดเท่านั้น — message ของ Prisma อาจมีค่าที่ส่งเข้าไป (BR-AIT-09)
    return json({ status: "NONE", anchorMessageId: null, attempt: null, reason: "ERROR", provider: "none" });
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("res" in g) return g.res;

  const parsed = v.safeParse(AutoSuggestPatchSchema, await request.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.issues[0]?.message ?? "Invalid input" }, 400);

  try {
    // redact note ทำใน service (BR-AIT-11)
    const r = await submitAutoSuggestFeedback({ shopId: g.shopId, conversationId: g.conversationId, ...parsed.output });
    if (!r.ok) return json({ error: "ไม่พบคำแนะนำนี้" }, 404);
    return json({ ok: true });
  } catch (e) {
    console.error("[PATCH ai-suggest/auto]", e instanceof Error ? e.name : "unknown"); // ชื่อชนิดเท่านั้น — message ของ Prisma อาจมีค่าที่ส่งเข้าไป (BR-AIT-09)
    return json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, 500);
  }
}
