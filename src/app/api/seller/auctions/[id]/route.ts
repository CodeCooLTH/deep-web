import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { UpdateAuctionSchema } from "@/lib/validations";
import { getSellerAuctionDetail, updateAuction } from "@/services/auction.service";
import { mapAuctionError, requireSellerShop } from "../_shared";

// GET /api/seller/auctions/[id] — รายละเอียดประมูล + bid history (TFR-011)
// getSellerAuctionDetail คืน null ทั้งกรณีไม่พบและไม่ใช่เจ้าของ (ownership scope ที่ WHERE กัน PII leak) → 404 เหมือนกัน
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSellerShop();
  if ("response" in auth) return auth.response;
  const { userId } = auth;
  const { id } = await params;

  try {
    const dto = await getSellerAuctionDetail(id, userId);
    if (!dto) {
      return NextResponse.json({ error: "ไม่พบรายการประมูล" }, { status: 404 });
    }
    return NextResponse.json(dto);
  } catch (e) {
    return mapAuctionError(e, "GET /api/seller/auctions/[id]");
  }
}

// PATCH /api/seller/auctions/[id] — แก้ไขประมูล (TFR-002, เฉพาะ status draft/scheduled)
export async function PATCH(
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

  const parsed = v.safeParse(UpdateAuctionSchema, body);
  if (!parsed.success) {
    const firstIssue = parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  try {
    const dto = await updateAuction(id, userId, parsed.output);
    return NextResponse.json(dto);
  } catch (e) {
    return mapAuctionError(e, "PATCH /api/seller/auctions/[id]");
  }
}
