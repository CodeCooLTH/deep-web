/** PATCH/DELETE /api/shops/current/tags/{tagId} — แก้/ลบแท็ก (00083 · API §4.3-4.4 · H3) */
import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'
import * as v from 'valibot'
import { authOptions } from '@/lib/auth'
import { jsonNoStore } from '@/lib/shop-api-guard'
import { requireShopCapability } from '@/lib/shop-capability'
import { ShopTagIdSchema, ShopTagPatchSchema } from '@/lib/shop-tag-schemas'
import { shopLockedResponse, shopTagErrorResponse, toPublicTag } from '@/lib/shop-tag-route-errors'
import { deleteShopTag, ShopTagError, updateShopTag } from '@/services/shop-tag.service'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ tagId: string }> }

// id ที่ไม่ใช่ uuid ตอบ 404 เหมือนไม่มี (API §4.3) ไม่บอกว่ารูปผิด
const notFound = (tag: string) => shopTagErrorResponse(new ShopTagError('TAG_NOT_FOUND'), tag)

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const gate = await requireShopCapability(await getServerSession(authOptions), 'H3')
  if (!gate.ok) return gate.response
  if (gate.active.locked) return shopLockedResponse()
  const id = v.safeParse(ShopTagIdSchema, (await params).tagId)
  if (!id.success) return notFound('PATCH tags/[id]')
  const parsed = v.safeParse(ShopTagPatchSchema, await request.json().catch(() => null))
  if (!parsed.success) {
    return jsonNoStore(
      { error: 'VALIDATION_ERROR', issues: parsed.issues.map((i) => ({ path: v.getDotPath(i), message: i.message })) },
      { status: 400 },
    )
  }
  try {
    const { tag, renamedRooms } = await updateShopTag(gate.shopId, id.output, parsed.output)
    return jsonNoStore({ tag: toPublicTag(tag), renamedRooms })
  } catch (e) {
    return shopTagErrorResponse(e, 'PATCH tags/[id]')
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const gate = await requireShopCapability(await getServerSession(authOptions), 'H3')
  if (!gate.ok) return gate.response
  if (gate.active.locked) return shopLockedResponse()
  const id = v.safeParse(ShopTagIdSchema, (await params).tagId)
  if (!id.success) return notFound('DELETE tags/[id]')
  try {
    const { removedFromRooms } = await deleteShopTag(gate.shopId, id.output)
    return jsonNoStore({ ok: true, removedFromRooms })
  } catch (e) {
    return shopTagErrorResponse(e, 'DELETE tags/[id]')
  }
}
