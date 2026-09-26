"use client";

import { useState, type FormEvent } from "react";
import { useBossPool } from "@/lib/useBossPool";
import { validateBossForm, type BossFormInput, type BossHandoff, type StageImageId } from "@/lib/boostPad";

const emptyForm = (): BossFormInput => ({
  token: "",
  poolAmount: "",
  targetVolume: "",
  prizePercent: "",
  stageCount: 1,
  stageImages: [""],
});

/** Shared create-form state for the website page and the pixel factory. */
export function useBoostPadForm() {
  const arena = useBossPool();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<BossFormInput>(emptyForm);
  const [errors, setErrors] = useState<ReturnType<typeof validateBossForm>["errors"]>({});
  const [handoff, setHandoff] = useState<BossHandoff | null>(null);
  const account = arena.wallet.account;
  const connected = arena.wallet.status === "connected" && Boolean(account);

  function edit(next: BossFormInput) {
    setForm(next);
    setHandoff(null);
  }

  function setStageCount(stageCount: 1 | 2 | 3) {
    edit({
      ...form,
      stageCount,
      stageImages: Array.from({ length: stageCount }, (_, index) => form.stageImages[index] ?? ""),
    });
  }

  function chooseImage(index: number, id: StageImageId) {
    const stageImages = form.stageImages.slice();
    stageImages[index] = id;
    edit({ ...form, stageImages });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const result = validateBossForm(form);
    setErrors(result.errors);
    setHandoff(result.handoff);
  }

  return {
    arena,
    account,
    connected,
    formOpen,
    openForm: () => setFormOpen(true),
    closeForm: () => {
      setFormOpen(false);
      setHandoff(null);
    },
    form,
    errors,
    handoff,
    edit,
    setStageCount,
    chooseImage,
    submit,
  };
}

export type BoostPadForm = ReturnType<typeof useBoostPadForm>;
