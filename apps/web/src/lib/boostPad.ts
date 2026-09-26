export const STAGE_IMAGE_IDS = ["form-a", "form-b", "form-c", "whale", "little-roy", "roy-king", "roy-tide"] as const;

export type StageImageId = (typeof STAGE_IMAGE_IDS)[number];

export const STAGE_IMAGES: Record<StageImageId, { label: string; src: string }> = {
  "form-a": { label: "Form A", src: "/images/boss-cat-form-a.png" },
  "form-b": { label: "Form B", src: "/images/boss-cat-form-b.png" },
  "form-c": { label: "Form C", src: "/images/boss-cat-form-c.png" },
  whale: { label: "Macro Whale", src: "/images/boss-macro-whale-portrait.png" },
  "little-roy": { label: "Little ETH", src: "/images/little-roy-slime.png" },
  "roy-king": { label: "Little ETH King", src: "/images/little-roy-king-a.png" },
  "roy-tide": { label: "Little ETH Tide", src: "/images/little-roy-king-b.png" },
};

export type BossFormInput = {
  token: string;
  poolAmount: string;
  targetVolume: string;
  prizePercent: string;
  stageCount: number;
  stageImages: readonly string[];
};

export type BossField = "token" | "poolAmount" | "targetVolume" | "prizePercent" | "stageCount" | "stageImages";

export type BossFieldErrors = Partial<Record<BossField, string>>;

/** The description a contract partner can deploy later. It is not saved. */
export type BossHandoff = {
  token: string;
  poolAmount: string;
  targetVolume: string;
  prizePercent: string;
  stageCount: 1 | 2 | 3;
  stageImages: StageImageId[];
};

const POSITIVE = /^\d+(\.\d+)?$/;

function isStageImageId(value: string): value is StageImageId {
  return (STAGE_IMAGE_IDS as readonly string[]).includes(value);
}

function positiveAmount(value: string): boolean {
  const trimmed = value.trim();
  return POSITIVE.test(trimmed) && Number(trimmed) > 0;
}

/** Field checks for the BoostPad create form. A handoff exists only when every field is valid. */
export function validateBossForm(input: BossFormInput): { errors: BossFieldErrors; handoff: BossHandoff | null } {
  const errors: BossFieldErrors = {};
  const token = input.token.trim();
  if (!token) errors.token = "Choose a token.";

  if (!positiveAmount(input.poolAmount)) errors.poolAmount = "Enter an amount greater than zero.";
  if (!positiveAmount(input.targetVolume)) errors.targetVolume = "Enter a target volume greater than zero.";

  const prizePercent = input.prizePercent.trim();
  const prize = Number(prizePercent);
  if (!POSITIVE.test(prizePercent) || prize <= 0 || prize > 100) {
    errors.prizePercent = "Enter a percentage greater than 0 and at most 100.";
  }

  const stageCount = input.stageCount;
  if (stageCount !== 1 && stageCount !== 2 && stageCount !== 3) {
    errors.stageCount = "Choose 1, 2, or 3 stages.";
  }

  const chosen = input.stageImages.slice(0, stageCount);
  const imagesReady =
    chosen.length === stageCount && chosen.every(isStageImageId);
  if (!imagesReady) errors.stageImages = "Choose an image for each stage.";

  if (Object.keys(errors).length > 0 || !imagesReady || (stageCount !== 1 && stageCount !== 2 && stageCount !== 3)) {
    return { errors, handoff: null };
  }

  return {
    errors,
    handoff: {
      token,
      poolAmount: input.poolAmount.trim(),
      targetVolume: input.targetVolume.trim(),
      prizePercent,
      stageCount,
      stageImages: chosen.filter(isStageImageId),
    },
  };
}
