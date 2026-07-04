import { NextRequest, NextResponse } from "next/server";

import { checkApiRateLimit, clientIp } from "@/lib/api-rate-limit";
import { resolveInviteLink } from "@/services/invite-link.service";

/**
 * GET /api/i/[slug] — resolve invite link สำหรับหน้า landing สาธารณะ (`/i/[slug]`, ไม่ต้อง auth)
 *
 * Security design (mirror /api/o/sms/[code]):
 * - rate-limit per-IP กัน enumeration/scan slug (60 req/min — read-only เบากว่า accept)
 * - ไม่คืน `reason` (EXPIRED/REVOKED/NOT_FOUND) หรือ `shopId` เมื่อ invalid — เก็บเป็น opaque
 *   ตาม design spec "ไม่รั่วเหตุผล" (กัน oracle แยกแยะ NOT_FOUND vs REVOKED vs EXPIRED)
 * - คืนเฉพาะ field ที่ปลอดภัยแสดงบน landing: shopName/shopLogo (public อยู่แล้วบนหน้าโปรไฟล์ร้าน)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ip = clientIp(request);

  // read-only resolve — quota หลวมกว่า accept (ไม่มีผลข้างเคียง แค่ enumeration risk)
  if (!checkApiRateLimit(`${ip}:i-resolve`, 60, 60_000)) {
    return NextResponse.json(
      { error: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const { slug } = await params;
  const result = await resolveInviteLink(slug);

  if (!result.valid) {
    // opaque — ไม่ส่ง reason/shopId กลับ ป้องกัน client แยกแยะสาเหตุ invalid
    return NextResponse.json({ valid: false });
  }

  return NextResponse.json({
    valid: true,
    shopName: result.shopName,
    shopLogo: result.shopLogo ?? null,
  });
}
