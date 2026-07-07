import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { AppPlaceBidSchema } from '@/lib/app-validations'
import { requireAppUser } from '@/lib/app-auth'
import { placeBid, BidError } from '@/services/auction.service'

// POST /api/app/auctions/[id]/bid  { amount }  (ต้องล็อกอิน)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAppUser(request)
  if ('response' in auth) return auth.response
  const { user } = auth

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (body === null) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const parsed = v.safeParse(AppPlaceBidSchema, body)
  if (!parsed.success) return NextResponse.json({ error: 'จำนวนเงินไม่ถูกต้อง' }, { status: 400 })

  try {
    const auction = await placeBid(id, user.id, parsed.output.amount)
    return NextResponse.json(auction)
  } catch (e) {
    if (e instanceof BidError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status })
    console.error('[POST /api/app/auctions/[id]/bid] placeBid failed', e)
    return NextResponse.json({ error: 'วางบิดไม่สำเร็จ' }, { status: 500 })
  }
}
