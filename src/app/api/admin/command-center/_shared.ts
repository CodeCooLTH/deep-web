/**
 * 00049 — error mapping ที่ใช้ร่วมกันทั้ง 6 route ของ Command Center
 *
 * 🛑 API.md §5 บังคับว่าทุก error class ที่ `command-center.service.ts` โยน ต้องมี **branch
 * เจาะจงต่อ class** ไม่ใช่แค่ `try/catch` เฉย ๆ (กัน `feedback_service_error_route_mapping` ซ้ำ —
 * 00003 P2 `OutOfStockError` เคยตกหล่นจนคืน 500 แทน 400)
 *
 * ทำไมรวมไว้ไฟล์เดียวแทนที่จะก็อป `instanceof` ไป 6 route: การก็อปกฎเดียวกัน 6 ที่คือรูปแบบ
 * ที่ drift แน่นอน (HR16) — เพิ่ม error class ใหม่แล้วลืมแก้ route ที่ 4 จะไม่มีอะไรฟ้อง
 * ที่นี่มีจุดเดียวให้แก้ และมีเทส `[blocker]` ยืนยันว่า **ทุก class ที่ service โยน มี branch จริง**
 */

import { NextResponse } from "next/server"
import {
  GithubUnreachableError,
  GithubRateLimitedError,
  GithubAuthError,
  ItemNotFoundError,
  ItemNotApprovableError,
} from "@/services/command-center.service"

/** GET กับ POST พูดคนละประโยคกับ error ตัวเดียวกัน — GET บอกว่าระบบจะลองเอง POST บอกให้กดใหม่ */
export type RouteKind = "GET" | "POST"

export function mapCommandCenterError(err: unknown, kind: RouteKind): NextResponse {
  // 401 / ไม่ได้ตั้ง env — ปัญหา config ที่ user แก้เองไม่ได้
  // 🛑 log endpoint ได้ แต่ห้าม log token เด็ดขาด
  if (err instanceof GithubAuthError) {
    console.error("[command-center] GithubAuthError:", err.message)
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดของระบบ กรุณาติดต่อผู้ดูแล" },
      { status: 500 },
    )
  }

  // 🛑 write ไม่ degrade — ต้องแจ้งตรง ๆ ว่าล้มเหลว (GET จับเองใน service แล้วคืน cache)
  if (err instanceof GithubRateLimitedError) {
    return NextResponse.json(
      { error: "โควตาเรียก GitHub หมดชั่วคราว ลองใหม่อีกครั้งใน 1 นาที" },
      { status: 503 },
    )
  }

  if (err instanceof ItemNotApprovableError) {
    return NextResponse.json({ error: "ใบงานนี้ยังไม่มี PR ให้อนุมัติ" }, { status: 409 })
  }

  if (err instanceof ItemNotFoundError) {
    return NextResponse.json({ error: "ไม่พบใบงานนี้" }, { status: 404 })
  }

  if (err instanceof GithubUnreachableError) {
    return NextResponse.json(
      {
        error:
          kind === "GET"
            ? "อ่านข้อมูลจาก GitHub ไม่สำเร็จตอนนี้ — ระบบจะลองใหม่อัตโนมัติ"
            : "ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง",
      },
      { status: 502 },
    )
  }

  // ไม่รู้จัก = อย่ากลืน ต้องเห็นใน log ว่ามีชนิดใหม่โผล่มา
  console.error("[command-center] unmapped error:", err)
  return NextResponse.json({ error: "เกิดข้อผิดพลาดของระบบ กรุณาติดต่อผู้ดูแล" }, { status: 500 })
}

/** เลขใบงานจาก path — ไม่ใช่ตัวเลขบวก = 404 ไม่ใช่ 500 (อย่าให้ `NaN` ไหลเข้า service) */
export function parseItemNumber(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}
