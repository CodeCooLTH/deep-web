/** GET/POST /api/shops/current/tags — จัดการแท็กของร้าน (00083 · API §4.1-4.2 · H3 OWNER+MANAGER) */
import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'
import * as v from 'valibot'
import { authOptions } from '@/lib/auth'
import { jsonNoStore } from '@/lib/shop-api-guard'
import { requireShopCapability } from '@/lib/shop-capability'
import { ShopTagCreateSchema } from '@/lib/shop-tag-schemas'
import { shopLockedResponse, shopTagErrorResponse, toPublicTag } from '@/lib/shop-tag-route-errors'
import { createShopTag, listShopTags } from '@/services/shop-tag.service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireShopCapability(await getServerSession(authOptions), 'H3')
  if (!gate.ok) return gate.response
  try {
    return jsonNoStore(await listShopTags(gate.shopId))
  } catch (e) {
    return shopTagErrorResponse(e, 'GET tags')
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireShopCapability(await getServerSession(authOptions), 'H3')
  if (!gate.ok) return gate.response
  if (gate.active.locked) return shopLockedResponse()
  const parsed = v.safeParse(ShopTagCreateSchema, await request.json().catch(() => null))
  if (!parsed.success) {
    return jsonNoStore(
      { error: 'VALIDATION_ERROR', issues: parsed.issues.map((i) => ({ path: v.getDotPath(i), message: i.message })) },
      { status: 400 },
    )
  }
  try {
    const tag = await createShopTag(gate.shopId, gate.userId, parsed.output)
    return jsonNoStore({ tag: toPublicTag(tag) }, { status: 201 })
  } catch (e) {
    return shopTagErrorResponse(e, 'POST tags')
  }
}
