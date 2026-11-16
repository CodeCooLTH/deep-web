import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveConversationShopId } from "@/lib/chat-scope";
import { forbiddenRoleResponse } from "@/lib/forbidden-role";
import { sessionUserId } from "@/lib/session-user";
import { json, capiRun } from "@/lib/meta-capi/route-helpers";
import { listConversationCapiEvents } from "@/services/meta-capi-settings.service";

// per-user authenticated data — ห้าม shared cache เก็บ/serve ทับข้าม user
export const dynamic = "force-dynamic";

const ConversationIdParamSchema = v.pipe(v.string(), v.uuid());

/**
 * GET /api/chat/conversations/{id}/capi-events — กลุ่มเหตุการณ์ CAPI ของห้อง (feature 00097 · X9)
 * ร้านมาจากเธรด (ด่านแชท) ไม่ใช่ร้าน active · คนนอก/ไม่มีห้อง = 404 · สมาชิกไม่มี X9 = 403 · ฟีเจอร์ปิด = 404 FEATURE_DISABLED
 * ทุกทางที่ปฏิเสธไม่มี key `groups` · อ่านอย่างเดียว
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!session?.user || !userId) return json({ error: "unauthorized" }, 401);

  const idCheck = v.safeParse(ConversationIdParamSchema, (await params).id);
  if (!idCheck.success) return json({ error: "รหัสบทสนทนาไม่ถูกต้อง" }, 400);

  const resolved = await resolveConversationShopId(
    { user: { id: userId, activeShopId: (session.user as { activeShopId?: string | null }).activeShopId ?? null } },
    idCheck.output,
    "X9",
  );
  if (!resolved) return json({ error: "ไม่พบบทสนทนานี้" }, 404);
  if ("denied" in resolved) return forbiddenRoleResponse();

  return capiRun(async () => json(await listConversationCapiEvents(resolved.shopId, idCheck.output)));
}
