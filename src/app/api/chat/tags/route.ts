import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveChatScope, intersectScopedShopIds } from "@/lib/chat-scope";
import { getShopTags } from "@/services/chat-crm.service";
import { sessionUserId } from "@/lib/session-user";

// feature 00018 CRM — รายการ tag ทั้งหมดของร้าน (autocomplete ตอนเพิ่ม tag)
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!session?.user || !userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // feature 00037 — ร้านของทรัพยากรนี้: ?shopId= ที่ client ส่งมา (ร้านของเธรดที่เปิดอยู่)
  // ต้องถูก intersect กับขอบเขตเสมอ; ไม่ส่ง = ร้านที่ active (พฤติกรรมเดิมของผู้ใช้ร้านเดียว)
  const scope = await resolveChatScope({
    user: { id: userId, activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null },
  });
  const ctx = scope
    ? { shopIds: intersectScopedShopIds(scope.shopIds, request.nextUrl.searchParams.get("shopId")) }
    : null;
  if (!ctx) return NextResponse.json({ error: "ไม่พบร้านที่กำลังใช้งาน" }, { status: 404 });

  const tags = await getShopTags(ctx.shopIds);
  return NextResponse.json({ tags }, { headers: NO_STORE_HEADERS });
}
