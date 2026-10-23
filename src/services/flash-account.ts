import "server-only";
// feature 00084 — ตัวโหลดบัญชี Flash จุดเดียว (สัญญาร่วมของ flash.service / flash-shipment / flash-ops / flash-status)
// ทุก query ระบุ provider FLASH เสมอ (BR-FLASH-19) และไม่มีทางคืน key ออกนอก server
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decodeCredential, hashWebhookSecret } from "@/lib/flash/credential";

export const FLASH = "FLASH" as const;
const AUDIT_KEEP = 50;

export type FlashAccountRow = Prisma.ShopShippingAccountGetPayload<object>;
export type FlashCred = { mchId: string; secretKey: string };
export type LoadedFlashAccount = { account: FlashAccountRow; cred: FlashCred; webhookSecret: string };


/** แถว FLASH ของร้าน (ทุกสถานะ) — ไม่ถอดรหัส */
export function findFlashAccount(shopId: string): Promise<FlashAccountRow | null> {
  return prisma.shopShippingAccount.findUnique({ where: { shopId_provider: { shopId, provider: FLASH } } });
}

/** บัญชีที่ใช้ยิง Flash ได้ (ไม่ DISCONNECTED, มี mchId และ envelope) — null = ใช้ไม่ได้ */
export function unpackFlashAccount(account: FlashAccountRow | null): LoadedFlashAccount | null {
  if (!account || account.status === "DISCONNECTED" || !account.merchantId || !account.accessTokenEnc) return null;
  const { secretKey, webhookSecret } = decodeCredential(account.accessTokenEnc);
  return { account, cred: { mchId: account.merchantId, secretKey }, webhookSecret };
}

export async function loadFlashAccount(shopId: string): Promise<LoadedFlashAccount | null> {
  return unpackFlashAccount(await findFlashAccount(shopId));
}

/** webhook: secret ใน path → บัญชี (เทียบด้วย hash ไม่เก็บ secret ดิบใน DB) */
export async function loadFlashAccountByWebhookSecret(secret: string): Promise<LoadedFlashAccount | null> {
  if (!secret || secret.length > 128) return null;
  const account = await prisma.shopShippingAccount.findFirst({
    where: { provider: FLASH, webhookSecretHash: hashWebhookSecret(secret), status: { not: "DISCONNECTED" } },
  });
  return unpackFlashAccount(account);
}

/** 1001/1002 จาก Flash ระหว่างใช้งาน (BR-FLASH-14) — timeout/อื่น ๆ ห้ามเรียก */
export async function markFlashTokenInvalid(shopId: string, reason: string): Promise<void> {
  await prisma.shopShippingAccount.updateMany({
    where: { shopId, provider: FLASH, status: "ACTIVE" },
    data: { status: "TOKEN_INVALID", lastVerifyError: reason.slice(0, 300) },
  });
}

export type FlashAuditEntry = { at: string; userId: string | null; action: string; kinds?: string[]; result?: string };

/** ต่อท้ายรายการ (เก็บล่าสุด 50) — ห้ามมีความลับใน entry */
export function appendAudit(prev: unknown, entry: FlashAuditEntry): FlashAuditEntry[] {
  const list = Array.isArray(prev) ? (prev as FlashAuditEntry[]) : [];
  return [...list, entry].slice(-AUDIT_KEEP);
}

/** BR-FLASH-79 / G-1: บันทึกลง auditLog ของแถว FLASH + log บรรทัดเดียว · ล้มไม่ throw (ไม่บล็อกการกระทำหลัก) */
export async function recordFlashAudit(
  shopId: string,
  e: { userId: string | null; action: string; kinds?: string[]; result?: string },
): Promise<void> {
  const entry: FlashAuditEntry = { at: new Date().toISOString(), ...e };
  console.info(`[flash-audit] ${JSON.stringify({ shopId, ...entry })}`);
  try {
    const row = await prisma.shopShippingAccount.findUnique({ where: { shopId_provider: { shopId, provider: FLASH } }, select: { auditLog: true } });
    if (!row) return;
    await prisma.shopShippingAccount.update({
      where: { shopId_provider: { shopId, provider: FLASH } },
      data: { auditLog: appendAudit(row.auditLog, entry) as unknown as Prisma.InputJsonValue },
    });
  } catch (err) {
    console.error("[flash-audit] write failed", err instanceof Error ? err.message : err);
  }
}
