import { describe, expect, it } from "vitest";
import * as v from "valibot";
import { FlashCreateOverrideSchema } from "@/lib/validations";

describe("L6 FlashCreateOverrideSchema.codAmount", () => {
  it("เพดาน 1,000,000", () => {
    expect(v.safeParse(FlashCreateOverrideSchema, { codAmount: 1_000_000 }).success).toBe(true);
    expect(v.safeParse(FlashCreateOverrideSchema, { codAmount: 1_000_001 }).success).toBe(false);
    expect(v.safeParse(FlashCreateOverrideSchema, { codAmount: -1 }).success).toBe(false);
  });
});
