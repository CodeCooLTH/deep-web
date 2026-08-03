/**
 * POST /api/shops/current/shortcuts/{slug}/unpin — เอาเมนูลัดออก
 * feature 00027 — API.md §4.3 · idempotent (ถอดตัวที่ไม่ได้ปักอยู่ ไม่ error)
 *
 * 409 MIN_REQUIRED เกิดเฉพาะตอนถอด "ช่องที่ยังใช้ได้ช่องสุดท้าย" — ช่องที่หมดสิทธิ์แล้ว
 * ถอดได้เสมอแม้เป็นช่องสุดท้าย (คำตัดสิน user 2026-08-02 — ดู shortcut.service.ts)
 */
import { NextResponse } from 'next/server'
import { unpinShortcut } from '@/services/shortcut.service'
import { getSessionOr401, validateSlug, respond, handleShortcutError } from '../../_shared'

export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { session, response } = await getSessionOr401()
  if (!session) return response

  const { slug } = await params
  if (!validateSlug(slug)) {
    return NextResponse.json({ error: 'รหัสเมนูไม่ถูกต้อง', code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  try {
    return respond(await unpinShortcut(session, slug))
  } catch (e) {
    return handleShortcutError(e, 'POST /api/shops/current/shortcuts/[slug]/unpin')
  }
}
