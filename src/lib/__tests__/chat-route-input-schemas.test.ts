import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as v from 'valibot'
import {
  ChatPathIdSchema,
  ChatReactionBodySchema,
  ChatCommentBodySchema,
  ChatResolveExpiredBodySchema,
} from '@/lib/validations'

/**
 * ด่าน input ของ route แชทที่เคยตรวจด้วยมือ (2026-11-23)
 *
 * 🛑 schema ต้อง "รับทุกอย่างที่ client จริงส่ง" — เว็บ (CommentsClient / ห้องแชท) และแอป native
 * (deep-seller-app src/features/chat/api/endpoints.ts) · เข้มเกิน = ปุ่มในแอปพังเงียบ ๆ
 */
const UUID = '3f2a1c4e-8b7d-4e6f-9a1b-2c3d4e5f6a7b'
const ok = (s: Parameters<typeof v.safeParse>[0], x: unknown) => v.safeParse(s, x).success

describe('ChatPathIdSchema', () => {
  it('รับ uuid', () => expect(ok(ChatPathIdSchema, UUID)).toBe(true))
  it.each(['', 'abc', '../etc', `${UUID}x`, "1' OR '1'='1"])('ปฏิเสธ %j', (x) =>
    expect(ok(ChatPathIdSchema, x)).toBe(false),
  )
})

describe('ChatReactionBodySchema', () => {
  it.each([{ emoji: '👍' }, { emoji: '👨‍👩‍👧' }, { emoji: null }, {}])('รับ %j', (x) =>
    expect(ok(ChatReactionBodySchema, x)).toBe(true),
  )
  it.each([{ emoji: '' }, { emoji: 'ข้อความยาวเกินอิโมจิ' }, { emoji: 5 }, null])('ปฏิเสธ %j', (x) =>
    expect(ok(ChatReactionBodySchema, x)).toBe(false),
  )
})

describe('ChatCommentBodySchema', () => {
  it('ตัดช่องว่างหัวท้ายของข้อความ', () => {
    const r = v.safeParse(ChatCommentBodySchema, { message: '  สวัสดี  ' })
    expect(r.success && r.output.message).toBe('สวัสดี')
  })
  it.each([
    { message: 'hi' },
    { fileId: '2026/11/23/abc.jpg' },
    { message: 'hi', fileId: null },
    { message: '', fileId: '' }, // route ตอบ "กรุณาพิมพ์…" เอง ไม่ใช่ schema
  ])('รับ %j', (x) => expect(ok(ChatCommentBodySchema, x)).toBe(true))
  it('ปฏิเสธข้อความเกิน 8000 ตัว', () =>
    expect(ok(ChatCommentBodySchema, { message: 'ก'.repeat(8001) })).toBe(false))
  it.each([{ message: 1 }, { fileId: {} }, null])('ปฏิเสธ %j', (x) =>
    expect(ok(ChatCommentBodySchema, x)).toBe(false),
  )
})

describe('ChatResolveExpiredBodySchema', () => {
  it.each([
    null, // body อ่านไม่ได้ = ไม่กรอง (พฤติกรรมเดิม)
    {},
    { channelId: null, provider: 'ALL' }, // เว็บ: channelId || null
    { channelId: '', provider: 'MESSENGER' },
    { channelId: UUID, provider: 'INSTAGRAM' },
    { provider: 'อะไรก็ได้' }, // route allow-list → ALL
  ])('รับ %j', (x) => expect(ok(ChatResolveExpiredBodySchema, x)).toBe(true))
  it.each([{ channelId: 'not-a-uuid' }, { channelId: 5 }])('ปฏิเสธ %j', (x) =>
    expect(ok(ChatResolveExpiredBodySchema, x)).toBe(false),
  )
})

/** ทุก route ที่เคยตรวจด้วยมือต้องผ่าน schema กลาง — กันมีคนถอดออกตอนแก้ภายหลัง */
describe('route ใช้ schema กลาง', () => {
  const R = 'src/app/api/chat'
  it.each([
    [`${R}/conversations/[id]/read/route.ts`, 'ChatPathIdSchema'],
    [`${R}/conversations/[id]/typing/route.ts`, 'ChatPathIdSchema'],
    [`${R}/conversations/[id]/thread-control/route.ts`, 'ChatPathIdSchema'],
    [`${R}/conversations/[id]/messages/[messageId]/route.ts`, 'ChatReactionBodySchema'],
    [`${R}/comments/[commentId]/reply/route.ts`, 'ChatCommentBodySchema'],
    [`${R}/comments/posts/[postId]/comment/route.ts`, 'ChatCommentBodySchema'],
    [`${R}/comments/resolve-expired/route.ts`, 'ChatResolveExpiredBodySchema'],
  ])('%s → %s', (file, schema) => {
    expect(readFileSync(join(process.cwd(), file), 'utf8')).toContain(`v.safeParse(${schema}`)
  })

  it('typing ยังตอบ 200 เมื่อ id ผิดรูป (ของประดับห้ามแดง)', () => {
    const s = readFileSync(join(process.cwd(), `${R}/conversations/[id]/typing/route.ts`), 'utf8')
    expect(s).toMatch(/ChatPathIdSchema, id\)\.success\) return NextResponse\.json\(\{ sent: false \}\)/)
  })
})
