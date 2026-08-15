/**
 * POST /api/account/link/reclaim — ยึดการเชื่อม OAuth คืนจาก "บัญชีค้าง" หลังผู้ใช้กดยืนยัน
 *
 * ## ทำไมต้องมี
 *
 * ผู้ใช้ที่มีบัญชี Deep อยู่แล้ว กดปุ่ม "เข้าสู่ระบบด้วย Apple" ที่หน้าล็อกอินโดยไม่ตั้งใจ —
 * บนมือถือ Face ID อนุมัติในวินาทีเดียวโดยไม่ต้องกรอกอะไร ผู้ใช้จึงคิดว่ายังไม่ได้ทำอะไร
 * แต่ระบบสร้างบัญชีใหม่ให้แล้ว จากนั้นเขาตันทุกทาง (ถอดไม่ได้เพราะไม่มีเบอร์ · ใส่เบอร์ไม่ได้
 * เพราะเบอร์อยู่กับบัญชีจริง · ลบเองไม่ได้เพราะ proxy ขังไว้ที่ /register · เชื่อมก็ไม่ได้)
 * ⇒ Apple ID นั้นใช้กับ Deep ไม่ได้อีกเลย (เจอจริงบน prod 2026-08-15)
 *
 * ## ลำดับ
 *
 *   1. ผู้ใช้กด "เชื่อมต่อ Apple" ที่ /account → OAuth ตามปกติ
 *   2. `signIn` callback เจอว่า id มีเจ้าของเป็นบัญชีค้าง → **ไม่ทำอะไร** ออกตั๋วเซ็นชื่อกลับมา
 *   3. UI ถามยืนยัน (ต้องถามเสมอ — ดู `signReclaimTicket`)
 *   4. ผู้ใช้กดตกลง → มาที่นี่
 *
 * 🛑 **ตรวจซ้ำทุกอย่างที่นี่ ห้ามเชื่อตั๋วอย่างเดียว** — ระหว่างที่ผู้ใช้กำลังอ่านคำถาม
 * (นานได้ถึง 10 นาที) บัญชีค้างอาจถูกกรอกเบอร์จนกลายเป็นบัญชีจริงไปแล้ว ตั๋วบอกได้แค่ว่า
 * "ตอนออกตั๋วสถานะเป็นแบบนี้" ไม่ได้บอกว่าตอนนี้ยังเป็นอยู่
 *
 * Base (โครง route + session guard + valibot): src/app/api/account/link/start/route.ts
 */
import { NextResponse } from 'next/server'
import * as v from 'valibot'

import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sessionUserId } from '@/lib/session-user'
import { verifyReclaimTicket } from '@/lib/link-intent'
import { classifyLinkConflict, shouldCloseHolder } from '@/lib/link-conflict'
import { ACCOUNT_DELETE_REASON } from '@/lib/account-deletion'

/** ต้องตรงกับ oauthMap ใน lib/auth.ts — provider ที่แมปเป็น enum ของ AuthAccount ได้ */
const PROVIDER_ENUM: Record<string, 'FACEBOOK' | 'LINE' | 'INSTAGRAM' | 'APPLE'> = {
  facebook: 'FACEBOOK',
  line: 'LINE',
  instagram: 'INSTAGRAM',
  apple: 'APPLE',
}

const BodySchema = v.object({
  ticket: v.pipe(v.string(), v.minLength(1), v.maxLength(4096)),
})

export async function POST(request: Request) {
  const userId = sessionUserId(await getServerSession(authOptions))
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = v.safeParse(BodySchema, await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })

  const ticket = verifyReclaimTicket(parsed.output.ticket)
  if (!ticket) {
    return NextResponse.json({ error: 'คำขอหมดอายุ กรุณากดเชื่อมต่อใหม่อีกครั้ง' }, { status: 400 })
  }

  /**
   * 🛑 ตั๋วต้องเป็นของ "คนที่กำลังกดยืนยัน" เท่านั้น
   *
   * นี่คือด่านที่ทำให้ตั๋วหลุดไปก็ไร้ประโยชน์ — คนอื่นเอาไปยิงจะไม่ผ่านเพราะ session คนละคน
   * (ตั๋วอยู่ใน URL ซึ่งติดไปกับ Referer/ประวัติเบราว์เซอร์ได้ จึงต้องถือว่าอาจรั่วเสมอ)
   */
  if (ticket.userId !== userId) {
    return NextResponse.json({ error: 'คำขอนี้ไม่ใช่ของบัญชีที่กำลังใช้งาน' }, { status: 403 })
  }

  const providerEnum = PROVIDER_ENUM[ticket.provider]
  if (!providerEnum) return NextResponse.json({ error: 'ไม่รองรับผู้ให้บริการนี้' }, { status: 400 })

  const existing = await prisma.authAccount.findUnique({
    where: {
      provider_providerAccountId: { provider: providerEnum, providerAccountId: ticket.providerAccountId },
    },
    select: { userId: true },
  })

  // ไม่มีใครถือแล้ว (เจ้าของถอดเองระหว่างนี้) → ผูกให้เลย ไม่ต้องปิดบัญชีใคร
  if (!existing) {
    await prisma.authAccount.create({
      data: { userId, provider: providerEnum, providerAccountId: ticket.providerAccountId },
    })
    return NextResponse.json({ ok: true, closedHolder: false, provider: ticket.provider })
  }

  // ผูกกับเราอยู่แล้ว (กดยืนยันซ้ำ / อีกแท็บทำไปแล้ว) → idempotent
  if (existing.userId === userId)
    return NextResponse.json({ ok: true, closedHolder: false, provider: ticket.provider })

  // เจ้าของเปลี่ยนมือระหว่างที่ผู้ใช้กำลังตัดสินใจ → ตั๋วใช้กับเจ้าของคนใหม่ไม่ได้
  if (existing.userId !== ticket.holderUserId) {
    return NextResponse.json({ error: 'สถานะเปลี่ยนไปแล้ว กรุณากดเชื่อมต่อใหม่อีกครั้ง' }, { status: 409 })
  }

  const holder = await prisma.user.findUnique({
    where: { id: existing.userId },
    select: {
      deletedAt: true,
      phone: true,
      passwordHash: true,
      _count: { select: { shopMemberships: true } },
      shops: { where: { deletedAt: null }, select: { slug: true, _count: { select: { orders: true } } } },
      authAccounts: { where: { provider: { not: providerEnum } }, select: { id: true } },
    },
  })
  if (!holder) return NextResponse.json({ error: 'ไม่พบบัญชีปลายทาง' }, { status: 409 })

  // ตรวจซ้ำด้วยเกณฑ์เดียวกับตอนออกตั๋ว — สถานะอาจเปลี่ยนไประหว่างนี้
  const verdict = classifyLinkConflict({
    deletedAt: holder.deletedAt,
    phone: holder.phone,
    passwordHash: holder.passwordHash,
    completedShopCount: holder.shops.filter((s) => s.slug !== null).length,
    orderCount: holder.shops.reduce((n, s) => n + s._count.orders, 0),
    shopMemberCount: holder._count.shopMemberships,
    otherAuthAccountCount: holder.authAccounts.length,
  })

  if (verdict === 'BLOCKED') {
    return NextResponse.json(
      { error: 'บัญชีเดิมมีข้อมูลอยู่แล้ว ไม่สามารถยึดคืนอัตโนมัติได้' },
      { status: 409 },
    )
  }

  /**
   * ย้ายแถว AuthAccount + ปิดบัญชีค้าง ใน**ทรานแซกชันเดียว**
   *
   * 🛑 ต้อง `update` (ย้ายเจ้าของ) ไม่ใช่ `delete` แล้ว `create` — ถ้าล้มกลางระหว่างสองคำสั่ง
   * จะไม่มีใครถือ id นั้นเลย และถ้าปิดบัญชีสำเร็จแต่ย้ายไม่สำเร็จ จะเหลือสถานะที่แย่กว่าเดิม:
   * id ติดอยู่กับบัญชีที่ปิดไปแล้ว = ไม่มีใครใช้ได้และไม่มีใครเข้าไปแก้ได้อีก
   *
   * ไม่เรียก `deleteAccount()` เพราะตัวนั้นบังคับ `confirmText` ที่ผู้ใช้พิมพ์เอง — ออกแบบมา
   * สำหรับ "ลบบัญชีของตัวเองขณะยืนอยู่ในบัญชีนั้น" ซึ่งไม่ใช่สถานการณ์นี้
   */
  const closedHolder = shouldCloseHolder(verdict)
  await prisma.$transaction(async (tx) => {
    await tx.authAccount.update({
      where: {
        provider_providerAccountId: { provider: providerEnum, providerAccountId: ticket.providerAccountId },
      },
      data: { userId },
    })
    if (closedHolder) {
      // updateMany + deletedAt:null = optimistic guard กันเขียนทับกรณีถูกปิดไปแล้วพร้อมกัน
      await tx.user.updateMany({
        where: { id: existing.userId, deletedAt: null },
        data: { deletedAt: new Date(), deletedReason: ACCOUNT_DELETE_REASON.USER_DELETED },
      })
    }
  })

  /**
   * 🛑 ต้องคืน `provider` กลับไปด้วย — ฝั่ง UI เก็บสถานะการเชื่อมไว้ใน `useState` ซึ่ง
   * **ไม่ sync กับ prop ที่เปลี่ยนหลัง mount** ⇒ `router.refresh()` อย่างเดียวไม่ทำให้แถวขยับ
   * (ผมพลาดข้อนี้รอบแรกทั้งที่คอมเมนต์ในไฟล์นั้นเขียนเตือนไว้เอง — user เจอทันที:
   * "มี alert บอก แต่ปุ่มยังไม่เชื่อมให้ ต้องออกเข้าใหม่")
   */
  return NextResponse.json({ ok: true, closedHolder, provider: ticket.provider })
}
