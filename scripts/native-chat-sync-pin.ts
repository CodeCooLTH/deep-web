/**
 * ปักหมุดลายนิ้วมือของ "ของที่แชท Native พึ่ง" ใหม่ (HARD RULE 18 · docs/conventions/native-chat-sync.md)
 *
 *   npx tsx scripts/native-chat-sync-pin.ts
 *
 * 🛑 รันหลังจาก "แก้ deep-seller-app ตามแล้ว" หรือ "ยืนยันแล้วว่าไม่กระทบแชท Native" เท่านั้น
 *    แล้วเขียนใน PR: `Native: <PR ของแอป | ไม่กระทบเพราะ ...>`
 */
import { readFileSync, writeFileSync } from 'node:fs'

import { entryKey, SYNC_ENTRIES } from '../src/lib/native-chat-sync/manifest'
import { PINS_FILE, scan, type Pins } from '../src/lib/native-chat-sync/scan'

const root = process.cwd()
const now = scan(root)
const missing = SYNC_ENTRIES.filter((e) => now.entries[entryKey(e)] === null)
if (missing.length) {
  console.error('หาไฟล์/ส่วนที่เฝ้าไม่เจอ — แก้ manifest.ts ก่อน (ชื่อเปลี่ยน/ย้ายไฟล์ = แชท Native ต้องตามด้วย):')
  for (const e of missing) console.error(`  - ${entryKey(e)}`)
  process.exit(1)
}

let before: Pins = { entries: {}, files: {} }
try {
  before = JSON.parse(readFileSync(PINS_FILE, 'utf8')) as Pins
} catch {
  // ครั้งแรก
}

const changed = [
  ...Object.keys(now.entries).filter((k) => before.entries[k] !== now.entries[k]),
  ...Object.keys(now.files).filter((k) => before.files[k] !== now.files[k]),
]
const pins: Pins = { entries: now.entries as Record<string, string>, files: now.files }
writeFileSync(PINS_FILE, `${JSON.stringify(pins, null, 2)}\n`)
console.log(changed.length ? `ปักหมุดใหม่ ${changed.length} รายการ:\n  ${changed.join('\n  ')}` : 'ไม่มีอะไรเปลี่ยน')
console.log('\nอย่าลืม: เขียนใน PR ว่า "Native: <PR ของ deep-seller-app | ไม่กระทบเพราะ ...>"')
