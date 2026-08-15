"use client";

import { CustomerProfile } from "@/lib/types";
import { MapPin, Globe, Users, Calendar, Briefcase, CreditCard, Star } from "lucide-react";
import clsx from "clsx";

interface Props { profile: CustomerProfile; }

function Field({ icon: Icon, label, value }: {
  icon: React.ElementType; label: string; value: string | null | undefined;
}) {
  const filled = !!value;
  return (
    <div className={clsx(
      "flex items-center gap-2.5 py-2 px-3 rounded-lg transition-all duration-500",
      filled ? "opacity-100" : "opacity-40"
    )}
    style={{
      background: filled ? "rgba(124,58,237,0.08)" : "transparent",
      border: filled ? "1px solid rgba(168,85,247,0.18)" : "1px dashed rgba(168,85,247,0.1)",
    }}>
      <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true"
        style={{ color: filled ? "#a855f7" : "#4b3f72" }} />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] leading-none mb-0.5" style={{ color: "#6b5c8a" }}>{label}</p>
        <p className="text-xs font-medium truncate" style={{ color: filled ? "#e9d5ff" : "#4b3f72" }}>
          {value || "—"}
        </p>
      </div>
      {filled && (
        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 pulse-dot" aria-hidden="true"
          style={{ background: "#a855f7" }} />
      )}
    </div>
  );
}

export function ProfilePanel({ profile }: Props) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "#6b5c8a" }}>
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

      {profile.customer_name && (
        <div className="mt-2 px-3 py-2 rounded-lg"
          style={{ background: "rgba(124,58,237,0.12)", border: "1px solid rgba(168,85,247,0.2)" }}>
          <p className="text-xs font-medium" style={{ color: "#c084fc" }}>
            Customer: {profile.customer_name}
          </p>
        </div>
      )}
    </div>
  );
}
