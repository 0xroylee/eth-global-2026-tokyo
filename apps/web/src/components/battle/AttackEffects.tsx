"use client";

import type { CSSProperties } from "react";

export type AttackEffectPhase = "projectile" | "impact" | "stage-clear" | "victory" | "result";

const SPARKS = [
  { x: -70, y: -38 },
  { x: 66, y: -48 },
  { x: -52, y: 54 },
  { x: 74, y: 30 },
  { x: -8, y: -76 },
  { x: 22, y: 68 },
  { x: -82, y: 8 },
  { x: 48, y: -72 },
] as const;

/** Noninteractive token slash. Coordinates are relative to the battle field. */
export function AttackEffects({
  phase,
  effectId,
  origin,
  target,
  reducedMotion,
  label,
  stageClear,
}: {
  phase: AttackEffectPhase;
  effectId: string;
  origin: { x: number; y: number };
  target: { x: number; y: number };
  reducedMotion: boolean;
  label: string;
  stageClear: boolean;
}) {
  const landed = phase !== "projectile";
  const showFlight = !reducedMotion && phase === "projectile";
  const showImpact = !reducedMotion && landed && phase !== "result";

  return (
    <div key={effectId} className={`pointer-events-none absolute inset-0 z-[19] overflow-hidden ${reducedMotion ? "attack-effects-reduced" : ""}`} aria-hidden>
      {showFlight && (
        <span
          className="attack-token"
          style={{
            left: origin.x,
            top: origin.y,
            "--attack-x": `${target.x - origin.x}px`,
            "--attack-y": `${target.y - origin.y}px`,
          } as CSSProperties}
        />
      )}
      {showImpact && (
        <div className="absolute" style={{ left: target.x, top: target.y }}>
          <span className="attack-impact-ring" />
          <span className="attack-slash" />
          <span className="attack-slash attack-slash-cross" />
          <span className="attack-flash" />
          {SPARKS.map((spark, index) => (
            <span
              key={index}
              className="attack-spark"
              style={{ "--spark-x": `${spark.x}px`, "--spark-y": `${spark.y}px` } as CSSProperties}
            />
          ))}
          {stageClear && <span className="attack-clear-ring" />}
        </div>
      )}
      {landed && (
        <p
          className="attack-result absolute font-pixel text-xs text-[#FFF9E9]"
          style={{ left: target.x, top: target.y - 44, transform: "translateX(-50%)" }}
        >
          {label}
        </p>
      )}
    </div>
  );
}
