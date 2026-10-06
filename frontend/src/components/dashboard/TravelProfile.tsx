"use client";

import { CustomerProfile } from "@/lib/types";
import { ProfileField } from "./ProfileField";
import { Section } from "./Section";

interface Props { profile: CustomerProfile; }

export function TravelProfile({ profile }: Props) {
  const rows: { label: string; value: string | null }[] = [
    { label: "Destination", value: profile.destination },
    { label: "Passport", value: profile.passport },
    { label: "Purpose", value: profile.purpose },
    { label: "Travel month", value: profile.travel_month },
    { label: "Dates", value: profile.travel_dates },
    {
      label: "Travellers",
      value: profile.travelers ? `${profile.travelers} ${profile.travelers > 1 ? "people" : "person"}` : null,
    },
    {
      label: "Visa",
      value: profile.visa_required === true ? "Required" : profile.visa_required === false ? "Not required" : null,
    },
    { label: "Budget", value: profile.budget },
  ];
  if (profile.customer_name) rows.unshift({ label: "Name", value: profile.customer_name });

  const filled = rows.filter((r) => r.value).length;

  return (
    <Section
      title="Travel profile"
      meta={
        <span className="font-mono text-[11px] text-ink-3 tabular-nums">
          {filled}/{rows.length}<span className="sr-only"> fields captured</span>
        </span>
      }
    >
      <dl>
        {rows.map((r) => (
          <ProfileField key={r.label} label={r.label} value={r.value} />
        ))}
      </dl>
    </Section>
  );
}
