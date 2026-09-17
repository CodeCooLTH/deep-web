/**
 * POST /api/auth/cleanup — ล้างคุกกี้ที่ `signOut()` ไม่ได้ล้าง (แก้ 2026-09-17)
 *
 * เรียก **ก่อน** `signOut()` เสมอ (ท่าเดียวกับการถอน push token ใน `SignOutCard`)
 * รายชื่อ + เหตุผล + ตัวที่ห้ามล้าง อยู่ที่ `src/lib/stale-auth-cookies.ts`
 *
 * 🛑 ไม่ต้องมี session ก็เรียกได้ และไม่คืนข้อมูลอะไรเลย — มันแค่สั่งลบคุกกี้ของผู้เรียกเอง
 * บังคับให้ต้องล็อกอินก่อนจะกลายเป็นกับดัก: คนที่ session เพี้ยนจนใช้งานไม่ได้
 * คือคนที่ต้องการล้างมากที่สุด แต่จะเป็นคนเดียวที่เรียกไม่ได้
 *
 * `/api/auth/*` ถูกยกเว้นจาก `guardApi` อยู่แล้ว (proxy.ts:26) จึงไม่ติด Origin-check
 */
import { NextResponse } from 'next/server'

import { STALE_AUTH_COOKIES } from '@/lib/stale-auth-cookies'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  /* ลบทั้งชื่อแบบ `__Secure-` (prod/https) และชื่อธรรมดา (dev/http) — ไม่รู้ว่าอยู่ฝั่งไหน
     และการลบชื่อที่ไม่มีอยู่ไม่มีผลข้างเคียง */
  for (const name of STALE_AUTH_COOKIES) res.cookies.delete(name)
  return res
}
