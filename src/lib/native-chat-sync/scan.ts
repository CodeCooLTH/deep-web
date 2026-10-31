/**
 * อ่านไฟล์จริงตามรายการใน manifest แล้วคำนวณลายนิ้วมือ — ใช้ร่วมโดยเทส (ตรวจ) และ scripts/native-chat-sync-pin.ts (ปักหมุด)
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { entryKey, extractRegion, SYNC_ENTRIES, WATCHED_DIRS } from './manifest'

export const PINS_FILE = 'src/lib/native-chat-sync/pins.json'

export type Pins = { entries: Record<string, string>; files: Record<string, string> }

const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)

function walk(root: string, dir: string, out: string[]) {
  for (const name of readdirSync(join(root, dir))) {
    const rel = join(dir, name)
    const st = statSync(join(root, rel))
    if (st.isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue
      walk(root, rel, out)
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(rel.split('\\').join('/'))
  }
}

/** ลายนิ้วมือปัจจุบันของทุกรายการ + ทุกไฟล์ในโฟลเดอร์ที่เฝ้า (null = หาไฟล์/ส่วนไม่เจอ) */
export function scan(root: string): { entries: Record<string, string | null>; files: Record<string, string> } {
  const entries: Record<string, string | null> = {}
  for (const e of SYNC_ENTRIES) {
    const p = join(root, e.web)
    const region = existsSync(p) ? extractRegion(readFileSync(p, 'utf8'), e.from) : null
    entries[entryKey(e)] = region === null ? null : sha(region)
  }
  const files: Record<string, string> = {}
  for (const w of WATCHED_DIRS) {
    if (!existsSync(join(root, w.dir))) continue
    const list: string[] = []
    walk(root, w.dir, list)
    for (const f of list) files[relative('.', f)] = sha(readFileSync(join(root, f), 'utf8').replace(/\r\n/g, '\n'))
  }
  return { entries, files }
}

export function watchedDirOf(file: string) {
  return WATCHED_DIRS.find((w) => file.startsWith(`${w.dir}/`)) ?? null
}
