"use client";

import { useEffect } from "react";
import { trackFunnel, type FunnelStep } from "@/lib/funnel";

// Fires one funnel step when a server-rendered page mounts.
export default function FunnelPing({ step }: { step: FunnelStep }) {
  useEffect(() => {
    trackFunnel(step);
  }, [step]);
  return null;
}
