import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { checkApiRateLimit, clientIp } from "@/lib/api-rate-limit";
import { acceptInviteLink } from "@/services/invite-link.service";

/**
 * POST /api/i/[slug]/accept — ผู้ถูกเชิญ (login แล้ว) กดยอมรับเข้าเป็น admin ของ shop
 *
 * - auth required — 401 ถ้าไม่มี session
 * - rate-limit per-IP เข้มกว่า resolve (10/min) — mirror เจตนา sms-consume-rl.ts (RC-1):
 *   endpoint นี้มี side-effect (สร้าง ShopMember) จึงต้อง throttle แน่นกว่า read-only resolve
 * - map service throws → HTTP ตาม memory feedback_service_error_route_mapping
 *
 * สำคัญ: route นี้ "ไม่" set session.activeShopId เอง — Next.js 16 RSC/route handler
 * set JWT ตรงไม่ได้ (เหมือน constraint เดียวกับ /api/business/switch-context) client
 * ต้องเรียก NextAuth `session.update({ activeShopId: shopId })` เองหลังได้ 200 กลับไป
 * แล้วค่อย redirect ต่อ (jwt callback จะ re-verify membership อีกชั้น)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id as string;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ip = clientIp(request);
  // side-effect endpoint (สร้าง ShopMember) → quota เข้มกว่า resolve
  if (!checkApiRateLimit(`${ip}:i-accept`, 10, 60_000)) {
    return NextResponse.json(
      { error: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const { slug } = await params;

  try {
    const result = await acceptInviteLink(slug, userId);
    return NextResponse.json({ shopId: result.shopId });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "";
    if (message === "LINK_INVALID") {
      return NextResponse.json({ error: "LINK_INVALID" }, { status: 410 });
    }
    if (message === "ALREADY_OWNER") {
      return NextResponse.json({ error: "ALREADY_OWNER" }, { status: 409 });
    }
    if (message === "ADMIN_QUOTA_EXCEEDED") {
      return NextResponse.json({ error: "ADMIN_QUOTA_EXCEEDED" }, { status: 409 });
    }
    console.error("[POST /api/i/[slug]/accept] userId:", userId, message || e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
