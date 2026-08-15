"use client";

import { HandoffCard as HandoffCardType } from "@/lib/types";
import { UserCheck, X } from "lucide-react";

interface Props {
  card: HandoffCardType;
  onDismiss: () => void;
}

export function HandoffCard({ card, onDismiss }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#0d1528] border border-red-500/30 rounded-2xl shadow-2xl glow-red overflow-hidden slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-red-500/10 border-b border-red-500/20">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
              <UserCheck className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <p className="font-semibold text-red-300 text-sm">Human Handoff Request</p>
              <p className="text-xs text-gray-500">Customer wants to speak with an agent</p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
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
              <div key={item.label} className="bg-white/4 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-500">{item.label}</p>
                <p className="text-sm font-medium text-white">{item.value}</p>
              </div>
            ))}
          </div>

          {/* Conversation summary */}
          {card.conversation_summary && (
            <div className="bg-white/4 rounded-lg px-3 py-2.5">
              <p className="text-xs text-gray-500 mb-1">Summary for agent</p>
              <p className="text-sm text-gray-300 leading-relaxed">{card.conversation_summary}</p>
            </div>
          )}

          {/* Lead score */}
          <div className="flex items-center justify-between bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2.5">
            <p className="text-sm text-orange-300 font-medium">Lead Score</p>
            <p className="text-2xl font-bold text-orange-400">{card.lead_score}<span className="text-sm text-gray-500 font-normal">/100</span></p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-4 flex gap-2">
          <button className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-500 rounded-xl text-sm font-semibold text-white transition-colors">
            Connect Now
          </button>
          <button
            onClick={onDismiss}
            className="flex-1 py-2.5 bg-white/6 hover:bg-white/10 rounded-xl text-sm font-medium text-gray-300 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
