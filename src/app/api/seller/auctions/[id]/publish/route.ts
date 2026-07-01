import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { publishAuction } from "@/services/auction.service";
import { mapAuctionError, requireSellerShop } from "../../_shared";

// body { mode: 'publishNow'|'schedule', startTime?: ISO string } — ไม่มี schema กลางใน validations.ts
// (LOCKED CONTRACT ระบุแค่ CreateAuctionSchema/UpdateAuctionSchema/EndEarlyAuctionSchema) จึงประกาศ inline
// ที่นี่ ใช้ parser เดียวกับ AuctionDateTimeSchema (new Date() ตรง ๆ ครอบคลุม offset ทุกรูปแบบ)
const PublishBodySchema = v.object({
  mode: v.picklist(["publishNow", "schedule"] as const, "mode ไม่ถูกต้อง"),
  startTime: v.optional(
    v.pipe(
      v.string(),
      v.check((s) => !Number.isNaN(new Date(s).getTime()), "รูปแบบวันที่ไม่ถูกต้อง"),
      v.transform((s: string) => new Date(s)),
    ),
  ),
});

// POST /api/seller/auctions/[id]/publish — draft → live/scheduled (TFR-001 ต่อเนื่อง)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSellerShop();
  if ("response" in auth) return auth.response;
  const { userId } = auth;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const parsed = v.safeParse(PublishBodySchema, body);
  if (!parsed.success) {
    const firstIssue = parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  try {
    const dto = await publishAuction(id, userId, parsed.output.mode, parsed.output.startTime);
    return NextResponse.json(dto);
  } catch (e) {
    return mapAuctionError(e, "POST /api/seller/auctions/[id]/publish");
  }
}
