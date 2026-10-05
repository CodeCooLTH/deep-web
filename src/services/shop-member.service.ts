import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checkRemove, checkRoleChange, checkTransfer, staffCountWhere, type MemberRole } from "@/lib/shop-member-rules";
import { recalculateShopTrustScore } from "@/services/trust-score.service";
import {
  BUSINESS_PACKAGE_TIER_CONFIG, SHOP_LOCK_REASON,
  type BusinessPackageTier,
} from "@/lib/business-package";

/** inviteShopMember — TFR-008 (FR-BIZ-09/12): owner เชิญ admin เข้า Business shop ผ่านเบอร์โทร/อีเมล
 *  quota คิดต่อ 1 business (BR-BIZ-08) ไม่ใช่รวมทุก business ของ owner
 */
export async function inviteShopMember(
  ownerId: string,
  shopId: string,
  contact: string,
  contactType: "PHONE" | "EMAIL",
) {
  return prisma.$transaction(async (tx) => {
    const shop = await requireOwnerMember(tx, shopId, ownerId);
    if (shop.packageLockedAt !== null) throw new Error("SHOP_LOCKED");

    // lookup tier ของเจ้าของหลัก (Shop.userId) — ไม่มี/ไม่ ACTIVE = ไม่มีสิทธิ์เชิญ
    const sub = await tx.businessPackageSubscription.findUnique({ where: { ownerId: shop.userId } });
    if (!sub || sub.status !== "ACTIVE") throw new Error("NO_ACTIVE_PACKAGE");
    const maxAdmins = BUSINESS_PACKAGE_TIER_CONFIG[sub.tier as BusinessPackageTier].maxAdminsPerBusiness;

    if (maxAdmins !== null) {
      const adminCount = await tx.shopMember.count({ where: staffCountWhere(shopId, shop.userId) });
      if (adminCount >= maxAdmins) throw new Error("ADMIN_QUOTA_EXCEEDED");
    }

    const duplicatePending = await tx.shopInvite.findFirst({
      where: { shopId, invitedContact: contact, status: "PENDING" },
    });
    if (duplicatePending) throw new Error("INVITE_ALREADY_PENDING");

    return tx.shopInvite.create({
      data: { shopId, invitedContact: contact, contactType, invitedByUserId: ownerId, status: "PENDING" },
    });
  });
}

/** acceptShopInvite — TFR-009 (FR-BIZ-10): ผู้ถูกเชิญ (login แล้ว) accept คำเชิญของตัวเอง
 *  contact-match guard กัน accept invite ของคนอื่น; quota re-check กัน race (owner downgrade ระหว่างรอ accept)
 */
export async function acceptShopInvite(inviteId: string, currentUserId: string) {
  return prisma.$transaction(async (tx) => {
    const invite = await tx.shopInvite.findUnique({ where: { id: inviteId } });
    if (!invite || invite.status !== "PENDING") throw new Error("INVITE_NOT_PENDING");

    const currentUser = await tx.user.findUnique({ where: { id: currentUserId } });
    if (!currentUser) throw new Error("CONTACT_MISMATCH");
    const matched = invite.contactType === "PHONE"
      ? currentUser.phone === invite.invitedContact
      : currentUser.email === invite.invitedContact;
    if (!matched) throw new Error("CONTACT_MISMATCH");

    const shop = await tx.shop.findUnique({ where: { id: invite.shopId } });
    if (!shop) throw new Error("INVITE_NOT_PENDING");
    const sub = await tx.businessPackageSubscription.findUnique({ where: { ownerId: shop.userId } });
    const maxAdmins = sub && sub.status === "ACTIVE"
      ? BUSINESS_PACKAGE_TIER_CONFIG[sub.tier as BusinessPackageTier].maxAdminsPerBusiness
      : 0; // ไม่มี/ไม่ ACTIVE package = ไม่มีโควตาเหลือ (fail-closed)
    if (maxAdmins !== null) {
      const adminCount = await tx.shopMember.count({ where: staffCountWhere(invite.shopId, shop.userId) });
      if (adminCount >= maxAdmins) throw new Error("ADMIN_QUOTA_EXCEEDED_AT_ACCEPT");
    }

    await tx.shopMember.upsert({
      where: { shopId_userId: { shopId: invite.shopId, userId: currentUserId } },
      create: { shopId: invite.shopId, userId: currentUserId, role: "ADMIN" },
      update: {}, // idempotent กันกด accept ซ้ำ
    });

    return tx.shopInvite.update({
      where: { id: inviteId },
      data: { status: "ACCEPTED", acceptedByUserId: currentUserId, acceptedAt: new Date() },
    });
  });
}

/** requireOwnerMember — ผู้เรียกต้องเป็นเจ้าของ (หลักหรือร่วม) ของร้าน BUSINESS (BR-MR-01) */
async function requireOwnerMember(tx: Prisma.TransactionClient, shopId: string, userId: string) {
  const shop = await tx.shop.findUnique({ where: { id: shopId } });
  if (!shop || shop.kind !== "BUSINESS") throw new Error("NOT_OWNER");
  const m = await tx.shopMember.findUnique({ where: { shopId_userId: { shopId, userId } }, select: { role: true } });
  if (m?.role !== "OWNER") throw new Error("NOT_OWNER");
  return shop;
}

async function loadPair(tx: Prisma.TransactionClient, shopId: string, callerId: string, memberId: string) {
  const shop = await tx.shop.findUnique({ where: { id: shopId } });
  if (!shop || shop.kind !== "BUSINESS") throw new Error("NOT_OWNER");
  const [caller, target] = await Promise.all([
    tx.shopMember.findUnique({ where: { shopId_userId: { shopId, userId: callerId } }, select: { userId: true, role: true } }),
    tx.shopMember.findUnique({ where: { id: memberId }, select: { id: true, shopId: true, userId: true, role: true } }),
  ]);
  return { shop, caller, target: target && target.shopId === shopId ? target : null };
}

/** removeShopMember — TFR-010 (FR-BIZ-11) + BR-MR-07: เจ้าของทุกคนลบผู้ดูแล/เจ้าของร่วมได้
 *  ยกเว้นเจ้าของหลักและตัวเอง · auto-unlock ถ้า lock reason คือ QUOTA_EXCEEDED_ADMIN_COUNT และหลังลบโควตาพอดี
 */
export async function removeShopMember(callerId: string, shopId: string, memberId: string) {
  return prisma.$transaction(async (tx) => {
    const { shop, caller, target } = await loadPair(tx, shopId, callerId, memberId);
    const err = checkRemove(shop.userId, caller, target);
    if (err) throw new Error(err);

    await tx.shopMember.delete({ where: { id: memberId } });

    if (shop.packageLockReason === SHOP_LOCK_REASON.QUOTA_EXCEEDED_ADMIN_COUNT) {
      const sub = await tx.businessPackageSubscription.findUnique({ where: { ownerId: shop.userId } });
      const maxAdmins = sub && sub.status === "ACTIVE"
        ? BUSINESS_PACKAGE_TIER_CONFIG[sub.tier as BusinessPackageTier].maxAdminsPerBusiness
        : null;
      const adminCount = await tx.shopMember.count({ where: staffCountWhere(shopId, shop.userId) });
      if (maxAdmins === null || adminCount <= maxAdmins) {
        await tx.shop.update({ where: { id: shopId }, data: { packageLockedAt: null, packageLockReason: null } });
      }
    }

    return { removed: true };
  });
}

/** changeMemberRole — BR-MR-01/02: เจ้าของทุกคนสลับ เจ้าของ↔ผู้ดูแล ให้คนอื่นได้ (แตะเจ้าของหลักไม่ได้)
 *  ไม่กระทบโควตา เพราะโควตานับทุกคนยกเว้นเจ้าของหลักอยู่แล้ว (BR-MR-06)
 */
export async function changeMemberRole(callerId: string, shopId: string, memberId: string, role: MemberRole) {
  return prisma.$transaction(async (tx) => {
    const { shop, caller, target } = await loadPair(tx, shopId, callerId, memberId);
    const err = checkRoleChange(shop.userId, caller, target);
    if (err) throw new Error(err);
    await tx.shopMember.update({ where: { id: memberId }, data: { role } });
    return { role };
  });
}

/** transferShopOwnership — BR-MR-03..05: เจ้าของหลักโอน Shop.userId ให้สมาชิกในร้าน
 *  เจ้าของเดิมคง role OWNER (= เจ้าของร่วม) · L1/Trust Score ของร้านอิงเจ้าของหลัก (FR-2.7) จึงคำนวณใหม่
 */
export async function transferShopOwnership(callerId: string, shopId: string, memberId: string) {
  await prisma.$transaction(async (tx) => {
    const { shop, target } = await loadPair(tx, shopId, callerId, memberId);
    const recipientId = target?.userId ?? "";
    const [sub, recipientActiveBusinessCount, memberCount] = await Promise.all([
      tx.businessPackageSubscription.findUnique({ where: { ownerId: recipientId } }),
      tx.shop.count({ where: { userId: recipientId, kind: "BUSINESS", deletedAt: null, packageLockedAt: null } }),
      tx.shopMember.count({ where: { shopId } }),
    ]);
    const err = checkTransfer({
      primaryOwnerId: shop.userId,
      callerId,
      target,
      shopLocked: shop.packageLockedAt !== null,
      recipientPackage: sub?.status === "ACTIVE" ? BUSINESS_PACKAGE_TIER_CONFIG[sub.tier as BusinessPackageTier] : null,
      recipientActiveBusinessCount,
      memberCount,
    });
    if (err) throw new Error(err);

    await tx.shop.update({ where: { id: shopId }, data: { userId: recipientId } });
    await tx.shopMember.update({ where: { id: memberId }, data: { role: "OWNER" } });
  });
  await recalculateShopTrustScore(shopId).catch((e) =>
    console.error("[transferShopOwnership] trust recalc failed", shopId, e),
  );
  return { transferred: true };
}

/** cancelInvite — owner ยกเลิกคำเชิญที่ยังค้าง PENDING */
export async function cancelInvite(ownerId: string, shopId: string, inviteId: string) {
  await prisma.$transaction((tx) => requireOwnerMember(tx, shopId, ownerId));

  const invite = await prisma.shopInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.shopId !== shopId || invite.status !== "PENDING") throw new Error("INVITE_NOT_PENDING");

  return prisma.shopInvite.update({
    where: { id: inviteId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
}

/** listMembers — สมาชิกทั้งหมดของ shop (role, userId, ข้อมูล user เท่าที่จำเป็นแสดงในหน้าจัดการสมาชิก) */
export async function listMembers(shopId: string) {
  return prisma.shopMember.findMany({
    where: { shopId },
    select: {
      id: true, role: true, userId: true, createdAt: true,
      user: { select: { displayName: true, username: true, avatar: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

/** listInvites — คำเชิญ PENDING ของ shop
 *  ⚠️ คืน `invitedContact` ดิบ (raw PII เทียบเท่า Order.buyerContact) — caller (route/RSC layer, S-9)
 *  ต้อง mask/neutralize ก่อนส่งลง client component ตาม feedback_rsc_pii_neutralize_at_source — ห้าม mask ที่นี่
 */
export async function listInvites(shopId: string) {
  return prisma.shopInvite.findMany({
    where: { shopId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
}
