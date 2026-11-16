// 00095 SDS §7 — แปลง error ของ sales-follow-bot service เป็น HTTP (แบบ auto-notify/route-errors.ts) · รูปแบนราบ { error, ... }
import { jsonNoStore } from '@/lib/shop-api-guard'
import {
  SalesFollowBotChannelConflictError,
  SalesFollowBotChannelNotFoundError,
  SalesFollowBotNotAvailableError,
  SalesFollowBotNotFoundError,
  SalesFollowBotStaleError,
  SalesFollowBotTagNotFoundError,
  SalesFollowBotTestRoomsError,
  SalesFollowBotValidationError,
} from './errors'
import type { BotIssue } from './schemas'

export function salesFollowErrorResponse(e: unknown, logTag: string) {
  if (e instanceof SalesFollowBotNotFoundError) return jsonNoStore({ error: 'NOT_FOUND' }, { status: 404 })
  if (e instanceof SalesFollowBotStaleError)
    return jsonNoStore({ error: 'BOT_STALE', currentUpdatedAt: e.currentUpdatedAt?.toISOString() ?? null }, { status: 409 })
  if (e instanceof SalesFollowBotChannelConflictError)
    return jsonNoStore({ error: 'CHANNEL_CONFLICT', conflicts: e.conflicts }, { status: 409 })
  if (e instanceof SalesFollowBotChannelNotFoundError) return jsonNoStore({ error: 'CHANNEL_NOT_FOUND' }, { status: 400 })
  if (e instanceof SalesFollowBotTagNotFoundError) return jsonNoStore({ error: 'TAG_NOT_FOUND', names: e.names }, { status: 400 })
  if (e instanceof SalesFollowBotTestRoomsError) return jsonNoStore({ error: e.code }, { status: 400 })
  if (e instanceof SalesFollowBotNotAvailableError)
    return jsonNoStore({ error: e.reason }, { status: e.reason === 'FEATURE_NOT_ENABLED' ? 403 : 409 })
  if (e instanceof SalesFollowBotValidationError) return validationErrorResponse(e.issues)
  // log แค่ชื่อชนิด — ข้อความ Prisma/body อาจมีข้อมูลลูกค้า (NFR-FB-04)
  console.error(`[${logTag}]`, e instanceof Error ? e.name : typeof e)
  return jsonNoStore({ error: 'INTERNAL_ERROR' }, { status: 500 })
}

/** 400 VALIDATION_ERROR จากผล parse ของ schemas.ts */
export function validationErrorResponse(issues: BotIssue[]) {
  return jsonNoStore({ error: 'VALIDATION_ERROR', issues }, { status: 400 })
}
