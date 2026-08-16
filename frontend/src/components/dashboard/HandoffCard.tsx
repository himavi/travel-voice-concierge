"use client";

import { useEffect, useRef } from "react";
import { HandoffCard as HandoffCardType } from "@/lib/types";
import { UserCheck, X } from "lucide-react";
import { motion } from "framer-motion";

interface Props {
  card: HandoffCardType;
  onDismiss: () => void;
}

export function HandoffCard({ card, onDismiss }: Props) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeBtnRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="handoff-title"
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md glass-bright rounded-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(255,107,74,0.16)" }}>
              <UserCheck className="w-4 h-4" style={{ color: "#FF8A65" }} aria-hidden="true" />
            </div>
            <div>
              <p id="handoff-title" className="font-semibold text-sm font-display" style={{ color: "#FF8A65" }}>Human Handoff Request</p>
              <p className="text-xs" style={{ color: "var(--ink-dim)" }}>Customer wants to speak with an agent</p>
            </div>
          </div>
          <button
            ref={closeBtnRef}
            onClick={onDismiss}
            aria-label="Dismiss handoff request"
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
          >
            <X className="w-4 h-4" style={{ color: "var(--ink-dim)" }} aria-hidden="true" />
          </button>
        </div>

        {/* Profile summary */}
        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Customer", value: card.customer_name || "Unknown" },
              { label: "Destination", value: card.destination || "—" },
              { label: "Passport", value: card.passport || "—" },
              { label: "Purpose", value: card.purpose || "—" },
              { label: "Travel", value: card.travel_month || "—" },
              { label: "Travelers", value: card.travelers ? `${card.travelers}` : "—" },
            ].map((item) => (
              <div key={item.label} className="card rounded-lg px-3 py-2">
                <p className="text-xs" style={{ color: "var(--ink-dim)" }}>{item.label}</p>
                <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>{item.value}</p>
              </div>
            ))}
          </div>

          {/* Conversation summary */}
          {card.conversation_summary && (
            <div className="card rounded-lg px-3 py-2.5">
              <p className="text-xs mb-1" style={{ color: "var(--ink-dim)" }}>Summary for agent</p>
              <p className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>{card.conversation_summary}</p>
            </div>
          )}

          {/* Lead score */}
          <div className="flex items-center justify-between rounded-lg px-3 py-2.5 border"
            style={{ background: "rgba(245,166,35,0.1)", borderColor: "rgba(245,166,35,0.28)" }}>
            <p className="text-sm font-medium" style={{ color: "#F5A623" }}>Lead Score</p>
            <p className="text-2xl font-bold font-display" style={{ color: "#F5A623" }}>{card.lead_score}<span className="text-sm font-normal" style={{ color: "var(--ink-dim)" }}>/100</span></p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex gap-2">
          <button
            disabled
            aria-disabled="true"
            title="Live agent transfer isn't wired up yet"
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white opacity-40 cursor-not-allowed"
            style={{ background: "linear-gradient(135deg, #FF6B4A, #F5A623)" }}
          >
            Connect Now
          </button>
          <button
            onClick={onDismiss}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-white/10"
            style={{ background: "rgba(255,255,255,0.05)", color: "var(--ink-2)", border: "1px solid var(--border)" }}
          >
            Dismiss
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
