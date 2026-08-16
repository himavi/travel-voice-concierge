"use client";

import { CustomerProfile } from "@/lib/types";
import { MapPin, Globe, Users, Calendar, Briefcase, CreditCard, Star } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { ProfileField } from "./ProfileField";

interface Props { profile: CustomerProfile; }

// The five fields the "Travel Profile progress" bar tracks — the core
// application-readiness fields, distinct from the full field list below
// (which also shows travelers/visa requirement).
function progressFields(profile: CustomerProfile) {
  return [
    { label: "Destination", done: !!profile.destination },
    { label: "Passport", done: !!profile.passport },
    { label: "Purpose", done: !!profile.purpose },
    { label: "Dates", done: !!(profile.travel_month || profile.travel_dates) },
    { label: "Budget", done: !!profile.budget },
  ];
}

export function TravelProfile({ profile }: Props) {
  const fields = progressFields(profile);
  const doneCount = fields.filter(f => f.done).length;
  const pct = Math.round((doneCount / fields.length) * 100);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--ink-dim)" }}>
          Travel Profile
        </p>
        <p className="text-[10px] font-semibold tabular-nums" style={{ color: "var(--ink-dim)" }}>
          {doneCount}/{fields.length}
        </p>
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }} aria-hidden="true">
        <motion.div
          className="h-full rounded-full"
          style={{ background: "linear-gradient(90deg, #FF6B4A, #F5A623)" }}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1" aria-hidden="true">
        {fields.map(f => (
          <span key={f.label} className="text-[10px] flex items-center gap-1"
            style={{ color: f.done ? "#FF8A65" : "var(--ink-faint)" }}>
            <span className="w-1 h-1 rounded-full" style={{ background: f.done ? "#FF6B4A" : "var(--ink-faint)" }} />
            {f.label}
          </span>
        ))}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        Travel profile {pct}% complete — {doneCount} of {fields.length} core fields captured.
      </p>

      <div className="space-y-1.5 pt-1">
        <ProfileField icon={MapPin} label="Destination" value={profile.destination} />
        <ProfileField icon={Globe} label="Passport" value={profile.passport} />
        <ProfileField icon={Briefcase} label="Purpose" value={profile.purpose} />
        <ProfileField icon={Calendar} label="Travel Month" value={profile.travel_month} />
        <ProfileField icon={Calendar} label="Travel Dates" value={profile.travel_dates} />
        <ProfileField icon={Users} label="Travelers"
          value={profile.travelers ? `${profile.travelers} person${profile.travelers > 1 ? "s" : ""}` : null} />
        <ProfileField icon={CreditCard} label="Visa Required"
          value={profile.visa_required === true ? "Yes" : profile.visa_required === false ? "Not required" : null} />
        <ProfileField icon={Star} label="Budget" value={profile.budget} />
      </div>

      <AnimatePresence>
        {profile.customer_name && (
          <motion.div
            initial={{ opacity: 0, y: 6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="px-3 py-2 rounded-lg overflow-hidden"
            style={{ background: "rgba(255,107,74,0.12)", border: "1px solid rgba(255,107,74,0.25)" }}
          >
            <p className="text-xs font-medium" style={{ color: "#FF8A65" }}>
              Customer: {profile.customer_name}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
