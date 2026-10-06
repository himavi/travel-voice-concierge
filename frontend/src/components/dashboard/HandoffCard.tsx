"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Headset, X } from "lucide-react";
import { HandoffCard as HandoffCardType } from "@/lib/types";

interface Props {
  card: HandoffCardType;
  onDismiss: () => void;
}

function briefRows(card: HandoffCardType) {
  return [
    { label: "Traveller", value: card.customer_name || "Not given" },
    { label: "Destination", value: card.destination },
    { label: "Passport", value: card.passport },
    { label: "Purpose", value: card.purpose },
    { label: "When", value: card.travel_month },
    { label: "Travellers", value: card.travelers ? `${card.travelers}` : null },
  ];
}

/** Modal brief shown when Aria escalates to a human specialist. */
export function HandoffCard({ card, onDismiss }: Props) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  // Focus the close button on open, close on Escape, and hand focus back to
  // wherever it was when the dialog closes.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismissRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      prev?.focus?.();
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6 bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby="handoff-title"
      aria-describedby="handoff-desc"
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}
    >
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full sm:max-w-[480px] max-h-[92dvh] overflow-y-auto bg-bg-raised border border-line-strong rounded-t-2xl sm:rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div className="flex items-start gap-3.5">
            <span className="mt-0.5 w-10 h-10 rounded-full border border-accent-line text-accent flex items-center justify-center flex-shrink-0" aria-hidden="true">
              <Headset className="w-[18px] h-[18px]" />
            </span>
            <div>
              <p className="label">Specialist handoff</p>
              <h2 id="handoff-title" className="font-serif text-[26px] leading-tight text-ink mt-0.5">
                Brief ready for a human
              </h2>
            </div>
          </div>
          <button
            ref={closeBtnRef}
            onClick={onDismiss}
            aria-label="Dismiss handoff brief"
            className="icon-btn -mr-2 -mt-1"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <p id="handoff-desc" className="px-6 mt-3 text-sm text-ink-2 leading-relaxed">
          Aria packaged the conversation so a specialist can pick up without re-asking.
          <span className="block mt-2 text-ink-3">Reason: <span className="text-ink-2">{card.reason || "The traveller asked to speak with a person"}</span></span>
        </p>

        <dl className="mx-6 mt-5 grid grid-cols-2 gap-x-6 border-t border-line">
          {briefRows(card).map((r) => (
            <div key={r.label} className="py-3 border-b border-line">
              <dt className="text-[12px] text-ink-3">{r.label}</dt>
              <dd className="text-[14px] text-ink mt-0.5 break-words">{r.value || <span className="text-ink-3">—</span>}</dd>
            </div>
          ))}
        </dl>

        {card.conversation_summary && (
          <div className="mx-6 mt-5">
            <p className="text-[12px] text-ink-3">Summary for the specialist</p>
            <p className="mt-1 text-[14px] text-ink-2 leading-relaxed">{card.conversation_summary}</p>
          </div>
        )}

        <div className="mx-6 mt-5 flex items-baseline justify-between border-t border-line pt-4">
          <p className="text-[13px] text-ink-3">Trip readiness</p>
          <p className="font-serif text-[30px] leading-none text-ink tabular-nums">
            {card.lead_score}<span className="text-base text-ink-3">/100</span>
          </p>
        </div>

        <div className="p-6 flex flex-col-reverse sm:flex-row gap-2.5">
          <button onClick={onDismiss} className="btn btn-secondary flex-1">
            Keep chatting
          </button>
          <button
            disabled
            aria-disabled="true"
            title="Live transfer to a specialist isn't wired up in this demo"
            className="btn btn-primary flex-1 whitespace-nowrap"
          >
            Connect to specialist
          </button>
        </div>
        <p className="px-6 pb-6 -mt-3 text-[12px] text-ink-3 text-center sm:text-left">
          Live transfer isn&apos;t wired up in this demo.
        </p>
      </motion.div>
    </motion.div>
  );
}

/** Persistent dashboard entry for a handoff, so the brief can be reopened after dismissing it. */
export function HandoffSummary({ card, onOpen }: { card: HandoffCardType; onOpen: () => void }) {
  return (
    <section aria-labelledby="handoff-summary-title" className="px-5 py-5 border-b border-line">
      <div className="rounded-xl border border-accent-line bg-accent-soft p-4">
        <div className="flex items-center gap-2.5">
          <Headset className="w-4 h-4 text-accent" aria-hidden="true" />
          <h2 id="handoff-summary-title" className="text-[13px] font-semibold text-ink">Handed off to a specialist</h2>
        </div>
        <p className="mt-2 text-[13px] text-ink-2 leading-relaxed">
          {card.reason || "The traveller asked for a person."}
        </p>
        <button onClick={onOpen} className="btn btn-ghost !px-0 !min-h-11 mt-1 !text-accent hover:!bg-transparent hover:underline underline-offset-4">
          View brief
        </button>
      </div>
    </section>
  );
}
