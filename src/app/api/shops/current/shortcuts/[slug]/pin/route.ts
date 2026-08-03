/**
 * POST /api/shops/current/shortcuts/{slug}/pin — เพิ่มเมนูลัด
 * feature 00027 — API.md §4.2 · idempotent (ปักซ้ำได้ ไม่ error)
 */
import { NextResponse } from 'next/server'
import { pinShortcut } from '@/services/shortcut.service'
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
    return respond(await pinShortcut(session, slug))
  } catch (e) {
    return handleShortcutError(e, 'POST /api/shops/current/shortcuts/[slug]/pin')
  }
}
