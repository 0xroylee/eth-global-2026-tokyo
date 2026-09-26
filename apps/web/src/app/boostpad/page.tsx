import { Suspense } from "react";
import { BoostPadView } from "@/components/boostpad/BoostPadView";

export default function BoostPadPage() {
  return (
    <Suspense fallback={null}>
      <BoostPadView />
    </Suspense>
  );
}
