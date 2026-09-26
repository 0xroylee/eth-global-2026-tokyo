import type { ReactNode } from "react";

/** JRPG window: 4px navy shell, 2px cream inner edge, 4px offset shadow. Solid, not glass. */
export function BattleFrame({
  tone = "cream",
  className = "",
  children,
}: {
  tone?: "cream" | "navy";
  className?: string;
  children: ReactNode;
}) {
  const inner =
    tone === "navy"
      ? "border-2 border-[#FFF9E9] bg-[#092B61] text-white"
      : "border-2 border-white bg-[#FFF9E9] text-[#092B61]";
  return (
    <div className={`bg-[#092B61] p-1 shadow-[4px_4px_0_#041833] ${className}`}>
      <div className={inner}>{children}</div>
    </div>
  );
}
