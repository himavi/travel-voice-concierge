"use client";

import { useEffect, useRef, useState } from "react";
import { CustomerProfile } from "@/lib/types";
import { Section } from "./Section";

interface Props {
  profile: CustomerProfile;
  /** Field Aria plans to ask about next (from the latest QUESTION_GENERATED event). */
  nextField?: string;
}

const INTENT_LABEL: Record<string, string> = {
  visa_inquiry: "Visa inquiry",
  trip_planning: "Trip planning",
  cost_inquiry: "Cost inquiry",
  general_info: "General info",
  human_handoff: "Human handoff",
};

function stageFor(score: number) {
  if (score >= 80) return "Ready to book";
  if (score >= 60) return "Almost there";
  if (score >= 30) return "Building profile";
  return "Just getting started";
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export function LeadScore({ profile, nextField }: Props) {
  const score = Math.max(0, Math.min(100, profile.lead_score));
  const [displayed, setDisplayed] = useState(score);
  const shownRef = useRef(score);
  const stage = stageFor(score);

  // Count up/down to the new score; instant with reduced motion.
  useEffect(() => {
    const from = shownRef.current;
    if (from === score) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      shownRef.current = score;
      setDisplayed(score);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 700);
      const v = Math.round(from + (score - from) * ease(t));
      shownRef.current = v;
      setDisplayed(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  const intent = profile.intent ? INTENT_LABEL[profile.intent] ?? profile.intent.replace(/_/g, " ") : null;

  return (
    <Section
      title="Trip readiness"
      meta={intent && (
        <span className="inline-flex items-center h-6 px-2 rounded-md border border-line-strong text-[12px] text-ink-2">
          <span className="sr-only">Intent: </span>{intent}
        </span>
      )}
    >
      <div className="flex items-end justify-between gap-4">
        <p className="font-serif text-[52px] leading-[0.9] tracking-[-0.02em] tabular-nums text-ink" aria-hidden="true">
          {displayed}
          <span className="text-[26px] text-ink-3 ml-0.5">%</span>
        </p>
        <p className="text-sm text-ink-2 pb-1">{stage}</p>
      </div>
      <div className="mt-4 h-1 rounded-full bg-line overflow-hidden" aria-hidden="true">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
          style={{ width: `${score}%` }}
        />
      </div>
      {nextField && (
        <p className="mt-3 text-[13px] text-ink-3">
          Next, Aria will ask about <span className="text-ink-2">{nextField.replace(/_/g, " ")}</span>
        </p>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        Trip readiness {score} percent, {stage}.
      </p>
    </Section>
  );
}
