import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  reviewVerification,
  SelfReviewForbiddenError,
  VerificationNotFoundError,
} from "@/services/verification.service";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();

  // self-review guard + not-found อยู่ใน service layer (single source of truth, FR-2.6)
  // route แค่ map typed error → HTTP status
  try {
    const updated = await reviewVerification(id, admin.id, body);
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof SelfReviewForbiddenError) {
      return NextResponse.json(
        { error: "ไม่สามารถอนุมัติ/ปฏิเสธคำขอยืนยันตัวตนของตนเองได้" },
        { status: 403 },
      );
    }
    if (e instanceof VerificationNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw e;
  }
}
