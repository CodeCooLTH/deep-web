import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveConversationShopId } from "@/lib/chat-scope";
import { sessionUserId } from "@/lib/session-user";
import { InterestedProductPostSchema } from "@/lib/validations";
import { addInterestedProduct } from "@/services/chat-interested-product.service";

// 00019-ext-mem — เพิ่มสินค้าที่สนใจ
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
const IdParamSchema = v.pipe(v.string(), v.uuid());
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE_HEADERS });

const ERR: Record<string, [number, string]> = {
  NOT_FOUND: [404, "ไม่พบบทสนทนานี้"],
  PRODUCT_NOT_FOUND: [404, "ไม่พบสินค้านี้"],
  DUPLICATE: [409, "เพิ่มสินค้านี้ไปแล้ว"],
  LIMIT_REACHED: [422, "สินค้าที่สนใจครบจำนวนสูงสุดแล้ว"],
  INVALID_OPTION: [422, "ตัวเลือกสินค้าไม่ถูกต้อง"],
};

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!session?.user || !userId) return json({ error: "unauthorized" }, 401);

  const { id: rawId } = await ctx.params;
  const idCheck = v.safeParse(IdParamSchema, rawId);
  if (!idCheck.success) return json({ error: "รหัสบทสนทนาไม่ถูกต้อง" }, 400);

  const resolved = await resolveConversationShopId(
    { user: { id: userId, activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null } },
    idCheck.output,
  );
  if (!resolved) return json({ error: "ไม่พบบทสนทนานี้" }, 404);

  const parsed = v.safeParse(InterestedProductPostSchema, await request.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.issues[0]?.message ?? "Invalid input" }, 400);

  try {
    const r = await addInterestedProduct({
      shopId: resolved.shopId,
      conversationId: idCheck.output,
      userId,
      ...parsed.output,
    });
    if (r.ok) return json({ item: r.item }, 201);
    const [status, error] = ERR[r.code];
    return json({ error, code: r.code }, status);
  } catch (e) {
    console.error("[POST interested-products]", e instanceof Error ? e.name : "unknown"); // ชื่อชนิดเท่านั้น
    return json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, 500);
  }
}
