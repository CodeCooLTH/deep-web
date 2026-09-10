import { describe, it, expect } from 'vitest'
import { HUMAN_AGENT_REPLY_WHERE } from '@/lib/agent-performance'
import { humanAgentReplySql } from '@/lib/agent-performance-sql'
import { isHumanAgentReply } from '@/lib/agent-performance'

const MSG = {
  senderRole: 'm."senderRole"',
  autoReplyKind: 'm."autoReplyKind"',
  senderUserId: 'm."senderUserId"',
  isDeleted: 'm."isDeleted"',
} as const

/**
 * [blocker] — "แอดมินที่ตอบ" ต้องมีนิยามเดียว 3 รูปต้องตรงกันเสมอ (HR16)
 *
 * รูปที่ 3 (`HUMAN_AGENT_REPLY_WHERE`) เพิ่มมา 2026-09-10 ตอนทำกองรูปแอดมินในรายการแชท
 * ถ้าใครแก้รูปใดรูปหนึ่งแล้วลืมอีก 2 รูป จะไม่มีอะไรฟ้อง แต่ความหมายเพี้ยนคนละทาง:
 * ตก `autoReplyKind` = บอทกลายเป็นแอดมิน · ตก `senderUserId` = คนที่ตอบจาก Business Suite
 * ถูกนับทั้งที่ระบุตัวไม่ได้ · ตก `isDeleted` = ข้อความที่ถูกลบยังนับเป็นการตอบ
 */
describe('[blocker] นิยาม "คำตอบของแอดมินจริง" ต้องตรงกันทั้ง 3 รูป', () => {
  it('Prisma where มีครบ 4 เงื่อนไข ค่าตรงตามที่ตั้งใจ', () => {
    expect(HUMAN_AGENT_REPLY_WHERE).toEqual({
      senderRole: 'SHOP',
      autoReplyKind: null,
      senderUserId: { not: null },
      isDeleted: false,
    })
  })

  it('SQL ฉบับเดียวกันพูดถึงครบทั้ง 4 คอลัมน์ด้วยเงื่อนไขเดียวกัน', () => {
    const sql = humanAgentReplySql(MSG)
    expect(sql).toContain(`${MSG.senderRole} = 'SHOP'`)
    expect(sql).toContain(`${MSG.autoReplyKind} IS NULL`)
    expect(sql).toContain(`${MSG.senderUserId} IS NOT NULL`)
    expect(sql).toContain(`${MSG.isDeleted} = false`)
  })

  /**
   * ผูก where กับ predicate ด้วยตัวอย่างจริง — ทุกแถวที่ where อ้างว่าจะดึงมา predicate ต้องรับ
   * และทุกแถวที่ where ตัดทิ้ง predicate ต้องปฏิเสธ
   */
  const base = { senderRole: 'SHOP' as const, autoReplyKind: null, senderUserId: 'u1', isDeleted: false }
  const cases: { name: string; ev: typeof base; want: boolean }[] = [
    { name: 'แอดมินกดตอบใน Deep', ev: base, want: true },
    { name: 'ตอบจาก Business Suite (echo ไม่มีตัวตน)', ev: { ...base, senderUserId: null as never }, want: false },
    { name: 'บอท/ตอบอัตโนมัติ', ev: { ...base, autoReplyKind: 'AUTO' as never }, want: false },
    { name: 'ข้อความที่ถูกลบ', ev: { ...base, isDeleted: true }, want: false },
    { name: 'ข้อความของลูกค้า', ev: { ...base, senderRole: 'BUYER' as never }, want: false },
  ]
  for (const c of cases) {
    it(`predicate: ${c.name} → ${c.want}`, () => {
      expect(isHumanAgentReply(c.ev as never)).toBe(c.want)
      // เทียบกับ where ทีละเงื่อนไขแบบเดียวกัน — ถ้า where ถูกแก้ให้หลวมลง เคสนี้จะแดง
      const w = HUMAN_AGENT_REPLY_WHERE
      const matchesWhere =
        c.ev.senderRole === w.senderRole &&
        c.ev.autoReplyKind === w.autoReplyKind &&
        (c.ev.senderUserId !== null) === (w.senderUserId.not === null) &&
        c.ev.isDeleted === w.isDeleted
      expect(matchesWhere).toBe(c.want)
    })
  }
})

/**
 * [blocker] — ต้อง enrich ทั้ง RSC และ route
 *
 * ทำทางเดียว = กองรูปไม่ขึ้นตอนโหลดหน้าแรกแล้วค่อยโผล่หลัง refetch ซึ่งผู้ใช้อ่านว่าเป็นบั๊ก
 * (บทเรียนซ้ำของไฟล์นี้: enrichWithOrderStage / enrichWithAutoReplyBadge เขียนกำกับไว้เองแล้ว)
 * สแกนซอร์สเพราะทั้งสองไฟล์แตะ prisma และรีโปนี้ไม่มี jsdom
 */
describe('[blocker] enrichWithThreadAgents ต้องถูกเรียกทั้ง 2 ทาง', () => {
  const strip = (src: string) =>
    src
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n')

  it('เรียกจริงทั้ง RSC และ route (ไม่ใช่แค่ import ทิ้งไว้)', async () => {
    const fs = await import('fs')
    for (const f of [
      'src/app/(paces)/seller/(chat)/inbox/page.tsx',
      'src/app/api/chat/conversations/route.ts',
    ]) {
      const code = strip(fs.readFileSync(f, 'utf8'))
      expect(code, f).toMatch(/enrichWithThreadAgents\(/)
    }
  })

  /** ชุดปุ่มลอยถูกถอดออกแล้ว — ห้ามใครเผลอเอากลับมาแล้วทับกองรูปที่มุมขวาล่าง */
  it('ไม่มีชุดปุ่มลอย/เมนู ⋯ ของแถวหลงเหลือ', async () => {
    const fs = await import('fs')
    const code = strip(
      fs.readFileSync('src/app/(paces)/seller/(chat)/inbox/components/InboxList.tsx', 'utf8'),
    )
    expect(code).not.toMatch(/rowMenuId/)
    expect(code).not.toMatch(/from '\.\/ConversationRowMenu'/)
    expect(fs.existsSync('src/app/(paces)/seller/(chat)/inbox/components/ConversationRowMenu.tsx')).toBe(false)
  })
})
