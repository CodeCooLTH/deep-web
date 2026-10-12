/**
 * ตั้งค่ารายงานการเงิน — อ่าน/บันทึก (feature 00073 เฟส B · FR-010)
 *
 * สิทธิ์ (F1 = เจ้าของ) ตรวจที่ route · ที่นี่กั้น "ร้านบริการเท่านั้น" (กติกาธุรกิจ ไม่ใช่สิทธิ์)
 * นิยาม/ค่าตั้งต้น/การอ่านอยู่ที่ src/lib/report-settings.ts ตัวเดียว
 */
import type { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { usesServiceFinanceRules } from '@/lib/finance-rules'
import {
  mergeReportSettings,
  resolveReportSettings,
  type ReportSettings,
  type UpdateReportSettingsInput,
} from '@/lib/report-settings'

export class ReportSettingsNotAvailableError extends Error {
  constructor() {
    super('REPORT_SETTINGS_SERVICE_ONLY')
  }
}

export async function getReportSettings(shopId: string): Promise<ReportSettings> {
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { vertical: true, reportSettings: true } })
  return resolveReportSettings(shop?.reportSettings ?? null, shop?.vertical)
}

/** บันทึกเฉพาะช่องที่ส่งมา (ที่เหลือคงค่าเดิม) · เขียนลงไปครบทุกช่อง — อ่านกลับได้แน่นอนแม้ค่าตั้งต้นเปลี่ยนภายหลัง */
export async function updateReportSettings(shopId: string, patch: UpdateReportSettingsInput): Promise<ReportSettings> {
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { vertical: true, reportSettings: true } })
  if (!shop || !usesServiceFinanceRules(shop.vertical)) throw new ReportSettingsNotAvailableError()
  const next = mergeReportSettings(resolveReportSettings(shop.reportSettings, shop.vertical), patch)
  await prisma.shop.update({
    where: { id: shopId },
    data: { reportSettings: next as unknown as Prisma.InputJsonValue },
  })
  return next
}
