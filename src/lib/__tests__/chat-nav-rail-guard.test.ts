import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * [blocker] แถบเมนูของหน้าแชท (ChatNavRail) — สองกฎที่พังเงียบและไม่มี gate อื่นจับได้
 *
 * ## 1. เมนูต้องมาจากตัว resolve ตัวเดียว (permission drift)
 *
 * `src/lib/seller-menu.ts` เตือนไว้เองว่าการมีตัวกรองสิทธิ์สองชุดคือ "ความเสี่ยงอันดับ 1"
 * ของเมนู — วันที่กฎเปลี่ยนแล้วอีกชุดไม่เปลี่ยน เมนูจะพาผู้ใช้ไปหน้าที่เขาไม่มีสิทธิ์
 * `tsc`/build/เทสอื่นจับไม่ได้เลย เพราะทั้งสองชุด "ถูก" ในตัวเองทุกบรรทัด
 *
 * ตอนนี้มี layout สองตัวที่ต้องมีเมนู (`(dashboard)` กับ `(chat)`) ⇒ ปักหมุดไว้ว่า
 * **ห้ามมีใครใน `src/app/**` ประกอบลำดับเอง** ต้องเรียก `resolveSellerMenuItems` เท่านั้น
 *
 * ## 2. ที่ว่างของ rail ต้องเป็นความกว้าง "ตอนหุบ" เสมอ
 *
 * user สั่งตรงตัว 2026-08-25: *"โดยที่ chat ตรงกลางไม่ขยับ เหมือน expand ลอยด้านบน"*
 * สิ่งเดียวที่บังคับข้อนี้คือ margin ของ `.chat-body` ที่ผูกกับ `--sidenav-width-sm` (75px)
 * **คงที่** ขณะที่ rail เองโตเป็น `--sidenav-width` (245px) ตอนกาง — เปลี่ยนโทเคนนี้เป็นตัวเต็ม
 * เมื่อไหร่ คอลัมน์แชททั้งหมดจะกระโดด 170px ทุกครั้งที่เมาส์ผ่าน rail ซึ่งเป็นพฤติกรรมที่
 * user ระบุเองว่าห้ามเกิด และไม่มีเทส/ด่านไหนของโปรเจกต์มองเห็น (คลาส CSS ถูกทุกตัวอักษร)
 *
 * 🛑 แดง = ห้าม merge
 */

const ROOT = process.cwd()
const APP_DIR = join(ROOT, 'src/app')
const CHAT_LAYOUT = 'src/app/(paces)/seller/(chat)/layout.tsx'

/** ลบเนื้อคอมเมนต์แต่คงจำนวนบรรทัด — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย
 *  (บทเรียน grep gate ของ HR9 ที่แดงค้างเพราะไปเจอคอมเมนต์ของตัวเอง 2026-08-02→03) */
const blankComments = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^([ \t]*)\/\/.*$/gm, (m, indent: string) => indent)

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

describe('[blocker] ChatNavRail — เมนูและที่ว่างของ rail', () => {
  it('ห้ามมีไฟล์ใน src/app/** ประกอบตัวกรองเมนูเอง — ต้องผ่าน resolveSellerMenuItems', () => {
    // จับ "การเรียกใช้" ไม่ใช่แค่ชื่อ — บรรทัด import ก็ match ถ้าเช็คแค่ชื่อเปล่า ๆ
    const banned = [/\bresolveVisibleSellerMenu\s*\(/, /\bapplyChatBadge\s*\(/, /\bapplyMenuLocale\s*\(/]

    const offenders = walk(APP_DIR)
      .filter((file) => {
        const code = blankComments(readFileSync(file, 'utf8'))
        return banned.some((re) => re.test(code))
      })
      .map((f) => f.slice(ROOT.length + 1))

    expect(
      offenders,
      'ไฟล์เหล่านี้ประกอบลำดับตัวกรองเมนูเอง = เมนูชุดที่สองที่จะ drift จากของจริง — ' +
        'ให้เรียก resolveSellerMenuItems() จาก @/lib/seller-menu-server แทน',
    ).toEqual([])
  })

  it('.chat-body ต้องกันที่ด้วยความกว้างตอนหุบ (--sidenav-width-sm) ไม่ใช่ตอนกาง', () => {
    const code = blankComments(readFileSync(join(ROOT, CHAT_LAYOUT), 'utf8'))

    // จับตั้งแต่คำว่า chat-shell ไปจนจบ expression ของ className (รองรับทั้ง string ธรรมดาและ
    // template literal ที่มีเงื่อนไข) — ห้ามผูกกับรูปแบบการเขียนแบบใดแบบหนึ่ง เพราะด่านที่ผูกกับ
    // "วิธีเขียน" จะพังตอน refactor ทั้งที่ของยังถูก (บทเรียน 2026-08-12)
    const shellClass = /chat-body[\s\S]{0,260}/.exec(code)?.[0] ?? ''
    expect(shellClass, 'หา className ของ .chat-body ไม่เจอ — โครง layout เปลี่ยนไปแล้ว').not.toBe('')

    expect(shellClass, 'ต้องกันที่ให้ rail ด้วยโทเคนความกว้าง "ตอนหุบ"').toContain(
      'ms-(--sidenav-width-sm)',
    )
    // ตัวเต็มจะทำให้คอลัมน์แชทกระโดด 170px ทุกครั้งที่ rail กาง — สิ่งที่ user ห้ามไว้ตรง ๆ
    expect(shellClass, 'ห้ามใช้ --sidenav-width (ตัวกาง) เป็นที่ว่างของ rail').not.toMatch(
      /ms-\(--sidenav-width\)/,
    )
  })

  it('rail กับที่ว่างที่กันไว้ให้มัน ต้องมาจากเงื่อนไขตัวเดียวกัน', () => {
    /**
     * ไม่มีร้าน active = ไม่ render rail — ถ้าที่ว่าง 75px ยังถูกกันไว้อยู่ ผู้ใช้จะเห็นแถบเปล่า
     * ฝั่งซ้ายที่ไม่มีอะไรอยู่ในนั้น (ไม่ error ไม่ warning — แค่ผิด)
     *
     * ด่านนี้เติมเข้ามาเพราะ mutation รอบแรก "ถอด rail ออกแต่คงที่ว่างไว้" แล้วเทสยังเขียว
     * = ชุด assert เดิมไม่ได้กันสิ่งที่มันอ้างว่ากัน (mutation-silence-means-weak-corpus.md)
     */
    const code = blankComments(readFileSync(join(ROOT, CHAT_LAYOUT), 'utf8'))

    const guard = /\{\s*([A-Za-z_$][\w$]*)\s*&&\s*<ChatNavRail/.exec(code)?.[1] ?? ''
    expect(guard, '<ChatNavRail /> ต้องถูกกั้นด้วยตัวแปร boolean ที่มีชื่อ (ไม่ใช่ literal/นิพจน์ลอย)').not.toBe('')

    const shellClass = /chat-body[\s\S]{0,260}/.exec(code)?.[0] ?? ''
    expect(
      shellClass,
      `ที่ว่างของ rail ต้องผูกกับ \`${guard}\` ตัวเดียวกับที่ตัดสินว่าจะ render rail ไหม — ` +
        'ไม่งั้นเคสไม่มีร้านจะเหลือช่องว่างเปล่าฝั่งซ้าย',
    ).toContain(guard)
  })

  it('ChatHeader ต้องอยู่นอกโซนที่ rail กันที่ไว้ (โลโก้อยู่บนสุด ไม่ถูกดัน/ไม่ถูกกางทับ)', () => {
    /**
     * user สั่ง 2026-08-25 (รอบแก้): *"logo ต้องอยู่บนสุดเหมือนเดิม เวลา hover ให้ hover
     * แค่ส่วนด้านล่าง (logo ไม่ต้องหุบ)"*
     *
     * แปลว่า <ChatHeader/> ต้องพาดเต็มความกว้างที่ y=0 = อยู่ **ก่อน** .chat-body ซึ่งเป็นโซน
     * ที่ถูก margin ดันไปทางขวา — ถ้าใครย้าย header เข้าไปใน .chat-body เมื่อไหร่ โลโก้จะถูก
     * ดัน 75px และถูกแผงที่กางออกทับทันที โดยไม่มี tsc/build/เทสอื่นฟ้อง
     */
    const code = blankComments(readFileSync(join(ROOT, CHAT_LAYOUT), 'utf8'))
    const headerAt = code.indexOf('<ChatHeader')
    const bodyAt = code.indexOf('chat-body')

    expect(headerAt, 'ไม่พบ <ChatHeader /> ใน layout ของหน้าแชท').toBeGreaterThan(-1)
    expect(bodyAt, 'ไม่พบโซน .chat-body ที่กันที่ให้ rail').toBeGreaterThan(-1)
    expect(
      headerAt,
      'ChatHeader ต้องอยู่ก่อน .chat-body — ย้ายเข้าไปข้างในเมื่อไหร่ โลโก้จะถูกดันและถูก rail กางทับ',
    ).toBeLessThan(bodyAt)
  })

  it('rail ต้องถูก render นอก .chat-shell (ซึ่งมี overflow-hidden)', () => {
    const code = blankComments(readFileSync(join(ROOT, CHAT_LAYOUT), 'utf8'))
    const railAt = code.indexOf('<ChatNavRail')
    const shellAt = code.indexOf('chat-shell')

    expect(railAt, 'ไม่พบ <ChatNavRail /> ใน layout ของหน้าแชท').toBeGreaterThan(-1)
    expect(
      railAt,
      'ChatNavRail ต้องอยู่ก่อน (เป็นพี่น้องของ) .chat-shell — วางไว้ข้างในจะถูก overflow-hidden ' +
        'ตัดทันทีที่มี ancestor ตัวไหนได้ transform',
    ).toBeLessThan(shellAt)
  })
})
