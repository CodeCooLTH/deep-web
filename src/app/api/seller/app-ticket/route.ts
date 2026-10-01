// app-ticket — ออกตั๋ว session ใช้ครั้งเดียว สำหรับข้ามระหว่าง WebView ↔ Custom Tab (แอปผู้ขาย Android)
//
// ใช้สองจังหวะ (สเปก docs/superpowers/specs/2026-10-01-android-oauth-custom-tabs-design.md):
//   ขาไป  WebView → แท็บ : ไม่ส่ง nonce · ตั๋วพา session ของ WebView ไปใช้ในแท็บ (เชื่อมบัญชี/เชื่อมเพจ)
//   ขากลับ แท็บ → WebView : ส่ง nonce · ตั๋วผูก sha256(nonce) เพราะเดินทางผ่าน deepseller:// ที่ดักได้
//
// ไม่มี session = { ticket: null } ไม่ใช่ 401 — หน้าล็อกอินก็เรียกตัวนี้ (ยังไม่มีใครล็อกอิน = ปกติ)
// และขากลับที่ล็อกอินไม่สำเร็จก็ต้องส่งผู้ใช้กลับแอปไปเห็นข้อผิดพลาด ไม่ใช่ค้างในแท็บ
//
// 🛑 วางที่ /api/seller/* ไม่ใช่ /api/app/* — ยืนยันตัวตนด้วย cookie ⇒ ต้องได้ Origin-check ของ proxy
// (เหตุผลเดียวกับ /api/seller/push-token) ไม่งั้นเว็บอื่นยิงขอตั๋วของเหยื่อได้
import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isValidNonce } from '@/lib/app-oauth'
import { createMobileTicket } from '@/lib/mobile-ticket'
import { sessionUserId } from '@/lib/session-user'

const Body = v.object({ nonce: v.optional(v.string()) })

export async function POST(req: NextRequest) {
  const parsed = v.safeParse(Body, await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 })
  const { nonce } = parsed.output
  /* ส่ง nonce มาแต่รูปไม่ผ่าน = ผูกไม่ได้ ⇒ ห้ามออกตั๋วที่ไม่ผูกแทน (ตั๋วขากลับไม่ผูก = ใครดักได้ใช้ได้) */
  if (nonce !== undefined && !isValidNonce(nonce)) {
    return NextResponse.json({ error: 'INVALID_NONCE' }, { status: 400 })
  }

  const userId = sessionUserId(await getServerSession(authOptions))
  if (!userId) return NextResponse.json({ ticket: null })

  const ticket = await createMobileTicket(userId, 'enter', nonce ? { nonce } : undefined)
  return NextResponse.json({ ticket }, { headers: { 'Cache-Control': 'no-store' } })
}
