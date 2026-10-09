import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveConversationShopId } from "@/lib/chat-scope";
import { sessionUserId } from "@/lib/session-user";
import { removeInterestedProduct } from "@/services/chat-interested-product.service";

// 00019-ext-mem — ลบสินค้าที่สนใจ (เฉพาะที่ผู้ใช้สั่ง)
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
const UuidSchema = v.pipe(v.string(), v.uuid());
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE_HEADERS });

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string; rowId: string }> }) {
  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!session?.user || !userId) return json({ error: "unauthorized" }, 401);

  const { id, rowId } = await ctx.params;
  const idCheck = v.safeParse(UuidSchema, id);
  const rowCheck = v.safeParse(UuidSchema, rowId);
  if (!idCheck.success || !rowCheck.success) return json({ error: "รหัสไม่ถูกต้อง" }, 400);

  const resolved = await resolveConversationShopId(
    { user: { id: userId, activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null } },
    idCheck.output,
  );
  if (!resolved) return json({ error: "ไม่พบบทสนทนานี้" }, 404);

  try {
    const r = await removeInterestedProduct({
      shopId: resolved.shopId,
      conversationId: idCheck.output,
      rowId: rowCheck.output,
    });
    if (!r.ok) return json({ error: "ไม่พบรายการนี้" }, 404);
    return new NextResponse(null, { status: 204, headers: NO_STORE_HEADERS });
  } catch (e) {
    console.error("[DELETE interested-products]", e instanceof Error ? e.name : "unknown"); // ชื่อชนิดเท่านั้น
    return json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, 500);
  }
}
