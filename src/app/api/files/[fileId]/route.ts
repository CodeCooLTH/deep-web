import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { getFile } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg",
  png: "image/png", webp: "image/webp",
};

// ---------------------------------------------------------------------------
// Module-level TTL cache สำหรับ KYC file lookup
//
// ปัญหาเดิม (GATE 8): findVerificationRecordByFileId ทำ full-table scan ทุก
// request รวมถึง unauthenticated public product/shop image loads ซึ่งเป็น
// endpoint ที่มี traffic สูงที่สุด → scalability regression
//
// วิธีแก้: เก็บ Map<fileId → {recordId, userId}> ไว้ใน memory, refresh ทุก 60s
// แทนที่จะ query per request
//
// Trade-off ที่ยอมรับ (hotfix scope):
//   - KYC document ที่เพิ่งอัปโหลดอาจถูก serve เป็น public ได้นานสูงสุด <60s
//     ก่อน cache จะ refresh — ยอมรับได้สำหรับ hotfix เพราะ:
//       1. window สั้นมาก (60s)
//       2. document ใหม่ต้องผ่าน admin review อยู่แล้ว ไม่มีข้อมูลอ่อนไหวทันที
//   - long-term fix ที่ถูกต้อง = denormalized indexed fileIds column ใน schema
//     (backlog item) เพื่อ O(1) lookup โดยไม่ต้องใช้ cache
//   - double-scan หาก request หลายตัว expire พร้อมกันเป็นไปได้ แต่ยอมรับได้
//     เพราะ VerificationRecord table มีขนาดเล็กและ scan ไม่บ่อย
// ---------------------------------------------------------------------------

type KycEntry = { recordId: string; userId: string };

let kycCache: Map<string, KycEntry> = new Map();
let kycCacheExpiresAt = 0; // epoch ms; 0 = ยังไม่เคย populate

const KYC_CACHE_TTL_MS = 60_000; // 60 วินาที

/**
 * โหลด (หรือใช้ cache ที่ยังสด) map ของ fileId → KycEntry
 * ครอบคลุมทุก fileId ที่อยู่ใน VerificationRecord.documents ใน query เดียว
 */
async function getKycMap(): Promise<Map<string, KycEntry>> {
  const now = Date.now();
  if (now < kycCacheExpiresAt) {
    // cache ยังสด — ใช้ได้เลย
    return kycCache;
  }

  // cache หมดอายุหรือยังไม่เคย populate — scan ครั้งเดียว แล้ว repopulate
  const records = await prisma.verificationRecord.findMany({
    where: { documents: { not: Prisma.AnyNull } },
    select: { id: true, userId: true, documents: true },
  });

  const fresh = new Map<string, KycEntry>();

  for (const record of records) {
    const docs = record.documents;
    if (!docs || typeof docs !== "object" || Array.isArray(docs)) continue;

    for (const val of Object.values(docs as Record<string, unknown>)) {
      if (typeof val !== "string") continue;

      // รองรับ 2 รูปแบบ (defensive เหมือนเดิม):
      //   1. raw fileId
      //   2. URL ที่มี /api/files/<fileId> เป็น substring
      const rawId = val.includes("/api/files/")
        ? val.split("/api/files/")[1]?.split("/")[0]
        : val;

      if (rawId) {
        fresh.set(rawId, { recordId: record.id, userId: record.userId });
      }
    }
  }

  kycCache = fresh;
  kycCacheExpiresAt = now + KYC_CACHE_TTL_MS;

  return fresh;
}

/**
 * ตรวจสอบว่า fileId นี้อยู่ใน VerificationRecord.documents หรือไม่
 *
 * documents คือ Json? ที่เก็บ flat object เช่น
 *   { idCard: "uuid.jpg", selfie: "uuid2.png", shopPhoto: "uuid3.jpg" }
 *   { bizDoc: "uuid.pdf", registrationNumber: "0105...", address: "..." }
 *
 * ค่าที่เป็น fileId จะเป็น raw string ตรงๆ (ไม่ใช่ URL) — ดูจาก
 * VerificationForm.tsx:135-138 และ VerificationClient.tsx:94 ที่ assign
 * const documents = { idCard: idCardId, selfie: selfieId, ... }
 * โดย idCardId คือ string ที่ได้จาก POST /api/upload → { fileId }.
 *
 * ใช้ module-level TTL cache (60s) แทน per-request scan
 */
async function findVerificationRecordByFileId(
  fileId: string
): Promise<{ id: string; userId: string } | null> {
  const map = await getKycMap();
  const entry = map.get(fileId);
  if (!entry) return null;
  return { id: entry.recordId, userId: entry.userId };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;

  // ตรวจก่อนว่าไฟล์นี้อยู่ใน VerificationRecord หรือไม่
  const sensitiveRecord = await findVerificationRecordByFileId(fileId);

  if (sensitiveRecord) {
    // ไฟล์นี้เป็น KYC document — ต้องมี session ที่เป็นเจ้าของหรือ admin
    const session = await getServerSession(authOptions);
    const user = session?.user as { id?: string; isAdmin?: boolean } | undefined;

    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isOwner = user.id === sensitiveRecord.userId;
    const isAdmin = user.isAdmin === true;

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // ตรวจ slip gate: fileId ที่ตรงกับ TopUpRequest.slipFileId เป็นเอกสารการเงิน
  // ต้องอนุญาตเฉพาะ admin หรือเจ้าของร้านที่ส่ง slip (spec AR-3 ระบุ "admin-only viewer"
  // แต่ implementation bug เดิม serve unauthenticated = ขัด spec → ปิด S-C5)
  //
  // ทำไมใช้ findFirst ตรงๆ ไม่ใช้ in-memory map เหมือน KYC:
  // TopUpRequest table มีขนาดเล็ก + slip access เกิดเฉพาะตอน admin/เจ้าของร้าน
  // ดูรูป (ไม่ใช่ public traffic สูง) — overhead หนึ่ง indexed query ต่อ request
  // ยอมรับได้ (pattern เดียวกับ owner-check ทั่วไปใน project); ไม่ log fileId (RC-8)
  let isSlipFile = false;
  if (!sensitiveRecord) {
    // ทำ slip check เฉพาะถ้ายังไม่ถูก gate โดย KYC path
    // (ถ้าเป็นทั้ง KYC และ slip พร้อมกัน — ไม่น่าเกิด — KYC path ข้างบนจะ gate ก่อนแล้ว)
    const slipTopUp = await prisma.topUpRequest.findFirst({
      where: { slipFileId: fileId },
      select: { id: true, shop: { select: { userId: true } } },
    });

    if (slipTopUp) {
      isSlipFile = true;
      // ไฟล์นี้เป็น slip โอนเงิน — เลียนแบบ control flow KYC บรรทัด 117-129
      const session = await getServerSession(authOptions);
      const user = session?.user as { id?: string; isAdmin?: boolean } | undefined;

      if (!user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const isAdmin = user.isAdmin === true;
      const isShopOwner = user.id === slipTopUp.shop.userId;

      if (!isAdmin && !isShopOwner) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  // ไฟล์ public หรือผ่าน auth check แล้ว — serve เหมือนเดิม
  const result = await getFile(fileId);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // isSensitive ครอบทั้ง KYC และ slip — ทั้งสองไม่ควร cache ที่ browser/CDN
  const isSensitive = !!sensitiveRecord || isSlipFile;

  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": MIME[result.ext] || "application/octet-stream",
      // ไฟล์ KYC/slip ไม่ควร cache ที่ browser/CDN นาน (อาจถูก revoke)
      // ไฟล์ทั่วไป (product image) ยังคง public, max-age=86400 เหมือนเดิม
      "Cache-Control": isSensitive
        ? "private, no-cache"
        : "public, max-age=86400",
      // nosniff — defense-in-depth เพราะ phase นี้เพิ่มไฟล์ admin-uploaded badge image
      // ป้องกัน browser sniff content-type เป็น text/html แล้วรัน script
      "X-Content-Type-Options": "nosniff",
    },
  });
}
