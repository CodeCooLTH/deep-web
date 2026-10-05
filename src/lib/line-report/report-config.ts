/**
 * report-config.ts — แหล่งความจริงเดียวของ "ข้อความที่กลุ่มนี้ส่ง" (00070 EXT-07 · AC-EXT-07-5) · pure
 *
 * send / sendTest / command-reply อ่านผ่านฟังก์ชันนี้เท่านั้น — ไม่อ่านคอลัมน์ show* ตรง ๆ
 * (คอลัมน์ = cache ที่ updateTemplate เขียนคู่กับเทมเพลต ไม่ใช่ตัวตัดสินเมื่อมีเทมเพลต)
 */
import { defaultTemplateFromFlags, deriveNeeds, resolveTemplate, type TemplateGroup, type TemplateNeeds, type TemplateV1 } from '@/lib/line-report/template'
import { validateTemplate } from '@/lib/line-report/validations'

/** `template` เป็น unknown เพราะมาจากคอลัมน์ Json — ตรวจก่อนใช้เสมอ · monthly/attach ไม่ส่ง = false */
export type ReportConfigGroup = Omit<TemplateGroup, 'template' | 'attachCycleToDaily' | 'monthlyEnabled'> & {
  template?: unknown
  attachCycleToDaily?: boolean
  monthlyEnabled?: boolean
}

export type ReportConfig = {
  template: TemplateV1
  flags: Pick<TemplateNeeds, 'showOrders' | 'showSales' | 'showCancelled' | 'showTopProducts' | 'showProfit'>
  needs: TemplateNeeds
}

export function resolveReportConfig(g: ReportConfigGroup): ReportConfig {
  const { template: stored, ...cols } = g
  const base = { ...cols, attachCycleToDaily: g.attachCycleToDaily ?? false, monthlyEnabled: g.monthlyEnabled ?? false }
  let template: TemplateV1
  let custom = false
  if (stored === null || stored === undefined) {
    template = defaultTemplateFromFlags(base)
  } else {
    const r = validateTemplate(stored)
    if (r.ok) {
      template = resolveTemplate({ ...base, template: r.template })
      custom = true
    } else {
      // ข้อมูลเสียในฐาน (แก้มือ/migration) → ส่งแบบมาตรฐานต่อ ดีกว่ารายงานไม่ออก · ไม่ log เนื้อหา (มีข้อความของเจ้าของ)
      console.error('[line-report] template ในฐานไม่ผ่านการตรวจ ใช้แบบมาตรฐานแทน', r.rule)
      template = defaultTemplateFromFlags(base)
    }
  }
  const needs = deriveNeeds(template)
  // เทมเพลตขอยอดสะสมรอบได้ แต่ปิดรายเดือนทีหลัง (E-8) = ไม่มีรอบให้สะสม → ข้าม
  // ไม่มีเทมเพลต = ใช้คอลัมน์ตรง ๆ เหมือนก่อนมีฟีเจอร์ (BR-LGS-22: กลุ่มที่ไม่เคยแก้ต้องไม่เปลี่ยน)
  needs.needCycle = custom ? needs.needCycle && base.monthlyEnabled : base.attachCycleToDaily
  needs.attachCycleToDaily = needs.needCycle
  const { showOrders, showSales, showCancelled, showTopProducts, showProfit } = needs
  return { template, flags: { showOrders, showSales, showCancelled, showTopProducts, showProfit }, needs }
}
