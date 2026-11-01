import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveChatScope } from "@/lib/chat-scope";
import { forbiddenRoleResponse } from "@/lib/forbidden-role";
import { sessionUserId } from "@/lib/session-user";
import { prisma } from "@/lib/prisma";
import { listChannelsForShops } from "@/services/shop-channel.service";

export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

/**
 * GET /api/chat/scope — ขอบเขตกล่องแชทสำหรับแชท Native ในแอปผู้ขาย (feature 00088)
 *
 * ค่าชุดเดียวกับที่ `seller/(chat)/layout.tsx` ส่งเป็น prop (เว็บไม่มี API ของค่าเหล่านี้):
 *  - `storedMode` / `mode` — สวิตช์ "ร้านทั้งหมด/ร้านนี้" ตามที่ผู้ใช้ตั้ง (layout.tsx ChatHeader)
 *  - `shops` / `channels` — ร้านและเพจของ **ทุกร้านในขอบเขต** (layout.tsx:107-126 · /api/channels ให้แค่ร้าน active)
 *  - `channels[].commentPrivateReplyText` — ข้อความตั้งต้นกล่องทักแชทจากคอมเมนต์ (comments/page.tsx:96-121)
 * ด่าน H1 เหมือนกล่องแชท · อ่านอย่างเดียว · เว็บไม่เรียก
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!session?.user || !userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const scope = await resolveChatScope(
    { user: { id: userId, activeShopId: (session.user as { activeShopId?: string | null }).activeShopId ?? null } },
    "H1",
  );
  if (!scope) return NextResponse.json({ error: "ไม่พบร้านที่กำลังใช้งาน" }, { status: 404 });
  if (!scope.activeHasCap) return forbiddenRoleResponse();

  try {
    const [shopRows, channelRows] = await Promise.all([
      prisma.shop.findMany({
        where: { id: { in: scope.shopIds } },
        select: { id: true, shopName: true, logo: true, vertical: true },
        orderBy: { shopName: "asc" },
      }),
      listChannelsForShops(scope.shopIds).catch(() => []),
    ]);
    const messengerIds = channelRows.filter((c) => c.provider === "MESSENGER").map((c) => c.id);
    const privateText = new Map(
      messengerIds.length
        ? (
            await prisma.shopChannel.findMany({
              where: { id: { in: messengerIds } },
              select: { id: true, commentPrivateReplyText: true },
            })
          ).map((c) => [c.id, c.commentPrivateReplyText] as const)
        : [],
    );
    return NextResponse.json(
      {
        storedMode: scope.storedMode,
        mode: scope.mode,
        activeShopId: scope.activeShopId,
        shops: shopRows.map((r) => ({ id: r.id, name: r.shopName, logo: r.logo, vertical: r.vertical })),
        channels: channelRows.map((c) => ({
          id: c.id,
          provider: c.provider,
          name: c.name,
          avatarUrl: c.avatarUrl,
          shopId: c.shopId,
          shopName: c.shopName,
          commentPrivateReplyText: privateText.get(c.id) ?? null,
        })),
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (e: unknown) {
    console.error("[GET /api/chat/scope]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
