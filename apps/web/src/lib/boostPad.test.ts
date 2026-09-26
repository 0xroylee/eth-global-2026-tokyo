import { describe, expect, test } from "bun:test";
import { validateBossForm, type BossFormInput } from "./boostPad";

const valid: BossFormInput = {
  token: "MockUSD",
  poolAmount: "1000",
  targetVolume: "5000",
  prizePercent: "10",
  stageCount: 2,
  stageImages: ["form-a", "form-a"],
};

describe("validateBossForm", () => {
  test("a complete form is ready for the contract handoff", () => {
    const result = validateBossForm(valid);
    expect(result.errors).toEqual({});
    expect(result.handoff).toEqual({
      token: "MockUSD",
      poolAmount: "1000",
      targetVolume: "5000",
      prizePercent: "10",
      stageCount: 2,
      stageImages: ["form-a", "form-a"],
    });
  });

  test("an empty form names every missing field and produces no handoff", () => {
    const result = validateBossForm({
      token: "  ",
      poolAmount: "",
      targetVolume: "",
      prizePercent: "",
      stageCount: 1,
      stageImages: [""],
    });
    expect(result.handoff).toBeNull();
    expect(result.errors.token).toBeTruthy();
    expect(result.errors.poolAmount).toBeTruthy();
    expect(result.errors.targetVolume).toBeTruthy();
    expect(result.errors.prizePercent).toBeTruthy();
    expect(result.errors.stageImages).toBeTruthy();
  });

  test("zero amounts and a percentage outside 0 to 100 are rejected", () => {
    const zero = validateBossForm({ ...valid, poolAmount: "0", targetVolume: "0", prizePercent: "0" });
    expect(zero.handoff).toBeNull();
    expect(zero.errors.poolAmount).toBeTruthy();
    expect(zero.errors.targetVolume).toBeTruthy();
    expect(zero.errors.prizePercent).toBeTruthy();

    const over = validateBossForm({ ...valid, prizePercent: "101" });
    expect(over.handoff).toBeNull();
    expect(over.errors.prizePercent).toBeTruthy();

    const full = validateBossForm({ ...valid, prizePercent: "100" });
    expect(full.handoff?.prizePercent).toBe("100");
  });

  test("stage count stays between 1 and 3 and each stage needs an image", () => {
    const four = validateBossForm({ ...valid, stageCount: 4, stageImages: ["form-a", "form-b", "form-c", "form-a"] });
    expect(four.handoff).toBeNull();
    expect(four.errors.stageCount).toBeTruthy();

    const missing = validateBossForm({ ...valid, stageCount: 3, stageImages: ["form-b", "form-c"] });
    expect(missing.handoff).toBeNull();
    expect(missing.errors.stageImages).toBeTruthy();
  });
});
