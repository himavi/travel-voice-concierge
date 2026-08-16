"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileCheck2, Clock, ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import { VisaInfo } from "@/lib/types";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

interface Props {
  sessionId: string | null;
  destination: string | null;
  passport: string | null;
}

export function VisaInsight({ sessionId, destination, passport }: Props) {
  const [info, setInfo] = useState<VisaInfo | null>(null);

  useEffect(() => {
    if (!sessionId || !destination || !passport) {
      setInfo(null);
      return;
    }
    let cancelled = false;
    fetch(`${BACKEND_URL}/api/sessions/${sessionId}/visa-info`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (!cancelled) setInfo(data); })
      .catch(() => { if (!cancelled) setInfo(null); });
    return () => { cancelled = true; };
  }, [sessionId, destination, passport]);

  if (!info || !info.available) return null;

  const docCount = info.documents?.length ?? 0;
  const requirementStyle = info.visa_required === true
    ? { icon: ShieldAlert, color: "#F5A623", label: "Visa required" }
    : info.visa_required === false
    ? { icon: ShieldCheck, color: "#3FCFA0", label: "No visa required" }
    : { icon: ShieldQuestion, color: "var(--ink-dim)", label: "Checking requirement" };
  const RequirementIcon = requirementStyle.icon;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 12, height: 0 }}
        animate={{ opacity: 1, y: 0, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="glass rounded-2xl px-4 py-4 overflow-hidden"
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--ink-dim)" }}>
            Visa Insight
          </p>
          <span
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold"
            style={{ background: `${requirementStyle.color}1A`, border: `1px solid ${requirementStyle.color}40`, color: requirementStyle.color }}
          >
            <RequirementIcon className="w-3 h-3" aria-hidden="true" />
            {requirementStyle.label}
          </span>
        </div>

        <p className="text-sm font-semibold mb-1" style={{ color: "var(--ink)" }}>
          {passport} → {destination}
        </p>
        {info.visa_type && (
          <p className="text-xs mb-3" style={{ color: "var(--ink-2)" }}>{info.visa_type}</p>
        )}

        <div className="grid grid-cols-2 gap-2 mb-3">
          {info.processing_time && (
            <div className="card rounded-lg px-3 py-2">
              <p className="text-[10px] flex items-center gap-1 mb-0.5" style={{ color: "var(--ink-dim)" }}>
                <Clock className="w-3 h-3" aria-hidden="true" /> Processing
              </p>
              <p className="text-xs font-medium" style={{ color: "var(--ink)" }}>{info.processing_time}</p>
            </div>
          )}
          {info.fee && (
            <div className="card rounded-lg px-3 py-2">
              <p className="text-[10px] mb-0.5" style={{ color: "var(--ink-dim)" }}>Fee</p>
              <p className="text-xs font-medium" style={{ color: "var(--ink)" }}>{info.fee}</p>
            </div>
          )}
        </div>

        {docCount > 0 && (
          <div className="rounded-lg px-3 py-2.5" style={{ background: "rgba(255,107,74,0.08)", border: "1px solid rgba(255,107,74,0.2)" }}>
            <p className="text-xs font-medium flex items-center gap-1.5" style={{ color: "#FF8A65" }}>
              <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
              {docCount} document{docCount > 1 ? "s" : ""} to prepare
            </p>
            <p className="text-[11px] mt-1 leading-relaxed" style={{ color: "var(--ink-dim)" }}>
              Aria will walk you through gathering each one before you apply.
            </p>
          </div>
        )}

        {info.notes && (
          <p className="text-[11px] mt-3 leading-relaxed" style={{ color: "var(--ink-faint)" }}>{info.notes}</p>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
