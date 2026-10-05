/**
 * reducer — state ก้อนเดียวของหน้าจัดข้อความ (feature 00070 EXT · spec §3.1) · pure
 *
 * ทำไม reducer ไม่ใช่ useState หลายตัว: add/remove/move/พิมพ์ markup ต้องแก้ draft + markupById + openId พร้อมกัน
 * แยกเป็นฟังก์ชัน pure เพื่อให้เทสจับ (ลบ/ย้อนกลับ/ลำดับ) · ไม่มีการสุ่ม/เวลาในนี้ — id มาจากผู้เรียก
 * ย้ายลำดับใช้ `moveToIndex`/`moveArrayItem` ตัวเดียวกับตัวจัดหน้าร้าน (ทั้งลากและปุ่มขึ้น/ลงเดินทางเดียวกัน)
 */
import { moveArrayItem, moveToIndex } from '@/app/(paces)/seller/(fullscreen)/public-profile/builder/lib/draft'
import { BLOCK_LIMITS, MAX_BLOCKS, parseMarkup, serializeMarkup, type Block, type BlockType, type TemplateV1 } from '@/lib/line-report/template'
import type { PreviewKind } from '@/lib/line-report/settings-guards'
import { singleLine } from './markup-edit'

type TextBlock = Extract<Block, { type: 'text' }>
type TextStyle = TextBlock['style']

export type Saved = {
  template: TemplateV1
  version: number
  /** false = ยังใช้แบบมาตรฐาน (template=null ในฐาน) */
  custom: boolean
  /** markup ดิบของบล็อกข้อความ ณ ตอนบันทึก — ใช้เทียบ dirty (พิมพ์ markup ผิดแล้วยังต้องนับว่าแก้) */
  markup: Record<string, string>
}

export type State = {
  draft: TemplateV1
  markupById: Record<string, string>
  openId: string | null
  previewKind: PreviewKind
  view: 'canvas' | 'preview'
  saving: boolean
  stale: boolean
  profitConfirmed: boolean
  /** บล็อกที่ blur/พยายามบันทึกแล้ว — error ใต้ช่องแสดงเฉพาะที่อยู่ในนี้ */
  touched: Record<string, true>
  saved: Saved
}

export type Action =
  | { type: 'add'; block: Block; index?: number }
  | { type: 'remove'; id: string }
  | { type: 'restore'; block: Block; index: number; markup?: string }
  | { type: 'move'; from: number; to: number }
  | { type: 'step'; id: string; dir: -1 | 1 }
  | { type: 'setMarkup'; id: string; src: string }
  | { type: 'setStyle'; id: string; patch: Partial<TextStyle> }
  | { type: 'setShops'; id: string; patch: { top3?: boolean; profit?: boolean } }
  | { type: 'setMeasure'; id: string; measure: 'sales' | 'orders' }
  | { type: 'setTitle'; title: string }
  | { type: 'setButton'; patch: Partial<TemplateV1['button']> }
  | { type: 'open'; id: string | null }
  | { type: 'touch'; id: string }
  | { type: 'touchAll' }
  | { type: 'setView'; view: State['view'] }
  | { type: 'setPreviewKind'; kind: PreviewKind }
  | { type: 'confirmProfit' }
  | { type: 'saveStart' }
  | { type: 'saveFail' }
  | { type: 'saveOk'; version: number }
  | { type: 'markStale' }
  | { type: 'load'; template: TemplateV1; version: number; custom: boolean }

export const markupMap = (t: TemplateV1): Record<string, string> => {
  const m: Record<string, string> = {}
  for (const b of t.blocks) if (b.type === 'text') m[b.id] = serializeMarkup(b.runs)
  return m
}

export function initState(template: TemplateV1, version: number, custom: boolean): State {
  const markup = markupMap(template)
  return {
    draft: template,
    markupById: markup,
    openId: null,
    previewKind: 'DAILY',
    view: 'canvas',
    saving: false,
    stale: false,
    profitConfirmed: false,
    touched: {},
    saved: { template, version, custom, markup },
  }
}

/** โครงสร้างเพิ่มได้ไหม (เพดานชนิด + รวม 20) — เงื่อนไขข้อมูลกลุ่มตัดสินที่ `libraryAvailability` ฝั่งผู้เรียก */
export function canAddStructurally(blocks: readonly Block[], type: BlockType): boolean {
  return blocks.length < MAX_BLOCKS && blocks.filter((b) => b.type === type).length < BLOCK_LIMITS[type]
}

/** แก้ draft แล้วต่อด้วย map บล็อกเดียว */
const mapBlock = (s: State, id: string, f: (b: Block) => Block): State => ({
  ...s,
  draft: { ...s.draft, blocks: s.draft.blocks.map((b) => (b.id === id ? f(b) : b)) },
})

export function isDirty(s: State): boolean {
  if (JSON.stringify(s.draft) !== JSON.stringify(s.saved.template)) return true
  return s.draft.blocks.some((b) => b.type === 'text' && (s.markupById[b.id] ?? '') !== (s.saved.markup[b.id] ?? ''))
}

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'add': {
      if (!canAddStructurally(s.draft.blocks, a.block.type)) return s
      const at = a.index === undefined ? s.draft.blocks.length : Math.min(Math.max(0, a.index), s.draft.blocks.length)
      const blocks = [...s.draft.blocks.slice(0, at), a.block, ...s.draft.blocks.slice(at)]
      const markupById = a.block.type === 'text' ? { ...s.markupById, [a.block.id]: serializeMarkup(a.block.runs) } : s.markupById
      return { ...s, draft: { ...s.draft, blocks }, markupById, openId: a.block.id }
    }
    case 'remove': {
      const { [a.id]: _gone, ...markupById } = s.markupById
      return { ...s, draft: { ...s.draft, blocks: s.draft.blocks.filter((b) => b.id !== a.id) }, markupById, openId: s.openId === a.id ? null : s.openId }
    }
    case 'restore': {
      // ย้อนกลับหลังเอาออก: ถ้าระหว่างนั้นชนิดนี้ถูกเพิ่มจนเต็มโควตา ไม่ใส่ซ้ำ
      if (!canAddStructurally(s.draft.blocks, a.block.type) || s.draft.blocks.some((b) => b.id === a.block.id)) return s
      const at = Math.min(Math.max(0, a.index), s.draft.blocks.length)
      const blocks = [...s.draft.blocks.slice(0, at), a.block, ...s.draft.blocks.slice(at)]
      const markupById = a.block.type === 'text' ? { ...s.markupById, [a.block.id]: a.markup ?? serializeMarkup(a.block.runs) } : s.markupById
      return { ...s, draft: { ...s.draft, blocks }, markupById, openId: a.block.id }
    }
    case 'move': {
      const n = s.draft.blocks.length
      if (a.from === a.to || a.from < 0 || a.to < 0 || a.from >= n || a.to >= n) return s
      return { ...s, draft: { ...s.draft, blocks: moveToIndex(s.draft.blocks, a.from, a.to) } }
    }
    case 'step': {
      const i = s.draft.blocks.findIndex((b) => b.id === a.id)
      if (i < 0) return s
      return { ...s, draft: { ...s.draft, blocks: moveArrayItem(s.draft.blocks, i, a.dir) } }
    }
    case 'setMarkup': {
      const src = singleLine(a.src)
      const parsed = parseMarkup(src)
      const next = { ...s, markupById: { ...s.markupById, [a.id]: src } }
      // markup ผิด = เก็บ runs ล่าสุดที่ถูกไว้ให้พรีวิว (E-18) ไม่ทับด้วยของว่าง
      return parsed.ok ? mapBlock(next, a.id, (b) => (b.type === 'text' ? { ...b, runs: parsed.runs } : b)) : next
    }
    case 'setStyle':
      return mapBlock(s, a.id, (b) => (b.type === 'text' ? { ...b, style: { ...b.style, ...a.patch } } : b))
    case 'setShops':
      return mapBlock(s, a.id, (b) => (b.type === 'shops' ? { ...b, ...a.patch } : b))
    case 'setMeasure':
      return mapBlock(s, a.id, (b) => (b.type === 'chart_trend' || b.type === 'chart_compare' ? { ...b, measure: a.measure } : b))
    case 'setTitle': {
      const { title: _t, ...rest } = s.draft
      // ว่าง = ใช้ชื่อมาตรฐาน (schema ไม่รับ title เป็นสตริงว่าง)
      return { ...s, draft: a.title.trim() === '' ? rest : { ...rest, title: singleLine(a.title) } }
    }
    case 'setButton':
      return { ...s, draft: { ...s.draft, button: { ...s.draft.button, ...a.patch } } }
    case 'open':
      return { ...s, openId: a.id }
    case 'touch':
      return { ...s, touched: { ...s.touched, [a.id]: true } }
    case 'touchAll':
      return { ...s, touched: Object.fromEntries(s.draft.blocks.map((b) => [b.id, true as const])) }
    case 'setView':
      return { ...s, view: a.view }
    case 'setPreviewKind':
      return { ...s, previewKind: a.kind }
    case 'confirmProfit':
      return { ...s, profitConfirmed: true }
    case 'saveStart':
      return { ...s, saving: true }
    case 'saveFail':
      return { ...s, saving: false }
    case 'saveOk':
      return { ...s, saving: false, saved: { template: s.draft, version: a.version, custom: true, markup: s.markupById } }
    case 'markStale':
      return { ...s, saving: false, stale: true }
    case 'load': {
      const fresh = initState(a.template, a.version, a.custom)
      // เก็บของที่เป็นความชอบของหน้านี้ (พรีวิวชนิดไหน/แท็บไหน/ยืนยันกำไรแล้ว) — โหลดใหม่ไม่ควรรีเซ็ตมัน
      return { ...fresh, previewKind: s.previewKind, view: s.view, profitConfirmed: s.profitConfirmed }
    }
  }
}
