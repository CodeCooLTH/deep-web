/**
 * [blocker] ThreadMessageList / InboxRow ต้องเป็น component ระดับ module ที่ห่อ React.memo
 * และต้องถูก "ใช้" จริงโดยผู้เรียก (ไม่ถูก inline กลับเข้า map ของแม่)
 *
 * ที่มา: docs/superpowers/specs/2026-09-29-chat-smooth-audit.md (M1/M2) — เดิมทั้งเธรด/ทั้งรายการวาดใหม่
 * ทุกครั้งที่กดแป้น/นาฬิกา tick/refresh เพราะบับเบิล/แถวเป็น JSX ก้อนเดียวใน render ของแม่
 * ไม่มี gate ไหนของโปรเจกต์จับการถอย memo ได้ (tsc/build/eslint ผ่านหมด) — เทสสแกนซอร์สนี้คือด่านเดียว
 *
 * สแกนซอร์สหลังตัดคอมเมนต์ (ไฟล์ที่ทำถูกมักเขียนคำเตือนของกฎนี้ไว้ในคอมเมนต์ — ห้ามให้ตัวเองแดง)
 * และใช้ `^[ \t]+` ไม่ใช่ `^\s+` (`\s` กิน `\n` ⇒ false positive)
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const CHAT = 'src/app/(paces)/seller/(chat)/inbox'
const CASES = [
  {
    name: 'ThreadMessageList',
    file: `${CHAT}/[conversationId]/components/ThreadMessageList.tsx`,
    parent: `${CHAT}/[conversationId]/components/ChatThread.tsx`,
  },
  {
    name: 'InboxRow',
    file: `${CHAT}/components/InboxRow.tsx`,
    parent: `${CHAT}/components/InboxList.tsx`,
  },
]

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}
const read = (p: string) => stripComments(readFileSync(p, 'utf8'))

describe.each(CASES)('$name', ({ name, file, parent }) => {
  it('ส่งออกแบบห่อ React.memo ที่ระดับ module', () => {
    const src = read(file)
    expect(src).toMatch(new RegExp(`^export const ${name} = memo\\(`, 'm'))
  })

  it('ผู้เรียกใช้ <Component /> จริง และไม่ประกาศชื่อเดียวกันซ้อนในตัว render', () => {
    const src = read(parent)
    expect(src).toContain(`<${name}`)
    // ประกาศเยื้อง = อยู่ในฟังก์ชันอื่น (ระดับ module ต้องชิดซ้าย)
    expect(src).not.toMatch(new RegExp(`^[ \\t]+(function|const|let) ${name}\\b`, 'm'))
  })

  it('ไม่ประกาศ component ซ้อนในตัวมันเอง', () => {
    const src = read(file)
    expect(src).not.toMatch(/^[ \t]+function [A-Z]\w*\(/m)
    expect(src).not.toMatch(/^[ \t]+const [A-Z]\w* = (memo\(|\(\{)/m)
  })
})

describe('ThreadMessageList props', () => {
  it('ไม่รับเวลาปัจจุบัน (nowMs/nowTs) — ส่งมาแล้ว memo พังทุก tick', () => {
    const src = read(CASES[0].file)
    expect(src).not.toMatch(/\bnow(Ms|Ts)\b/)
    expect(src).toContain('lastMsgIsOld')
  })
})

describe('InboxRow props', () => {
  it('รับ isActive/actioning เป็น boolean ต่อแถว ไม่รับ id ที่เลือกของทั้งรายการ', () => {
    const src = read(CASES[1].file)
    expect(src).not.toMatch(/\bactiveConversationId\b/)
    expect(src).not.toMatch(/\bactioningId\b/)
    expect(src).toMatch(/isActive: boolean/)
    expect(src).toMatch(/actioning: boolean/)
  })
})
