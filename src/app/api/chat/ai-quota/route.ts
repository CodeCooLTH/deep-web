import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveScopedShopId } from "@/lib/chat-scope";
import { getAiSuggestQuotaStatus } from "@/services/ai-suggest-quota.service";
import { sessionUserId } from "@/lib/session-user";

/**
 * GET /api/chat/ai-quota — สถานะโควตาฟรี/ยอดเงิน/paid-plan ของ ai-suggest ล่วงหน้า (feature 00019 ext, 2026-07-29)
 * SSOT: docs/20 - Features/00019 - AI Reply Assistant/EXTENSIONS-2026-07-29-usage-limit.md (FR-AIQ-05)
 *
 * shopId derive จาก resolveActiveShopContext เท่านั้น (NFR-AIQ-Sec) — ห้ามรับ shopId จาก client
 * ไม่จำกัด role (OWNER/ADMIN/STAFF อ่านได้ทั้งหมด — mirror GET /api/shops/ai-settings)
 */

// per-shop authenticated data ต่อ request-time — ห้าม shared cache (CDN/carrier proxy) serve ข้ามผู้ใช้
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!session?.user || !userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // feature 00037 — ร้านของทรัพยากรนี้: ?shopId= ที่ client ส่งมา (ร้านของเธรดที่เปิดอยู่)
  // ต้องถูก intersect กับขอบเขตเสมอ; ไม่ส่ง = ร้านที่ active (พฤติกรรมเดิมของผู้ใช้ร้านเดียว)
  const activeCtx = await resolveScopedShopId(
    { user: { id: userId, activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null } },
    request.nextUrl.searchParams.get("shopId"),
  );
  if (!activeCtx) {
    return NextResponse.json({ error: "ไม่พบร้านที่กำลังใช้งาน" }, { status: 404 });
  }

  try {
    const status = await getAiSuggestQuotaStatus(activeCtx.shopId);
    return NextResponse.json(status, { headers: NO_STORE_HEADERS });
  } catch (e) {
    // fail-closed (FR-AIQ-08/NFR-AIQ-Consistency) — query พังต้องตอบ error ทั่วไป ห้าม default เป็น unlimited/ฟรี
    console.error("[GET /api/chat/ai-quota]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
