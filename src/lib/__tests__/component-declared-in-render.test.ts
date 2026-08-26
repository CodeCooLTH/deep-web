/**
 * [blocker] ห้ามประกาศ component ไว้ในตัว render ของ component อื่น
 *
 * SSOT ของกฎ: `docs/conventions/component-declared-in-render.md`
 *
 * 🛑 React เทียบชนิดด้วย **identity ของฟังก์ชัน** ⇒ ฟังก์ชันที่ประกาศในตัว render เป็นชนิดใหม่
 * ทุก re-render ⇒ React **unmount ทั้งซับทรีแล้ว mount ใหม่ ไม่ใช่ patch** — เกิดกับ *ทุก*
 * `setState` ของแม่ ไม่ว่าจะเกี่ยวกับส่วนนั้นหรือไม่: DOM สร้างใหม่ (จอ "แวบ ๆ") · ไอคอน/รูป
 * เริ่มโหลดใหม่ · `transition-*` เริ่มนับหนึ่ง · **โฟกัสหลุดจาก element ที่เพิ่งกด** ·
 * **state ภายในของลูกถูกล้าง** · **`useEffect` ของลูกยิง cleanup+setup ใหม่ = fetch ซ้ำทุก setState**
 *
 * 🛑 **ไม่มี gate ไหนของโปรเจกต์จับได้เลยก่อนหน้านี้** — `tsc`/build/เทส/`theme-guard` ผ่านหมด
 * เพราะโค้ดถูกทุกตัวอักษร สิ่งที่ผิดคือ *ตำแหน่งที่ประกาศ* · และ `react-hooks/exhaustive-deps`
 * ไม่ตรวจเรื่องนี้เลย · convention เขียนไว้ตั้งแต่ 2026-08-12 แต่ **มีแต่คอมเมนต์อ้างถึง
 * ไม่เคยมีด่านจริง** (`rule-must-be-enforced-not-described.md`) — จนพลาดซ้ำอีกครั้ง
 * 2026-08-26 ที่ `ReturnPanel.tsx` (`ParcelStrip`): พิสูจน์บนจอด้วยการติด `dataset.probe`
 * บน `<img>` โลโก้ขนส่ง แล้วพิมพ์ **1 ตัวอักษร** ในช่องเลขพัสดุ → หมุดหาย = node ถูกสร้างใหม่
 *
 * แดง = ห้าม merge
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = 'src/app/(paces)'

/**
 * หนี้เดิมที่รู้ตัวแล้ว ณ 2026-08-26 — **ลิสต์นี้มีไว้ให้หด ไม่ใช่ให้โต**
 *
 * 🛑 เทสบังคับว่าผลลัพธ์ต้อง **ตรงกับลิสต์นี้เป๊ะ** ⇒ เพิ่มการละเมิดใหม่ = แดง · แก้ตัวเก่าออก
 * ก็แดงเหมือนกัน (ให้มาลบชื่อออกจากลิสต์) — ทั้งสองทางบังคับให้มีคนตัดสินใจอย่างรู้ตัว
 * ห้ามเปลี่ยนเป็น "อย่างน้อยต้องไม่เกิน N" เพราะนั่นคือที่ที่ของใหม่กลับมาซ่อน
 */
const KNOWN_DEBT = [
  'src/app/(paces)/seller/(chat)/_components/DraftOrderProvider.tsx::Bar',
  'src/app/(paces)/seller/(dashboard)/_shared/ShopPackageSidenavCard.tsx::Wrapper',
  'src/app/(paces)/seller/(dashboard)/settings/auto-reply/[id]/KeywordEditorClient.tsx::CondChips',
]

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.tsx')) out.push(p)
  }
  return out
}

/**
 * 🛑 ตัดคอมเมนต์ก่อนสแกนเสมอ — ไฟล์ที่ *ทำถูกกฎ* คือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย
 * (ด่านที่ match คำเปล่า ๆ จะแดงค้างจากคำเตือนของตัวเอง — เกิดมาแล้วกับ grep gate ของ HR9)
 * แทนคอมเมนต์ด้วยช่องว่างที่ยาวเท่ากันเพื่อให้เลขบรรทัดไม่เพี้ยน
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_m, p1: string) => p1)
}

/**
 * scanSource — แยกเป็นฟังก์ชันบริสุทธิ์เพื่อให้ **ป้อน input ที่พิสูจน์ตัวป้องกันได้จริง**
 *
 * 🛑 เหตุผลที่ต้องแยก: mutation "ถอด stripComments ออก" เคย **เขียว** ทั้งที่ mutation ใส่จริง —
 * แปลว่าตอนนี้ยังไม่มีไฟล์ไหนในรีโปที่มี `<Name>` อยู่ในคอมเมนต์ ⇒ ชุดข้อมูลอ่อน ไม่ใช่
 * "การตัดคอมเมนต์ไม่เกี่ยว" (`docs/conventions/mutation-silence-means-weak-corpus.md`)
 * การป้องกันนั้นจะสำคัญ *วันที่* มีคนเขียนคอมเมนต์อธิบายกฎนี้ไว้ ซึ่งคือวันที่มันจะพังพอดี
 */
export function scanSource(raw: string): string[] {
  const src = stripComments(raw)
  const found: string[] = []
  const names = new Set<string>()
  for (const m of src.matchAll(/^[ \t]+function\s+([A-Z]\w*)\s*\(/gm)) names.add(m[1]!)
  for (const m of src.matchAll(/^[ \t]+const\s+([A-Z]\w*)\s*[:=]/gm)) names.add(m[1]!)
  for (const name of names) {
    /**
     * 🛑 ต้องเช็คว่า **ถูกใช้เป็น JSX** ไม่ใช่แค่ "เป็นฟังก์ชันที่คืน JSX" — helper อย่าง
     * `renderStepMethod()` ที่ประกาศข้างในแล้ว *เรียกเป็นฟังก์ชัน* ไม่ได้สร้างชนิดใหม่ให้ React
     * เลย (ผลลัพธ์ถูก inline เข้าไปในทรีของแม่) จึงไม่ใช่การละเมิดและห้ามจับ
     */
    if (new RegExp(`<${name}[\\s/>]`).test(src)) found.push(name)
  }
  return found
}

function violations(): string[] {
  const found: string[] = []
  for (const file of walk(ROOT)) {
    for (const name of scanSource(readFileSync(file, 'utf8'))) found.push(`${file}::${name}`)
  }
  return found.sort()
}

describe('[blocker] component ต้องประกาศที่ module scope', () => {
  it('ไม่มีการละเมิดใหม่ใน (paces) — และหนี้เดิมต้องไม่โต', () => {
    expect(violations()).toEqual([...KNOWN_DEBT].sort())
  })

  /** ด่านที่ไม่เคยจับอะไรได้เลยคือด่านที่พังเงียบ — พิสูจน์ว่ามันยัง "มองเห็น" อยู่จริง */
  it('[blocker] ตัวสแกนยังทำงาน (ไม่ได้คืนลิสต์ว่างเพราะ walk/regex พัง)', () => {
    expect(walk(ROOT).length).toBeGreaterThan(100)
    expect(violations().length).toBe(KNOWN_DEBT.length)
  })
})

/**
 * [blocker] ตัวสแกนเองต้องถูก — ด่านที่พังเองอ่านเหมือนโค้ดพัง และด่านที่ตาบอดอ่านเหมือนโค้ดสะอาด
 */
describe('[blocker] scanSource', () => {
  it('จับ component ที่ประกาศในตัว render และถูกใช้เป็น JSX', () => {
    expect(scanSource(`function Parent() {\n  function Row() { return <div /> }\n  return <Row />\n}`)).toEqual(['Row'])
    expect(scanSource(`function Parent() {\n  const Row = () => <div />\n  return <Row />\n}`)).toEqual(['Row'])
  })

  it('[blocker] ไม่จับ helper ที่ประกาศข้างในแล้ว *เรียกเป็นฟังก์ชัน*', () => {
    // ผลลัพธ์ถูก inline เข้าทรีของแม่ ไม่ได้สร้างชนิดใหม่ให้ React ⇒ ไม่ใช่การละเมิด
    expect(scanSource(`function Parent() {\n  function renderRow() { return <div /> }\n  return renderRow()\n}`)).toEqual([])
    // ชื่อขึ้นต้นตัวใหญ่แต่เรียกเป็นฟังก์ชัน ก็ยังไม่ใช่การละเมิด
    expect(scanSource(`function Parent() {\n  function Row() { return <div /> }\n  return Row()\n}`)).toEqual([])
  })

  it('[blocker] ไม่จับ component ที่ประกาศชิดขอบ (module scope) — นี่คือท่าที่ถูก', () => {
    expect(scanSource(`function Row() { return <div /> }\nfunction Parent() { return <Row /> }`)).toEqual([])
  })

  /**
   * 🛑 input ที่ทำให้ `stripComments` มีความหมาย — **ห้ามลบเพราะ "ซ้ำกับเคสอื่น"**
   * ถอด `stripComments` ออกแล้วเทสนี้ต้องแดง (พิสูจน์ด้วย mutation 2026-08-26)
   * ไฟล์ที่ทำถูกกฎคือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย — คำเตือนนั้นมักมี `<Name />` อยู่ในตัว
   */
  it('[blocker] `<Name />` ที่อยู่ในคอมเมนต์ ไม่นับเป็นการใช้งาน', () => {
    expect(scanSource(`function Parent() {\n  function Row() { return <div /> }\n  // ห้ามเขียน <Row /> แบบนี้\n  return Row()\n}`)).toEqual([])
    expect(scanSource(`function Parent() {\n  function Row() { return <div /> }\n  /* ตัวอย่างที่ผิด: <Row /> */\n  return Row()\n}`)).toEqual([])
  })
})
