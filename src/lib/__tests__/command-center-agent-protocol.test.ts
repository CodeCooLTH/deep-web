/**
 * [blocker] กันโปรโตคอลสายพาน Command Center (00049 · P3) หายไปจาก prompt ของ agent เงียบ ๆ
 *
 * ทำไมต้องมี: FR-CC-03/04/05 ทั้งชุดเป็น "ข้อตกลงเชิงกระบวนการ" ที่ไม่มีโค้ดไหนบังคับได้ —
 * Hermes รัน subagent เอง service ของเราไม่ได้อยู่ในเส้นทางที่เขียน comment/ป้ายนั้นเลย
 * (SRS TFR-CC-03 เขียนข้อนี้ไว้ตรงตัว) ⇒ สิ่งเดียวที่ทำให้สายพานเดินคือ **ข้อความใน
 * `.claude/agents/*.md`** ซึ่งเป็นไฟล์ที่ถูกแก้บ่อย ไม่มี type ไม่มี build ไม่มีอะไรอ่านมันเลย
 * ลบทิ้งทั้งหัวข้อก็ไม่มีอะไรแดง — จนกว่าจะสั่งงานจริงแล้วใบงานค้างกลางสายพานโดยไม่มีใครรู้
 *
 * `docs/conventions/rule-must-be-enforced-not-described.md`: กฎที่ "เขียนไว้" ยังไม่ใช่กฎที่
 * "บังคับได้" — เทสนี้คือด่านที่ทำให้การลบกฎออกมีเสียงดัง
 *
 * 🛑 ขอบเขตที่เทสนี้พิสูจน์ได้จริง (อย่าอ่านเกินนี้):
 *   พิสูจน์ว่า **คำสั่งยังอยู่ใน prompt** — ไม่ได้พิสูจน์ว่า **agent ทำตาม**
 *   อย่างหลังพิสูจน์ได้ทางเดียวคือสั่งงานจริงผ่าน Hermes (P5 ซึ่งยังไม่มี)
 *
 * 🛑 เทสนี้แดง = prompt ของ agent กับ `command-center-agent-protocol.md` ไม่ตรงกันแล้ว
 *    แก้ที่ prompt ให้ตรงเอกสาร หรือแก้ทั้งคู่พร้อมกัน — ห้ามแก้เทสให้ผ่านเฉย ๆ
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const PROTOCOL_DOC = join(ROOT, 'docs/conventions/command-center-agent-protocol.md')

/** ชื่อไฟล์เอกสารที่ prompt ทุกตัวต้องชี้กลับมา — SSOT ตัวเดียวของโปรโตคอล */
const PROTOCOL_DOC_NAME = 'command-center-agent-protocol.md'

/** marker ของบล็อกส่งต่อ ต้องตรงตัวอักษร เพราะ Controller ตัดออกมาด้วยสตริงนี้ */
const HANDOFF_MARKER = '=== DEEP-HANDOFF ==='

/** 6 ขั้นที่มี agent จริง — ขั้น ⑦ `stage:ready` ไม่มี agent (รอ user เคาะ) จึงไม่อยู่ในตารางนี้ */
const STAGES = [
  { agent: 'safepay-planner', label: 'stage:plan' },
  { agent: 'safepay-ux', label: 'stage:ux' },
  { agent: 'safepay-developer', label: 'stage:build' },
  { agent: 'safepay-reviewer', label: 'stage:review' },
  { agent: 'safepay-qa', label: 'stage:qa' },
  { agent: 'safepay-docs', label: 'stage:docs' },
] as const

function readAgent(name: string): string {
  const path = join(ROOT, '.claude/agents', `${name}.md`)
  if (!existsSync(path)) throw new Error(`ไม่พบ prompt ของ agent: ${path}`)
  return readFileSync(path, 'utf8')
}

describe('[blocker] โปรโตคอลสายพาน Command Center อยู่ครบใน prompt ของ agent ทั้ง 6 ขั้น', () => {
  it('เอกสาร SSOT ของโปรโตคอลยังอยู่', () => {
    expect(
      existsSync(PROTOCOL_DOC),
      'docs/conventions/command-center-agent-protocol.md หายไป — prompt ทุกตัวชี้มาที่ไฟล์นี้',
    ).toBe(true)
  })

  it.each(STAGES)('$agent — ชี้กลับเอกสาร SSOT', ({ agent }) => {
    expect(readAgent(agent)).toContain(PROTOCOL_DOC_NAME)
  })

  it.each(STAGES)('$agent — สั่งให้ปิดรายงานด้วยบล็อกส่งต่อ', ({ agent }) => {
    expect(readAgent(agent)).toContain(HANDOFF_MARKER)
  })

  it.each(STAGES)('$agent — ประกาศป้ายของขั้นตัวเอง ($label)', ({ agent, label }) => {
    expect(readAgent(agent)).toContain(label)
  })

  /* ทุกขั้นต้องห้ามยิง `gh` เอง — 3 ใน 6 ตัวไม่มี `Bash` อยู่แล้ว ถ้าอีก 3 ตัวที่มีทำเอง
     จะได้ป้ายที่ถูกเขียนจาก 2 เส้นทางที่ไม่รู้จักกัน (คลาสเดียวกับ HR16) */
  it.each(STAGES)('$agent — ห้ามยิง gh / ย้ายป้ายเอง', ({ agent }) => {
    expect(readAgent(agent)).toMatch(/ห้าม(ยิง)?\s*`?gh`?/)
  })
})

describe('[blocker] กฎเฉพาะขั้นที่พังเงียบที่สุดถ้าหาย', () => {
  /* ถ้าขั้น docs ส่งต่อเป็น `พร้อมขึ้น` = agent ข้ามประตูอนุมัติเดียวของทั้งระบบ
     แล้ว auto-merge.yml จะเก็บขึ้น prod ให้เองภายใน ~8 นาที โดยไม่มีคนดูสักตา (FR-CC-11/D-1) */
  it('safepay-docs ส่งต่อเป็น stage:ready และห้ามติด "พร้อมขึ้น" เอง', () => {
    const src = readAgent('safepay-docs')
    expect(src).toContain('stage:ready')
    expect(src).toMatch(/ห้าม[^\n]*พร้อมขึ้น/)
  })

  /* planner เป็นคนเดียวที่ตัดสินว่าข้ามขั้น UX ได้ไหม (FR-CC-04) และยังไม่มีด่านอัตโนมัติจับ
     ถ้ารายการ path หายไป งาน UI จะไหลตรงเข้าขั้นเขียนโค้ดโดยไม่มี Design Spec = ละเมิด HR8 */
  it('safepay-planner ถือรายการ path ที่บังคับให้ผ่านขั้น UX', () => {
    const src = readAgent('safepay-planner')
    expect(src).toContain('ต้องผ่านขั้น UX:')
    for (const p of ['src/app/(paces)/**', 'src/app/(marketing)/**', 'src/components/**']) {
      expect(src, `รายการ path ของ HR8 ขาด ${p}`).toContain(p)
    }
  })

  /* reviewer คือคนแรกที่เห็นว่างาน UI ไม่เคยผ่านขั้น ② เพราะไม่มีด่านอัตโนมัติจับ (SRS §8 R-3) */
  it('safepay-reviewer ตีกลับงาน UI ที่ข้ามขั้น UX', () => {
    expect(readAgent('safepay-reviewer')).toContain('stage:ux')
  })

  /* ขั้น ③ ผูก PR กลับไปหา Issue ด้วย `Closes #NN` เส้นเดียว — ไม่มีแล้วป้ายตามกันไม่เจอ (TD-002) */
  it('safepay-developer สั่งให้ PR body มี Closes #NN', () => {
    expect(readAgent('safepay-developer')).toContain('Closes #NN')
  })

  /* "ยังไม่ได้ทดสอบ" กับ "ทดสอบแล้วผ่าน" ต่างกันคนละเรื่อง — ถ้า QA ตอบ `ผ่าน` ตอนเทสไม่ได้
     ใบงานจะเดินหน้าไปขั้น docs แล้วรอ user เคาะ โดยไม่เคยมีใครเปิดดูจริงสักครั้ง */
  it('safepay-qa มีทางออก "ติดขัด" เมื่อทดสอบไม่ได้', () => {
    expect(readAgent('safepay-qa')).toContain('ติดขัด')
  })

  /* HR8 ของ CLAUDE.md เขียนว่า "ทุก task" ไม่ใช่ "task ที่ไม่ trivial" — บรรทัดยกเว้นเดิมใน
     prompt ของ ux ขัดข้อนี้ตรงตัว จึงถูกถอดเหลือ backend-only
     ⚠️ เช็คเชิงบวกที่ *บรรทัดที่ทำงานจริง* ไม่ใช่ grep หาคำว่า "trivial" ทั้งไฟล์ — ไฟล์นี้เขียน
     คำอธิบายว่า "เดิมยกเว้น … trivial tweak" ไว้ด้วย การ grep เชิงลบจะแดงจากคำเตือนของตัวเอง
     (รอยเดิม: grep gate ของ HR9 แดงค้าง 2026-08-02→03) */
  it('safepay-ux ยกเว้นได้เฉพาะ backend-only ไม่ใช่ "งาน UI ที่ trivial"', () => {
    const src = readAgent('safepay-ux')
    const heading = src.indexOf('## เมื่อไม่ต้อง invoke')
    expect(heading, 'หัวข้อ "เมื่อไม่ต้อง invoke" หายไปจาก prompt ของ ux').toBeGreaterThan(-1)
    const section = src.slice(heading, heading + 400)
    expect(section).toMatch(/backend-only[^\n]*เท่านั้น/)
  })
})

describe('[blocker] เอกสาร SSOT ยังนิยามของที่ prompt อ้างถึงครบ', () => {
  const doc = () => readFileSync(PROTOCOL_DOC, 'utf8')

  it('นิยามป้ายครบทั้ง 7 ขั้น', () => {
    const src = doc()
    for (const label of [...STAGES.map((s) => s.label), 'stage:ready']) {
      expect(src, `เอกสารไม่ได้นิยามป้าย ${label}`).toContain(label)
    }
  })

  it('มี 4 หัวข้อบังคับของบล็อกส่งต่อครบตาม FR-CC-03 AC-03-1', () => {
    const src = doc()
    for (const h of ['สรุปผล', 'ไฟล์ที่ต้องแตะ', 'ข้อควรระวังสำหรับขั้นถัดไป', 'ป้ายถัดไป']) {
      expect(src, `เอกสารขาดหัวข้อบังคับ "${h}"`).toContain(h)
    }
  })

  it('ยังบังคับลำดับ comment ก่อน ป้ายทีหลัง (AC-03-3)', () => {
    expect(doc()).toMatch(/comment[^\n]*ก่อน[^\n]*ป้าย/)
  })
})
