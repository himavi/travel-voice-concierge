"use client";

import { useEffect, useRef } from "react";
import { HandoffCard as HandoffCardType } from "@/lib/types";
import { UserCheck, X } from "lucide-react";

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="handoff-title"
    >
      <div className="w-full max-w-md bg-white border rounded-2xl overflow-hidden slide-up"
        style={{ borderColor: "rgba(255,107,74,0.25)", boxShadow: "0 20px 60px rgba(232,82,58,0.18), 0 4px 16px rgba(58,46,34,0.1)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b"
          style={{ background: "rgba(255,107,74,0.08)", borderColor: "rgba(255,107,74,0.18)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(255,107,74,0.16)" }}>
              <UserCheck className="w-4 h-4" style={{ color: "#E8523A" }} aria-hidden="true" />
            </div>
            <div>
              <p id="handoff-title" className="font-semibold text-sm" style={{ color: "#C2401F" }}>Human Handoff Request</p>
              <p className="text-xs" style={{ color: "#7A6248" }}>Customer wants to speak with an agent</p>
            </div>
          </div>
          <button
            ref={closeBtnRef}
            onClick={onDismiss}
            aria-label="Dismiss handoff request"
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[rgba(58,46,34,0.06)]"
          >
            <X className="w-4 h-4" style={{ color: "#7A6248" }} aria-hidden="true" />
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
              <div key={item.label} className="rounded-lg px-3 py-2" style={{ background: "rgba(58,46,34,0.04)" }}>
                <p className="text-xs" style={{ color: "#7A6248" }}>{item.label}</p>
                <p className="text-sm font-medium" style={{ color: "#3A2E22" }}>{item.value}</p>
              </div>
            ))}
          </div>

          {/* Conversation summary */}
          {card.conversation_summary && (
            <div className="rounded-lg px-3 py-2.5" style={{ background: "rgba(58,46,34,0.04)" }}>
              <p className="text-xs mb-1" style={{ color: "#7A6248" }}>Summary for agent</p>
              <p className="text-sm leading-relaxed" style={{ color: "#5C4A38" }}>{card.conversation_summary}</p>
            </div>
          )}

          {/* Lead score */}
          <div className="flex items-center justify-between rounded-lg px-3 py-2.5 border"
            style={{ background: "rgba(245,166,35,0.08)", borderColor: "rgba(245,166,35,0.25)" }}>
            <p className="text-sm font-medium" style={{ color: "#8A5C10" }}>Lead Score</p>
            <p className="text-2xl font-bold" style={{ color: "#B0521A" }}>{card.lead_score}<span className="text-sm font-normal" style={{ color: "#7A6248" }}>/100</span></p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-4 flex gap-2">
          <button
            disabled
            aria-disabled="true"
            title="Live agent transfer isn't wired up yet"
            className="flex-1 py-2.5 bg-brand-600 rounded-xl text-sm font-semibold text-white opacity-40 cursor-not-allowed"
          >
            Connect Now
          </button>
          <button
            onClick={onDismiss}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-[rgba(58,46,34,0.08)]"
            style={{ background: "rgba(58,46,34,0.04)", color: "#5C4A38" }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
