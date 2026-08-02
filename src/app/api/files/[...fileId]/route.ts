import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { getFile } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { EXT_TO_MIME, isInlineExt } from "@/lib/attachment-mime";
import { canAccessShop } from "@/lib/shop-context";

// feature 00018 (user request 2026-07-24 "รองรับทุกอย่าง"): ตาราง ext→content-type ย้ายไป
// src/lib/attachment-mime.ts (SSOT ร่วมกับ mirror ฝั่ง channel-chat.service). ไฟล์ที่ browser
// เรนเดอร์ inline ไม่ได้ (docx/zip/…) serve เป็น octet-stream + Content-Disposition attachment
// ให้ดาวน์โหลดพร้อมชื่อไฟล์ แทนการเปิดแล้วเป็นหน้าขาว/พยายามเรนเดอร์ผิด

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

export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string[] }> }) {
  // catch-all (user 2026-07-25): fileId ชาร์ดเป็น YYYY/MM/DD/uuid.ext (มี slash) → รับเป็น segment array
  // แล้วต่อกลับด้วย "/" ให้ตรงกับ Key/path ที่ saveFile คืน. ไฟล์เก่า (flat "uuid.ext") = array 1 ตัว → เหมือนเดิม
  const fileId = (await params).fileId.join("/");

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

    // ตรวจ order-slip gate: fileId ที่ตรงกับ Order.slipFileId เป็นหลักฐานการชำระเงิน
    // ต้องอนุญาตเฉพาะเจ้าของร้านที่รับออเดอร์หรือ admin เท่านั้น
    // buyer (ไม่มี session) ขอดูสลิปผ่าน server ไม่ได้ (spec S-7 Q2) — ตั้งใจให้เป็น 401
    //
    // ทำไมใช้ findFirst ตรงๆ ไม่ใช้ cache เหมือน KYC:
    // pattern เดียวกับ TopUp slip ด้านบน — order slip access เกิดเฉพาะ
    // admin/เจ้าของร้านดูย้อนหลัง ไม่ใช่ public traffic สูง;
    // indexed query หนึ่งครั้งต่อ request ยอมรับได้; ไม่ log fileId (RC-8)
    if (!isSlipFile) {
      // ทำ order-slip check เฉพาะถ้ายังไม่ถูก gate โดย TopUp-slip path ข้างบน
      const orderSlip = await prisma.order.findFirst({
        where: { slipFileId: fileId },
        select: { id: true, shop: { select: { userId: true } } },
      });

      if (orderSlip) {
        isSlipFile = true;
        // ไฟล์นี้เป็น order payment slip — เลียนแบบ control flow TopUp-slip บรรทัดข้างบน
        const session = await getServerSession(authOptions);
        const user = session?.user as { id?: string; isAdmin?: boolean } | undefined;

        if (!user?.id) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const isAdmin = user.isAdmin === true;
        const isShopOwner = user.id === orderSlip.shop.userId;

        if (!isAdmin && !isShopOwner) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }
    }
  }

  // ตรวจ scam-evidence gate (PDPA): หลักฐานรายงานมิจฉาชีพ (สลิป/แชต) เป็นข้อมูลส่วนบุคคล
  // อนุญาตเฉพาะ admin หรือผู้รายงานเจ้าของไฟล์ — ห้าม serve public (ใครมี fileId ก็เปิดดูไม่ได้)
  let isScamEvidence = false;
  if (!sensitiveRecord && !isSlipFile) {
    const scam = await prisma.scamReport.findFirst({
      where: { evidence: { array_contains: fileId } },
      select: { reporterId: true },
    });

    if (scam) {
      isScamEvidence = true;
      const session = await getServerSession(authOptions);
      const user = session?.user as { id?: string; isAdmin?: boolean } | undefined;

      if (!user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (user.isAdmin !== true && user.id !== scam.reporterId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  // ตรวจ chat-document gate (2026-08-02, multi-attachment): "เอกสาร" ที่แนบในแชท (type=FILE)
  // อนุญาตเฉพาะคู่สนทนา — ร้าน (เจ้าของ/สมาชิก) หรือผู้ซื้อของเธรดนั้น
  //
  // ทำไมต้องมี: ไฟล์ที่ไม่เข้าเงื่อนไข gate ใดเลยถูก serve เป็น `public, max-age=86400` ให้ใครก็ได้
  // ที่รู้ fileId. ตอนที่แชทแนบได้แต่รูป ความเสี่ยงต่ำ — แต่พอเปิดให้แนบใบเสนอราคา ใบแจ้งหนี้
  // ไฟล์รายชื่อลูกค้า เอกสารพวกนั้นจะกลายเป็น URL สาธารณะทันที (uuid เดายาก แต่หลุดครั้งเดียว
  // = เปิดได้ถาวร)
  //
  // ทำไมเฉพาะ type=FILE ไม่ครอบรูป/วิดีโอ (ผลตัดสิน user 2026-08-02 ทางเลือก ข): ปิดความเสี่ยง
  // ที่ฟีเจอร์นี้สร้างขึ้นใหม่ โดยไม่เปลี่ยนพฤติกรรมของรูปแชทที่ใช้งานกันอยู่เดิม
  //
  // ไม่กระทบ Meta: Graph ดึงไฟล์ผ่าน presigned S3 URL ไม่ใช่ /api/files (ดู sendOutboundMessage)
  let isChatDocument = false;
  if (!sensitiveRecord && !isSlipFile && !isScamEvidence) {
    // index ChatMessage_imageUrl_idx รองรับ lookup นี้ (migration 20260802160000)
    const chatDoc = await prisma.chatMessage.findFirst({
      where: { imageUrl: fileId, type: "FILE" },
      select: { conversation: { select: { shopId: true, buyerUserId: true } } },
    });

    if (chatDoc?.conversation) {
      isChatDocument = true;
      const session = await getServerSession(authOptions);
      const user = session?.user as { id?: string; isAdmin?: boolean } | undefined;

      if (!user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const isBuyer = chatDoc.conversation.buyerUserId === user.id;
      const allowed =
        user.isAdmin === true || isBuyer || (await canAccessShop(chatDoc.conversation.shopId, user.id));
      if (!allowed) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  // ไฟล์ public หรือผ่าน auth check แล้ว — serve เหมือนเดิม
  const result = await getFile(fileId);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // isSensitive ครอบ KYC + slip + หลักฐานมิจฉาชีพ + เอกสารแนบในแชท — ไม่ควร cache ที่ browser/CDN
  const isSensitive = !!sensitiveRecord || isSlipFile || isScamEvidence || isChatDocument;

  const ext = result.ext.toLowerCase();
  const contentType = EXT_TO_MIME[ext] || "application/octet-stream";
  // ไฟล์ที่เรนเดอร์ inline ไม่ได้ (เอกสาร/zip/ชนิดแปลก) → บังคับดาวน์โหลดพร้อมชื่อไฟล์
  // basename เท่านั้น (fileId ชาร์ดมี slash — filename ต้องไม่มี path)
  const baseName = fileId.split("/").pop() || fileId;
  const disposition = isInlineExt(ext) ? "inline" : `attachment; filename="${baseName}"`;

  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": disposition,
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
