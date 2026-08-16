"use client";

import { CustomerProfile } from "@/lib/types";
import { MapPin, Globe, Users, Calendar, Briefcase, CreditCard, Star } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

interface Props { profile: CustomerProfile; }

function Field({ icon: Icon, label, value }: {
  icon: React.ElementType; label: string; value: string | null | undefined;
}) {
  const filled = !!value;
  return (
    <motion.div
      layout
      className="flex items-center gap-2.5 py-2 px-3 rounded-lg"
      animate={{
        opacity: filled ? 1 : 0.55,
        backgroundColor: filled ? "rgba(255,107,74,0.08)" : "rgba(255,255,255,0.015)",
      }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      style={{
        border: filled ? "1px solid rgba(255,107,74,0.2)" : "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true"
        style={{ color: filled ? "#FF6B4A" : "var(--ink-faint)" }} />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] leading-none mb-1" style={{ color: "var(--ink-dim)" }}>{label}</p>
        <AnimatePresence mode="wait">
          {filled ? (
            <motion.p
              key={value}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="text-xs font-medium truncate"
              style={{ color: "var(--ink)" }}
            >
              {value}
            </motion.p>
          ) : (
            <p key="empty" className="text-xs font-medium">
              <span className="empty-dash" aria-hidden="true" />
              <span className="sr-only">Not yet known</span>
            </p>
          )}
        </AnimatePresence>
      </div>
      {filled && (
        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 pulse-dot" aria-hidden="true"
          style={{ background: "#FF6B4A" }} />
      )}
    </motion.div>
  );
}

export function ProfilePanel({ profile }: Props) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--ink-dim)" }}>
        Customer Profile
      </p>
      <Field icon={MapPin}     label="Destination"   value={profile.destination} />
      <Field icon={Globe}      label="Passport"      value={profile.passport} />
      <Field icon={Briefcase}  label="Purpose"       value={profile.purpose} />
      <Field icon={Calendar}   label="Travel Month"  value={profile.travel_month} />
      <Field icon={Calendar}   label="Travel Dates"  value={profile.travel_dates} />
      <Field icon={Users}      label="Travelers"
        value={profile.travelers ? `${profile.travelers} person${profile.travelers > 1 ? "s" : ""}` : null} />
      <Field icon={CreditCard} label="Visa Required"
        value={profile.visa_required === true ? "Yes" : profile.visa_required === false ? "Not required" : null} />
      <Field icon={Star}       label="Budget"        value={profile.budget} />

      <AnimatePresence>
        {profile.customer_name && (
          <motion.div
            initial={{ opacity: 0, y: 6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="mt-2 px-3 py-2 rounded-lg overflow-hidden"
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
