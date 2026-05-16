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
 * เราตรวจ 2 รูปแบบ (defensive):
 *   1. ค่าตรงๆ เท่ากับ fileId
 *   2. ค่าเป็น string ที่มี "/api/files/<fileId>" เป็น substring
 *      (รองรับถ้า client เก็บ URL แทน raw id ในอนาคต)
 *
 * เพื่อหลีกเลี่ยง full-table scan ที่หนัก: query เฉพาะ record ที่
 * documents IS NOT NULL แล้ว filter ใน JS — VerificationRecord จะมีน้อย
 * (user ละ 1-2 record), table นี้ไม่ใช่ hot table
 */
async function findVerificationRecordByFileId(fileId: string) {
  const records = await prisma.verificationRecord.findMany({
    where: { documents: { not: Prisma.AnyNull } },
    select: { id: true, userId: true, documents: true },
  });

  const urlForm = `/api/files/${fileId}`;

  for (const record of records) {
    const docs = record.documents;
    if (!docs || typeof docs !== "object" || Array.isArray(docs)) continue;

    for (const val of Object.values(docs as Record<string, unknown>)) {
      if (typeof val !== "string") continue;
      if (val === fileId || val.includes(urlForm)) {
        return record;
      }
    }
  }

  return null;
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

  // ไฟล์ public หรือผ่าน auth check แล้ว — serve เหมือนเดิม
  const result = await getFile(fileId);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": MIME[result.ext] || "application/octet-stream",
      // ไฟล์ KYC ไม่ควร cache ที่ browser/CDN นาน (อาจถูก revoke)
      // ไฟล์ทั่วไป (product image) ยังคง public, max-age=86400 เหมือนเดิม
      "Cache-Control": sensitiveRecord
        ? "private, no-cache"
        : "public, max-age=86400",
    },
  });
}
