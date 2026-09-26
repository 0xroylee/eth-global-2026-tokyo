"use client";

import { useEffect, useState } from "react";

function formatHMS(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

const URGENT_MS = 10 * 60 * 1000;

/** Mock round deadline as `HH:MM:SS`; urgent (<10min) turns danger. */
export function DeadlineCountdown({ deadlineAt }: { deadlineAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = deadlineAt - now;
  const urgent = remaining < URGENT_MS;

  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="eyebrow">ROUND DEADLINE</span>
      <span className={`font-mono text-xs tabular-nums ${urgent ? "text-danger" : "text-fog"}`}>
        {formatHMS(remaining)}
      </span>
    </div>
  );
}
