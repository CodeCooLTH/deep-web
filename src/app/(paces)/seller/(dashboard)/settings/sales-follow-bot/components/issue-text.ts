// 00095 S-7 — ผล validateBotFields / server issues → ข้อความไทย/อังกฤษที่บอกทางออก (UX §7 "Validation")
// ตัวตัดสินว่าผิดอะไรอยู่ที่ src/lib/sales-follow-bot/schemas.ts (ตัวเดียวกับ server) — ที่นี่แค่แปลงรหัสเป็นถ้อยคำ
import { ALLOWED_VARIABLES, SALES_FOLLOW_LIMITS as L } from '@/lib/sales-follow-bot/constants'
import { MAX_RULES, MAX_RULE_VALUES } from '@/lib/sales-follow-bot/conditions'
import type { BotIssue } from '@/lib/sales-follow-bot/schemas'
import { fmt } from '@/i18n/fmt'
import type { useT } from '@/i18n/LocaleProvider'

type Dict = ReturnType<typeof useT>['salesFollowBot']

export function issueText(i: BotIssue, t: Dict): string {
  const n = (i.stepIndex ?? 0) + 1
  const p = (i.partIndex ?? 0) + 1
  switch (i.code) {
    case 'NAME_REQUIRED': return t.vNameRequired
    case 'NAME_TOO_LONG': return fmt(t.vNameTooLong, { max: L.maxName })
    case 'NO_CONDITION': return t.vNoCondition
    case 'RULES_COUNT': return fmt(t.vRulesCount, { max: MAX_RULES })
    case 'RULE_VALUES': return fmt(t.vRuleValues, { n: (i.ruleIndex ?? 0) + 1, max: MAX_RULE_VALUES })
    case 'RULES_TOO_BROAD': return t.vRulesTooBroad
    case 'CHANNELS_REQUIRED': return t.vChannels
    case 'TOO_MANY_CHANNELS': return fmt(t.vTooManyChannels, { max: L.maxChannels })
    case 'FINAL_DELAY_INVALID': return t.vFinalDelay
    case 'STEPS_COUNT': return fmt(t.vStepsCount, { max: L.maxSteps })
    case 'STEP_DELAY_MIN': return fmt(t.vDelay, { n })
    case 'STEPS_TOTAL_TOO_LONG': return fmt(t.vTotal, { n })
    case 'PARTS_COUNT': return fmt(t.vPartsCount, { n, max: L.maxParts })
    case 'PART_KIND_INVALID': return fmt(t.vKind, { n, p })
    case 'PART_TEXT_REQUIRED': return fmt(t.vTextRequired, { n, p })
    case 'PART_TEXT_TOO_LONG': return fmt(t.vTextTooLong, { n, p, max: L.maxText.toLocaleString() })
    case 'PART_TEXT_INVALID': return fmt(t.vTextInvalid, { n, p })
    case 'PART_IMAGES_COUNT': return fmt(t.vImagesCount, { n, p, max: L.maxImagesPerPart })
    case 'PART_IMAGE_NOT_FOUND': return fmt(t.vImageNotFound, { n, p })
    case 'QUICK_MESSAGE_REQUIRED': return fmt(t.vQuickRequired, { n, p })
    case 'UNKNOWN_VARIABLE': return fmt(t.vUnknownVar, { n, p, name: `{${i.name ?? ''}}`, allowed: ALLOWED_VARIABLES.map((v) => `{${v}}`).join(' ') })
    default: return t.vInvalidBody
  }
}
