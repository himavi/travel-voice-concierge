"use client";

import { CustomerProfile } from "@/lib/types";
import { MapPin, Globe, Users, Calendar, Briefcase, CreditCard, Star } from "lucide-react";
import clsx from "clsx";

interface Props {
  profile: CustomerProfile;
}

function Field({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  value: string | null | undefined;
  highlight?: boolean;
}) {
  return (
    <div
      className={clsx(
        "flex items-center gap-2.5 py-2 px-3 rounded-lg transition-all duration-300",
        value ? "bg-white/5 border border-white/8" : "border border-dashed border-white/5 opacity-50",
        highlight && value && "border-brand-500/40 bg-brand-500/8"
      )}
    >
      <Icon className={clsx("w-4 h-4 flex-shrink-0", value ? "text-brand-400" : "text-gray-600")} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 leading-none mb-0.5">{label}</p>
        <p className={clsx("text-sm font-medium truncate", value ? "text-white" : "text-gray-600")}>
          {value || "—"}
        </p>
      </div>
      {value && <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0 pulse-dot" />}
    </div>
  );
}

export function ProfilePanel({ profile }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
        Customer Profile
      </p>

      <Field icon={MapPin} label="Destination" value={profile.destination} highlight />
      <Field icon={Globe} label="Passport" value={profile.passport} highlight />
      <Field icon={Briefcase} label="Purpose" value={profile.purpose} />
      <Field icon={Calendar} label="Travel Month" value={profile.travel_month} />
      <Field icon={Calendar} label="Travel Dates" value={profile.travel_dates} />
      <Field
        icon={Users}
        label="Travelers"
        value={profile.travelers ? `${profile.travelers} person${profile.travelers > 1 ? "s" : ""}` : null}
      />
      <Field
        icon={CreditCard}
        label="Visa Required"
        value={
          profile.visa_required === true
            ? "Yes"
            : profile.visa_required === false
            ? "Not required"
            : null
        }
      />
      <Field icon={Star} label="Budget" value={profile.budget} />

      {profile.customer_name && (
        <div className="mt-2 px-3 py-2 rounded-lg bg-brand-600/15 border border-brand-500/25">
          <p className="text-xs text-brand-300 font-medium">Customer: {profile.customer_name}</p>
        </div>
      )}
    </div>
  );
}
