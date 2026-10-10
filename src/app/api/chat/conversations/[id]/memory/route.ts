import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveConversationShopId } from "@/lib/chat-scope";
import { forbiddenRoleResponse } from "@/lib/forbidden-role";
import { sessionUserId } from "@/lib/session-user";
import { ChatMemoryPutSchema } from "@/lib/validations";
import { getMemoryPanel, saveMemoryByAdmin } from "@/services/chat-memory.service";

// 00019-ext-mem — ความจำต่อห้อง (GET แผง · PUT แก้โดยแอดมิน)
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
const IdParamSchema = v.pipe(v.string(), v.uuid());
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE_HEADERS });

type Ctx = { params: Promise<{ id: string }> };

/** session → id → shop จากเธรด; 🛑 ห้ามใช้ร้านที่ active (00037) */
async function requireShopContext(
  ctx: Ctx,
  cap: "H1" | "H2",
): Promise<{ res: NextResponse } | { userId: string; shopId: string; conversationId: string }> {
  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!session?.user || !userId) return { res: json({ error: "unauthorized" }, 401) };
  const { id: rawId } = await ctx.params;
  const idCheck = v.safeParse(IdParamSchema, rawId);
  if (!idCheck.success) return { res: json({ error: "รหัสบทสนทนาไม่ถูกต้อง" }, 400) };
  const resolved = await resolveConversationShopId(
    { user: { id: userId, activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null } },
    idCheck.output,
    cap,
  );
  if (!resolved) return { res: json({ error: "ไม่พบบทสนทนานี้" }, 404) };
  // 00071 S-13: เป็นสมาชิกแต่บทบาทไม่ถือ cap → 403 FORBIDDEN_ROLE
  if ("denied" in resolved) return { res: forbiddenRoleResponse() };
  return { userId, shopId: resolved.shopId, conversationId: idCheck.output };
}

const fail = (tag: string, e: unknown) => {
  console.error(tag, e instanceof Error ? e.name : "unknown"); // ชื่อชนิดเท่านั้น — message ของ Prisma อาจมีเนื้อความ
  return json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, 500);
};

export async function GET(_request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const g = await requireShopContext(ctx, "H1");
  if ("res" in g) return g.res;
  try {
    const panel = await getMemoryPanel(g.shopId, g.conversationId);
    return panel ? json(panel) : json({ error: "ไม่พบบทสนทนานี้" }, 404);
  } catch (e) {
    return fail("[GET memory]", e);
  }
}

export async function PUT(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const g = await requireShopContext(ctx, "H2");
  if ("res" in g) return g.res;
  const parsed = v.safeParse(ChatMemoryPutSchema, await request.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.issues[0]?.message ?? "Invalid input" }, 400);
  try {
    const r = await saveMemoryByAdmin({
      shopId: g.shopId,
      conversationId: g.conversationId,
      userId: g.userId,
      ...parsed.output,
    });
    if (r.ok) return json({ memory: r.memory });
    if (r.code === "NOT_FOUND") return json({ error: "ไม่พบบทสนทนานี้" }, 404);
    if (r.code === "INVALID_TEXT") return json({ error: "ข้อความไม่ถูกต้องหรือยาวเกินกำหนด" }, 400);
    if (r.code === "VERSION_CONFLICT") return json({ error: "VERSION_CONFLICT", current: r.current }, 409);
    return json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, 500);
  } catch (e) {
    return fail("[PUT memory]", e);
  }
}
