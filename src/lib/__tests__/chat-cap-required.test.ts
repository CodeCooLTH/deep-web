import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * 00071 T10 (หนี้ review T2) — ด่านแชทไม่มีค่าตั้งต้นของ cap:
 *  1) resolveOutboundContext รับ cap เป็นพารามิเตอร์บังคับ และไม่มี `?? 'H2'` (ผู้เรียกต้องประกาศเองว่าตัดสินด้วยสิทธิ์อะไร)
 *  2) memberLacksCap (ชื่อหลอกว่า "ขาดสิทธิ์" แต่ทำแค่ isShopMember) ถูกลบ — chat-scope เรียก isShopMember ตรง ๆ พร้อมเหตุผล 403/404
 *  3) คอมเมนต์ใน route แชทไม่อ้าง canAccessShop (ตัวไม่มี cap) อีก
 * ตัวสแกนรับซอร์สเพื่อ mutation
 */
const read = (p: string) => readFileSync(p, 'utf8')

export function outboundCapProblems(src: string): string[] {
  const i = src.indexOf('export async function resolveOutboundContext(')
  if (i < 0) return ['MISSING_FN']
  const body = src.slice(i, src.indexOf('\n}\n', i))
  const v: string[] = []
  if (!/\n\s+cap: Capability\n/.test(body)) v.push('CAP_NOT_REQUIRED')
  if (/params\.cap\s*\?\?/.test(body) || /\?\?\s*['"]H2['"]/.test(body)) v.push('CAP_DEFAULTED')
  return v
}

describe('แชท: cap บังคับ ไม่มีค่าตั้งต้น', () => {
  it('resolveOutboundContext: cap required และไม่มี ?? H2', () => {
    expect(outboundCapProblems(read('src/services/channel-chat.service.ts'))).toEqual([])
  })

  it('ผู้เรียกที่ส่งออกช่องทางนอกประกาศ H2 เอง (enqueue · outbox retry · sendOutboundMessage)', () => {
    const outbox = read('src/services/chat-outbox.service.ts')
    expect([...outbox.matchAll(/resolveOutboundContext\(\{ \.\.\.params, cap: 'H2' \}\)/g)]).toHaveLength(2)
    expect(read('src/services/channel-chat.service.ts')).toMatch(/resolveOutboundContext\(\{ \.\.\.params, cap: 'H2' \}\)/)
  })

  it('memberLacksCap ถูกลบ', () => {
    expect(read('src/lib/chat-scope.ts')).not.toMatch(/memberLacksCap/)
  })

  it('คอมเมนต์ route แชทไม่อ้าง canAccessShop (ไม่มี cap) ค้างอีก', () => {
    for (const f of [
      'src/app/api/chat/conversations/[id]/messages/[messageId]/route.ts',
      'src/app/api/chat/comments/[commentId]/resolve/route.ts',
      'src/app/api/chat/comments/[commentId]/private-reply/route.ts',
      'src/app/api/chat/comments/posts/[postId]/route.ts',
    ]) expect(read(f), f).not.toMatch(/canAccessShop(?!With)/)
  })

  it('mutation: ตัวสแกนจับ cap ที่กลับไปเป็น optional/มีค่าตั้งต้น', () => {
    const ok = `export async function resolveOutboundContext(\n  params: P & {\n    cap: Capability\n  },\n): Promise<OutboundConversation> {\n  x(params.cap)\n}\n`
    expect(outboundCapProblems(ok)).toEqual([])
    expect(outboundCapProblems(ok.replace('cap: Capability', 'cap?: Capability'))).toEqual(['CAP_NOT_REQUIRED'])
    expect(outboundCapProblems(ok.replace('x(params.cap)', "x(params.cap ?? 'H2')"))).toEqual(['CAP_DEFAULTED'])
  })
})
