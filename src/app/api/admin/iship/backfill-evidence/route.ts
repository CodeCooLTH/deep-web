// feature 00055 — เก็บหลักฐานย้อนหลังให้พัสดุที่มีปัญหาอยู่แล้วก่อนฟีเจอร์นี้ขึ้น
//
// 🛑 ทำไมเป็น route ไม่ใช่สคริปต์ใน scripts/: เครื่อง dev ไม่มี `CHANNEL_TOKEN_KEY`
// (ไม่อยู่ใน .env และ `vercel env pull` redact เป็น [SENSITIVE]) จึงถอดรหัส token ของ iShip
// ไม่ได้ และไม่มี DATABASE_URL ของ prod ให้เขียนอยู่แล้ว ⇒ งานนี้ทำได้จาก **ในแอปที่ prod
// เท่านั้น** (บทเรียนเดียวกับ re-sync webhook ของ Meta 2026-08-08)
//
// idempotent: ยิงซ้ำได้ ใบที่เก็บแล้วถูกข้ามด้วย unique (shipmentId, reason) ที่ระดับฐาน

import { NextResponse, type NextRequest } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { backfillShipmentEvidence } from "@/services/iship.service";

export const dynamic = "force-dynamic";
// แต่ละใบยิง iShip 2 คำขอ — ชุดละ 20 ใบใช้เวลาได้ถึงหลักสิบวินาที
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit"));
  const shopId = url.searchParams.get("shopId") ?? undefined;

  const result = await backfillShipmentEvidence({
    limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined,
    shopId,
  });

  // คืนตัวเลขครบทุกช่อง รวม failed — ไม่ใช่แค่ "สำเร็จกี่ใบ" เพราะใบที่ล้มถูกบันทึกเป็นแถว
  // ที่มี error แล้ว (ไม่ใช่หายไปเฉย ๆ) คนที่กดต้องรู้ว่าต้องไปดูต่อไหม
  return NextResponse.json(result);
}
