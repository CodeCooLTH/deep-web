-- 00071 P2 S-8: บทบาทย่อยของสมาชิกร้าน (additive — ไม่มี DROP/TRUNCATE/DELETE)
ALTER TABLE "ShopMember" ADD COLUMN "roles" TEXT[] DEFAULT '{}'::text[];
ALTER TABLE "ShopInvite" ADD COLUMN "roles" TEXT[] DEFAULT ARRAY['MANAGER']::text[];
ALTER TABLE "ShopInviteLink" ADD COLUMN "roles" TEXT[] DEFAULT ARRAY['MANAGER']::text[];
UPDATE "ShopMember" SET "roles" = ARRAY['MANAGER']::text[] WHERE "role" = 'ADMIN';
ALTER TABLE "ShopMember" ALTER COLUMN "roles" SET NOT NULL;
ALTER TABLE "ShopInvite" ALTER COLUMN "roles" SET NOT NULL;
ALTER TABLE "ShopInviteLink" ALTER COLUMN "roles" SET NOT NULL;

-- CHECK: OWNER = ไม่มี roles · ADMIN = 1..4 ค่าจากชุด MANAGER/CHAT/BILLING/TECHNICIAN
ALTER TABLE "ShopMember" ADD CONSTRAINT "ShopMember_roles_check" CHECK (
  ("role" = 'OWNER' AND cardinality("roles") = 0)
  OR ("role" = 'ADMIN' AND cardinality("roles") BETWEEN 1 AND 4
      AND "roles" <@ ARRAY['MANAGER','CHAT','BILLING','TECHNICIAN']::text[])
) NOT VALID;
ALTER TABLE "ShopMember" VALIDATE CONSTRAINT "ShopMember_roles_check";

ALTER TABLE "ShopInvite" ADD CONSTRAINT "ShopInvite_roles_check" CHECK (
  cardinality("roles") BETWEEN 1 AND 4
  AND "roles" <@ ARRAY['MANAGER','CHAT','BILLING','TECHNICIAN']::text[]
) NOT VALID;
ALTER TABLE "ShopInvite" VALIDATE CONSTRAINT "ShopInvite_roles_check";

ALTER TABLE "ShopInviteLink" ADD CONSTRAINT "ShopInviteLink_roles_check" CHECK (
  cardinality("roles") BETWEEN 1 AND 4
  AND "roles" <@ ARRAY['MANAGER','CHAT','BILLING','TECHNICIAN']::text[]
) NOT VALID;
ALTER TABLE "ShopInviteLink" VALIDATE CONSTRAINT "ShopInviteLink_roles_check";
