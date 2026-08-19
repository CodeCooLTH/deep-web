import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Fix round 1 (feature 00038) — reviewer ชี้ว่า countUnansweredForShops() ไม่มีเทสเลย ซึ่งเป็น
 * เหตุผลที่บั๊ก "เติม isAutoReply=false เข้า subquery" หลุดออกไปได้ (ขัดกับ AC-CR-25/BR-CR-S1)
 *
 * หนี้ #1 (2026-08-09) — countUnansweredForShops() ถูกรื้อให้เรียก countCommentPostStatesByShop()
 * ตัวเดียวกับที่ listCommentPosts() ใช้คำนวณ counts.unanswered (เดิมมี $queryRaw ของตัวเองแยกกัน
 * สองชุดที่ "น่าจะตรงกัน") — เทสชุดนี้จึงต้องอัปเดตให้ตรงกับ SQL รูปแบบใหม่ (CTE 3 กลุ่ม แทนที่
 * count(DISTINCT postId) ตัวเดียว) แต่ยัง**คงเจตนาเดิมไว้ทุกข้อ**: เงื่อนไขที่ตัดสิน "ยังไม่ตอบ"
 * ต้องไม่มี isAutoReply, ยังเช็ค isFromPage, และ scope ด้วย shopIds ที่รับเข้ามาจริง
 *
 * เทสชุดนี้ไม่ผูกกับผลลัพธ์ตัวเลข (count) เพราะฟังก์ชันพึ่ง $queryRaw ดิบที่ต้องมี Postgres จริงถึงจะ
 * รันได้ — สิ่งที่ทดสอบได้แบบ unit จริง ๆ (ไม่ใช่ integration) คือ **สตริง SQL ที่ประกอบขึ้นก่อนส่งเข้า
 * $queryRaw** ว่ามีเงื่อนไขที่ถูกต้องหรือไม่ — mock เฉพาะ boundary (`$queryRaw` tag function +
 * `assertShopsAccessible`) แล้ว capture argument จริงที่โค้ดจริงส่งเข้ามา ไม่ใช่ assert ค่าที่ตัวเอง
 * เขียนขึ้นมาเอง (feedback_verify_dont_assume — เทสที่ mock ตามข้อสันนิษฐานแล้วเขียวเสมอไม่มีความหมาย)
 *
 * ดูเทสที่พิสูจน์ว่า countUnansweredForShops() กับ counts.unanswered (listCommentPosts) ให้เลขตรงกัน
 * เสมอที่ comment-post-counts.test.ts (หนี้ #1 ข้อหลัก)
 */

let capturedStrings: string[] | null = null
let capturedValues: unknown[] = []

vi.mock('@/lib/prisma', () => {
  const db: Record<string, unknown> = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      capturedStrings = [...strings]
      capturedValues = values
      // BigInt(0) แทน literal 0n — tsconfig target ES2017 ไม่รองรับ BigInt literal syntax
      return [{ all: BigInt(0), unanswered: BigInt(0), botAnswered: BigInt(0), humanAnswered: BigInt(0) }]
    }),
  }
  return { prisma: db }
})

// assertShopsAccessible เดิมเรียก listAccessibleShopIds() ซึ่งต้องมี DB จริง — mock ที่ boundary ของ
// shop-context ตรง ๆ (pattern เดียวกับ comment-private-reply.service.test.ts) ให้ผ่านเสมอ เพราะ
// เทสชุดนี้ไม่ได้ทดสอบ authorization — ทดสอบแค่รูปร่างของ SQL ที่ประกอบขึ้นหลังผ่านด่านนั้นแล้ว
vi.mock('@/lib/shop-context', () => ({
  assertShopsAccessible: vi.fn().mockResolvedValue(undefined),
  canAccessShop: vi.fn(),
}))

import { Prisma } from '@prisma/client'
import { countUnansweredForShops } from '@/services/page-comment.service'

/**
 * แยก CASE เป็นคู่ ๆ `{ predicate, result }` ตามลำดับที่ Postgres จะประเมินจริง
 *
 * 🛑 เขียนใหม่ 2026-08-09 ให้ผูกกับ **ความหมาย** ไม่ใช่รูปร่างของสตริง — เวอร์ชันก่อนหน้าตัด
 * substring ด้วย `sql.indexOf('WHEN NOT EXISTS (')` แล้วแดงทันทีที่ CASE ถูกเรียงใหม่ (ย้าย
 * UNANSWERED ไปเป็น ELSE) ทั้งที่กฎที่มันตั้งใจปกป้องไม่ได้เปลี่ยนเลยสักข้อ — บทเรียนเดียวกับ
 * retro 2026-08-09 P11 ("เทสที่ผูกกับตำแหน่งแตกเพราะการเพิ่มที่ไม่เกี่ยวกัน")
 */
/**
 * ประกอบ SQL จริงคืนจาก template — ต้อง **กาง `Prisma.Sql` ที่ interpolate เข้าไปด้วย**
 *
 * 🛑 ตั้งแต่ 2026-08-19 นิยาม CASE ถูกยกออกไปเป็น fragment เดียว (`COMMENT_STATE_CASE`) ที่ทุก
 * query interpolate เข้ามา — เนื้อ SQL ของมันจึงไม่อยู่ใน `strings` ของ template อีกต่อไป แต่ไป
 * อยู่ใน `values` การ `join('')` เฉพาะ strings จะได้ SQL ที่ไม่มี CASE เลย แล้วเทสทั้งชุดที่ตรวจ
 * ลำดับ WHEN จะแดงทั้งที่กฎที่มันปกป้องไม่ได้เปลี่ยนสักข้อ (ด่านที่ผูกกับ *วิธีเขียน* พังตอน refactor
 * — รอยเดิมของไฟล์นี้เองเมื่อ 2026-08-09)
 */
function capturedSql(): string {
  const strings = capturedStrings ?? []
  return strings
    .map((str, i) => {
      const v = capturedValues[i]
      const frag = typeof (v as Prisma.Sql | undefined)?.sql === 'string' ? (v as Prisma.Sql).sql : ''
      return str + frag
    })
    .join('')
}

function caseBranches(sql: string): Array<{ predicate: string; result: string }> {
  const out: Array<{ predicate: string; result: string }> = []
  const re = /WHEN([\s\S]*?)THEN\s+'([A-Z_]+)'/g
  let m: RegExpExecArray | null
  while ((m = re.exec(sql)) !== null) out.push({ predicate: m[1]!, result: m[2]! })
  return out
}

/** branch แรกที่ให้ผลลัพธ์ตามที่ขอ (ลำดับใน CASE = ลำดับที่ Postgres ประเมิน) */
function firstBranchFor(sql: string, result: string) {
  return caseBranches(sql).find((b) => b.result === result)
}

/**
 * เฉพาะ CASE **ระดับคอมเมนต์** (CTE `customer_comments`) — ต้องตัดออกมาก่อนเสมอ
 *
 * ตัวนับระดับ **โพสต์** (`countCommentPostStatesByShop`) มี CASE สองชั้น: ชั้นคอมเมนต์ (ตัวที่กฎ
 * ทั้งหมดพูดถึง) และชั้นโพสต์ (`post_states` ที่รวบด้วย bool_or แบบ "แย่สุดชนะ") ชั้นโพสต์มี
 * `THEN 'UNANSWERED'` แบบเชิงบวกซึ่ง**ถูกต้องแล้ว** — ถ้าไม่ตัด scope ก่อน เทสจะไปจับตัวนั้น
 * แล้วแดงโดยไม่มีอะไรผิดจริง
 *
 * 🛑 ตั้งแต่ 2026-08-15 badge เปลี่ยนไปใช้ตัวนับระดับ **คอมเมนต์** (`countCommentStatesByShop`)
 * ซึ่ง **ไม่มีชั้น `post_states`** เพราะไม่ต้องรวบขึ้นเป็นโพสต์อีก ⇒ ตัวตัดต้องยอมรับทั้งสองรูป
 * ไม่ใช่บังคับว่าต้องเจอ `post_states AS (` (ของเดิมบังคับ แล้วแดงทันทีที่หน่วยเปลี่ยน ทั้งที่
 * กฎที่เทสปกป้องยังถูกทุกข้อ — เทสที่ผูกกับ *วิธีเขียน* พังเมื่อ refactor ทั้งที่ของยังครบ
 * `rule-must-be-enforced-not-described.md`)
 */
function commentCaseSql(sql: string): string {
  const start = sql.indexOf('customer_comments AS (')
  expect(start).toBeGreaterThanOrEqual(0)
  const postLayer = sql.indexOf('post_states AS (')
  // ไม่มีชั้นโพสต์ = ตัวนับระดับคอมเมนต์ → CASE ทั้งก้อนที่เหลือคือชั้นคอมเมนต์อยู่แล้ว
  const end = postLayer > start ? postLayer : sql.length
  return sql.slice(start, end)
}

describe('countUnansweredForShops — SQL ที่ยิงจริง (Fix round 1: ย้อน isAutoReply ออก)', () => {
  beforeEach(() => {
    capturedStrings = null
    capturedValues = []
  })

  it('[blocker] คอมเมนต์ที่บอทตอบสาธารณะแล้ว ต้องหลุดจาก UNANSWERED — branch ที่ดักไว้ต้องไม่มี isAutoReply (AC-CR-25)', async () => {
    await countUnansweredForShops({ shopIds: ['shop-1'], actorUserId: 'user-1' })
    const sql = commentCaseSql(capturedSql())
    // กฎที่ปกป้อง: "มีคำตอบของเพจอยู่ข้างใต้ ไม่ว่าบอทหรือคนเขียน = ไม่ใช่ยังไม่ตอบ"
    // ในโครง CASE ปัจจุบัน ตัวที่ดักเคส "บอทตอบล้วน" คือ branch ที่ให้ผล BOT_ANSWERED
    // ซึ่งต้องเช็คแค่ isFromPage เปล่า ๆ — ถ้ามีใครเติม isAutoReply เข้าไป เคสนั้นจะร่วงไป
    // เป็น UNANSWERED แล้ว badge จะไม่มีวันลดลงเมื่อบอทตอบครบทั้งโพสต์
    const botBranch = firstBranchFor(sql, 'BOT_ANSWERED')
    expect(botBranch).toBeDefined()
    expect(botBranch!.predicate).toContain('isFromPage')
    expect(botBranch!.predicate).not.toContain('isAutoReply')
  })

  it('[blocker] UNANSWERED ต้องเป็นทางออกสุดท้ายของ CASE ไม่ใช่ branch ที่ match เอง', async () => {
    await countUnansweredForShops({ shopIds: ['shop-1'], actorUserId: 'user-1' })
    const sql = commentCaseSql(capturedSql())
    // ถ้าใครเปลี่ยนกลับไปเป็น `WHEN ... THEN 'UNANSWERED'` แปลว่ามีเงื่อนไข "เชิงบวก" ที่ตัดสินว่า
    // ยังไม่ตอบ ซึ่งจะต้องไปไล่ปิดทุกเคสที่ไม่ใช่เองทีละอัน (นั่นคือรูปแบบที่พลาดมาแล้ว 2 รอบ)
    expect(sql).toContain("ELSE 'UNANSWERED'")
    expect(caseBranches(sql).some((b) => b.result === 'UNANSWERED')).toBe(false)
  })

  it('[blocker] คอมเมนต์ที่ทักแชทส่วนตัวสำเร็จแล้ว ต้องหลุดจาก UNANSWERED (user report 2026-08-09)', async () => {
    await countUnansweredForShops({ shopIds: ['shop-1'], actorUserId: 'user-1' })
    const sql = commentCaseSql(capturedSql())
    // ต้องมี branch ที่อ่าน CommentReplyLog ก่อนตกไป ELSE ไม่งั้นคอมเมนต์ที่ถูกดึงเข้าห้องแชท
    // จะค้างในคิว "ยังไม่ตอบ" ตลอดไป (คิวไม่มีวันลดลงแม้งานจบในกล่องข้อความแล้ว)
    const logBranches = caseBranches(sql).filter((b) => b.predicate.includes('CommentReplyLog'))
    expect(logBranches.length).toBeGreaterThan(0)
    // 🛑 ทุก branch ที่อ่าน log ต้องบังคับ privateReplyStatus = 'SENT' เป๊ะ —
    // 'SKIPPED'/'FAILED' คือ "มีแถวแต่ไม่ได้ทัก" ถ้าเช็คแค่ว่ามีแถว คอมเมนต์ที่ทักไม่สำเร็จจะ
    // หายจากคิวทั้งที่ยังไม่มีใครคุยกับลูกค้าเลย (อันตรายกว่าบั๊กเดิม)
    for (const b of logBranches) expect(b.predicate).toContain("\"privateReplyStatus\" = 'SENT'")
  })

  it('ยังเช็ค isFromPage = true ในเงื่อนไข NOT EXISTS (ต้องมีคำตอบของเพจอยู่ข้างใต้ถึงนับว่าตอบแล้ว)', async () => {
    await countUnansweredForShops({ shopIds: ['shop-1'], actorUserId: 'user-1' })
    const sql = capturedSql()
    expect(sql).toContain('isFromPage')
  })

  it('ยัง scope ด้วย shopIds ที่รับเข้ามา — Prisma.join() ห่อ shopIds จริง ไม่หลุด scope ข้ามร้าน', async () => {
    await countUnansweredForShops({ shopIds: ['shop-1', 'shop-2'], actorUserId: 'user-1' })
    const sql = capturedSql()
    expect(sql).toContain('shopId')
    // ค่าที่ Prisma.join() ห่อไว้ต้องเป็น shopIds ตัวจริงที่ countUnansweredForShops ได้รับมา
    // (Prisma.join คืน Sql fragment ที่มี .values เป็นอาร์เรย์ค่าดิบ) — ไม่ใช่แค่ assert ว่า "มี
    // สตริง shopId" ลอย ๆ ซึ่งเขียวได้แม้ scope ผิด
    const joinFragment = capturedValues[0] as { values: string[] }
    expect(joinFragment.values).toEqual(['shop-1', 'shop-2'])
  })

  it('ไม่ scope ด้วย shopChannelId/ค้นหา (badge ไม่รู้จักตัวกรองพวกนั้น นับทั้งร้านเสมอ)', async () => {
    await countUnansweredForShops({ shopIds: ['shop-1'], actorUserId: 'user-1' })
    // interpolation ที่ 2 (channelFilter) และ 3 (searchFilter) ต้องเป็น Prisma.empty ตัวเดียวกันเป๊ะ
    // (Sql instance เดี่ยว export จาก @prisma/client) เมื่อไม่ได้ส่ง shopChannelId/q เข้ามา — เช็คแบบนี้
    // เพราะเนื้อ SQL จริงของ fragment ที่ interpolate เข้าไปไม่ปรากฏใน capturedStrings (มันเป็น value
    // ไม่ใช่ literal text ของ template) grep ข้อความจึงมองไม่เห็นว่ามันว่างจริงหรือเปล่า
    //
    // 🛑 เช็คจาก "ชนิดของค่า" ไม่ใช่ตำแหน่ง — เดิม hardcode index 1/2 แล้วพังทันทีที่มีการเพิ่ม
    // interpolation ใหม่ (provider, 2026-08-09) ทั้งที่พฤติกรรมที่เทสตั้งใจตรวจไม่ได้เปลี่ยนเลย
    const fragments = capturedValues.filter(
      (v): v is Prisma.Sql => typeof (v as Prisma.Sql | undefined)?.sql === 'string',
    )
    // ทุก Sql fragment ที่ interpolate เข้าไปต้องเป็น Prisma.empty (ยกเว้น join ของ shopIds ซึ่งถูก
    // ตรวจในเทสก่อนหน้า และมี .values ไม่ว่าง)
    for (const f of fragments) {
      if ((f as { values?: unknown[] }).values?.length) continue // join ของ shopIds
      // COMMENT_STATE_CASE (นิยามสถานะที่ยกออกมาเป็น fragment เดียว 2026-08-19) เป็น Sql ที่ไม่ว่าง
      // และไม่มี values — ต้องยกเว้นให้ ไม่งั้นด่านนี้จะบังคับให้ทุก fragment ต้องว่าง ซึ่งขัดกับ
      // การรวมนิยามให้เหลือที่เดียว (ตรวจเนื้อของมันแยกในเทสลำดับ WHEN ข้างบนแล้ว)
      if (f.sql.includes("THEN 'HUMAN_ANSWERED'")) continue
      expect(f).toBe(Prisma.empty)
    }
    // badge นับทั้งร้านเสมอ → ต้องไม่มีค่า provider อื่นนอกจาก MESSENGER หลุดเข้าไป
    expect(capturedValues.filter((v) => typeof v === 'string')).toEqual(['MESSENGER'])
  })
})
