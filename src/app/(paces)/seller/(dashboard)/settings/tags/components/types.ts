/** รูปแถวจาก listShopTags (serialize ข้าม RSC ได้) — ประกาศซ้ำที่นี่เพราะ client ห้าม import service */
export type TagRow = {
  id: string | null
  name: string
  registered: boolean
  rooms: number
  keywords: string[]
  removeOnOrderCreate: boolean
}

export type TagLimits = {
  readonly maxTags: number
  readonly maxKeywordTags: number
  readonly maxKeywords: number
  readonly nameMax: number
  readonly keywordMin: number
  readonly keywordMax: number
}

/** ตัวแก้ที่เปิดอยู่: เพิ่ม (อาจมีค่าตั้งต้นจากตัวอย่าง) หรือแก้แถวที่ key นี้ */
export type EditorTarget = { mode: 'add'; preset?: { name: string; keyword: string } } | { mode: 'edit'; key: string }

export const rowKey = (t: TagRow) => t.id ?? `u:${t.name}`

/** ตัวเทียบฝั่งหน้าจอ (ตรวจชื่อ/คำซ้ำก่อนส่ง) — server คือตัวตัดสินจริง (409 TAG_NAME_TAKEN) */
export const nameKeyOf = (s: string) => s.normalize('NFC').toLowerCase().trim()
export const kwKeyOf = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()
export const charLen = (s: string) => Array.from(s).length
