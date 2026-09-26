"use client";

export type AttackEffectPhase = "projectile" | "impact" | "stage-clear" | "victory" | "result";

const SPARKS = [
  { x: -18, y: -10 },
  { x: 16, y: -14 },
  { x: -10, y: 14 },
  { x: 18, y: 8 },
  { x: 0, y: -20 },
  { x: 8, y: 18 },
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
  const x = reducedMotion || landed ? target.x : origin.x;
  const y = reducedMotion || landed ? target.y : origin.y;
  const showFlight = !reducedMotion && phase !== "result";
  const showImpact = landed && phase !== "result";

  return (
    <div className="pointer-events-none absolute inset-0 z-[19] overflow-hidden" aria-hidden>
      {showFlight && (
        <span
          key={`${effectId}-token`}
          className="attack-token"
          style={{ transform: `translate(${x}px, ${y}px) rotate(${landed ? 180 : 0}deg)`, opacity: phase === "victory" ? 0 : 1 }}
        />
      )}
      {showImpact && !reducedMotion && (
        <span className="attack-slash" style={{ transform: `translate(${target.x}px, ${target.y}px) rotate(-32deg)` }} />
      )}
      {showImpact && (
        <span
          className="attack-flash"
          style={{ transform: `translate(${target.x}px, ${target.y}px)`, opacity: reducedMotion ? 0.85 : undefined }}
        />
      )}
      {showImpact && !reducedMotion && SPARKS.map((spark, index) => (
        <span
          key={`${effectId}-spark-${index}`}
          className="attack-spark"
          style={{
            transform: `translate(${target.x + spark.x}px, ${target.y + spark.y}px)`,
            animationDelay: `${index * 30}ms`,
          }}
        />
      ))}
      {stageClear && showImpact && !reducedMotion && (
        <span className="attack-clear-ring" style={{ left: target.x, top: target.y }} />
      )}
      {landed && (
        <p
          className="attack-result absolute font-pixel text-[10px] text-[#f6e7b2]"
          style={{ transform: `translate(${target.x}px, ${target.y - 36}px) translateX(-50%)` }}
        >
          {label}
        </p>
      )}
    </div>
  );
}
