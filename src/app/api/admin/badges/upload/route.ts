import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveFile } from "@/lib/storage";
import { BadgeImageUploadSchema } from "@/lib/validations";

// SVG magic-bytes patterns — ทำไม: MIME type ที่ client ส่งมาปลอมได้ง่าย
// ต้องตรวจ content จริงด้วย; SVG เริ่มต้นด้วย XML declaration หรือ <svg tag
// ทั้งสองรูปแบบนับเป็น XSS vector เมื่อ serve ผ่าน browser โดยไม่มี sandbox
const SVG_MAGIC_PATTERNS = [
  /^\s*<\?xml/i,          // <?xml ... ?> ... <svg>
  /^\s*<svg[\s>]/i,       // <svg ...> หรือ <svg>
  /^\s*<!DOCTYPE\s+svg/i, // <!DOCTYPE svg ...>
] as const;

function hasSvgContent(buffer: Buffer): boolean {
  // ตรวจเฉพาะ 512 bytes แรก — เพียงพอสำหรับ header detection
  const head = buffer.subarray(0, 512).toString("utf8");
  return SVG_MAGIC_PATTERNS.some((re) => re.test(head));
}

// ตรวจนามสกุลไฟล์เผื่อ attacker rename .svg → .png
function hasSvgExtension(filename: string): boolean {
  return /\.svg$/i.test(filename);
}

export async function POST(request: NextRequest) {
  // ─── Auth guard: admin เท่านั้น ────────────────────────────────────────────
  // ใช้ pattern เดียวกับ src/app/api/admin/badges/route.ts (บรรทัด 3-9)
  // requireAdmin() → null หมายความว่า unauthenticated หรือ not admin
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึง" }, { status: 403 });
  }

  // ─── Parse FormData ─────────────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "รูปแบบ request ไม่ถูกต้อง" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const badgeId = formData.get("badgeId") as string | null;

  if (!file) {
    return NextResponse.json({ error: "ไม่พบไฟล์ในคำขอ" }, { status: 400 });
  }

  // ─── ตรวจนามสกุล SVG ก่อน validate schema ──────────────────────────────────
  if (hasSvgExtension(file.name)) {
    return NextResponse.json({ error: "ไม่รองรับไฟล์ SVG (ความเสี่ยง XSS)" }, { status: 400 });
  }

  // ─── Valibot schema validation (mime, size, badgeId) ───────────────────────
  const parsed = v.safeParse(BadgeImageUploadSchema, {
    mime: file.type,
    size: file.size,
    badgeId: badgeId ?? "",
  });
  if (!parsed.success) {
    const issues = v.flatten(parsed.issues);
    const first =
      Object.values(issues.nested ?? {}).flat()[0] ??
      issues.root?.[0] ??
      "ข้อมูลไม่ถูกต้อง";
    return NextResponse.json({ error: first }, { status: 400 });
  }

  const { badgeId: validatedBadgeId } = parsed.output;

  // ─── ตรวจ magic bytes SVG ในเนื้อหาไฟล์จริง ─────────────────────────────────
  // ทำหลัง schema pass เพื่อให้ผ่าน mime whitelist ก่อนแล้วค่อย check bytes
  const buffer = Buffer.from(await file.arrayBuffer());
  if (hasSvgContent(buffer)) {
    return NextResponse.json(
      { error: "ตรวจพบ SVG content ในไฟล์ (ความเสี่ยง XSS)" },
      { status: 400 },
    );
  }

  // ─── ตรวจ badgeId ว่ามีจริงใน DB ─────────────────────────────────────────
  const badge = await prisma.badge.findUnique({ where: { id: validatedBadgeId } });
  if (!badge) {
    return NextResponse.json({ error: "ไม่พบ badge ที่ระบุ" }, { status: 404 });
  }

  // ─── บันทึกไฟล์และอัปเดต badge.imageUrl ────────────────────────────────────
  let fileId: string;
  try {
    // สร้าง File object จาก buffer ที่อ่านแล้ว เพื่อส่งให้ saveFile
    // ใช้ buffer ที่อ่านแล้ว (ไม่ต้อง read stream อีกรอบ — stream consumed แล้ว)
    const reconstructed = new File([buffer], file.name, { type: file.type });
    fileId = await saveFile(reconstructed);
  } catch (err) {
    console.error("[admin/badges/upload] saveFile failed:", err);
    return NextResponse.json({ error: "บันทึกไฟล์ไม่สำเร็จ" }, { status: 500 });
  }

  const imageUrl = `/api/files/${fileId}`;

  try {
    await prisma.badge.update({
      where: { id: validatedBadgeId },
      data: { imageUrl },
    });
  } catch (err) {
    console.error("[admin/badges/upload] prisma.badge.update failed:", err);
    return NextResponse.json({ error: "อัปเดตข้อมูล badge ไม่สำเร็จ" }, { status: 500 });
  }

  return NextResponse.json({ imageUrl }, { status: 200 });
}
