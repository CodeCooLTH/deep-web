import { prisma } from "@/lib/prisma";

/**
 * รายการ "ค่าที่ต้องปิดบังก่อนส่งออก AI" — นิยามเดียวของทั้งสาขา Gemini (route) และ Typhoon (service)
 * ประกอบจาก: alias/realName (ลูกค้า) · displayName ของผู้ส่งฝั่งร้านในบทสนทนา + ชื่อใน session (แอดมิน) ·
 * เบอร์/ที่อยู่จาก CRM (literal)
 */
export interface SuggestIdentityInput {
  crm: { alias?: string | null; realName?: string | null; phones?: string[] | null; address?: string | null } | null | undefined;
  rows: { senderRole: string; senderUserId: string | null }[];
  sessionName: string | null | undefined;
}

const nonEmpty = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x && x.trim().length > 0);

export async function buildSuggestIdentity({ crm, rows, sessionName }: SuggestIdentityInput) {
  const senderIds = [...new Set(rows.filter((r) => r.senderRole === "SHOP" && r.senderUserId).map((r) => r.senderUserId as string))];
  const senders = senderIds.length
    ? await prisma.user.findMany({ where: { id: { in: senderIds } }, select: { displayName: true } })
    : [];
  return {
    knownCustomerNames: nonEmpty([crm?.alias, crm?.realName]),
    adminNames: nonEmpty([...senders.map((s) => s.displayName), sessionName]),
    knownLiterals: nonEmpty([...(crm?.phones ?? []), crm?.address]),
  };
}
