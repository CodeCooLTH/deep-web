import { NextResponse } from 'next/server'

/** 403 มาตรฐานเมื่อบทบาทไม่มี capability (00071 BR-RP-11) */
export const FORBIDDEN_ROLE_BODY = { error: 'FORBIDDEN_ROLE' } as const

export function forbiddenRoleResponse() {
  return NextResponse.json(FORBIDDEN_ROLE_BODY, { status: 403 })
}
