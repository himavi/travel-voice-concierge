"use client";

import { BadgeCheck, ChevronDown, Clock3, ExternalLink, ShieldAlert, ShieldCheck } from "lucide-react";
import clsx from "clsx";
import { VisaInfo } from "@/lib/types";
import { Section } from "./Section";

/**
 * The backend's VisaInfo also carries provenance (see backend
 * tools/visa_knowledge.py); read it here without widening the shared type.
 */
type VisaWithProvenance = VisaInfo & {
  source?: string | null;
  last_verified?: string | null;
  verified?: boolean;
};

interface Props {
  /** Latest `visa` from a turn response (null until passport + destination are known). */
  info: VisaInfo | null;
  destination: string | null;
  passport: string | null;
}

function fmtDate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function hostOf(url?: string | null) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function Disclosure({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="group border-t border-line">
      <summary className="flex items-center justify-between gap-3 min-h-11 py-2 cursor-pointer text-[13px] text-ink-2 hover:text-ink">
        {summary}
        <ChevronDown className="w-4 h-4 text-ink-3 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="pb-3">{children}</div>
    </details>
  );
}

export function VisaInsight({ info: raw, destination, passport }: Props) {
  if (!destination || !passport || !raw) return null;
  const info = raw as VisaWithProvenance;

  if (!info.available) {
    if (!info.notes) return null;
    return (
      <Section title="Visa insight">
        <p className="text-sm text-ink-2 leading-relaxed">{info.notes}</p>
      </Section>
    );
  }

  const req =
    info.visa_required === true
      ? { Icon: ShieldAlert, label: "Visa required", cls: "border-accent-line text-accent" }
      : info.visa_required === false
      ? { Icon: ShieldCheck, label: "No visa needed", cls: "border-[rgba(147,201,164,0.4)] text-ok" }
      : null;

  const facts = [
    { label: "Processing", value: info.processing_time },
    { label: "Fee", value: info.fee },
    { label: "Validity", value: info.validity },
  ].filter((f): f is { label: string; value: string } => !!f.value);

  const docs = info.documents ?? [];
  const verifiedOn = fmtDate(info.last_verified);
  const host = hostOf(info.source);
  const stale = info.verified === false;

  return (
    <Section
      title="Visa insight"
      meta={req && (
        <span className={clsx("inline-flex items-center gap-1.5 h-6 px-2 rounded-md border text-[12px] font-medium", req.cls)}>
          <req.Icon className="w-3.5 h-3.5" aria-hidden="true" />
          {req.label}
        </span>
      )}
    >
      <p className="font-serif text-[24px] leading-tight text-ink">
        {passport} <span className="text-ink-3" aria-hidden="true">→</span>
        <span className="sr-only"> passport to </span> {destination}
      </p>
      {info.visa_type && <p className="mt-1 text-sm text-ink-2">{info.visa_type}</p>}

      {facts.length > 0 && (
        <dl className="mt-4 space-y-3">
          {facts.map((f) => (
            <div key={f.label}>
              <dt className="text-[12px] text-ink-3">{f.label}</dt>
              <dd className="text-[14px] text-ink leading-snug mt-0.5">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {(docs.length > 0 || info.notes) && (
        <div className="mt-4">
          {docs.length > 0 && (
            <Disclosure summary={`${docs.length} document${docs.length > 1 ? "s" : ""} to prepare`}>
              <ul className="space-y-1.5">
                {docs.map((d) => (
                  <li key={d} className="flex gap-2.5 text-[13px] text-ink-2 leading-snug">
                    <span className="mt-[7px] w-1 h-1 rounded-full bg-ink-3 flex-shrink-0" aria-hidden="true" />
                    {d}
                  </li>
                ))}
              </ul>
            </Disclosure>
          )}
          {info.notes && (
            <Disclosure summary="Notes & fine print">
              <p className="text-[13px] text-ink-2 leading-relaxed">{info.notes}</p>
            </Disclosure>
          )}
        </div>
      )}

      {(verifiedOn || host) && (
        <p
          className={clsx(
            "mt-3 pt-3 border-t border-line font-mono text-[11px] leading-5 flex flex-wrap items-center gap-x-2 gap-y-1",
            stale ? "text-danger" : "text-ink-3",
          )}
        >
          {stale ? <Clock3 className="w-3.5 h-3.5" aria-hidden="true" /> : <BadgeCheck className="w-3.5 h-3.5 text-ok" aria-hidden="true" />}
          {verifiedOn && <span>{stale ? `Last checked ${verifiedOn} · may be out of date` : `Verified on ${verifiedOn}`}</span>}
          {verifiedOn && host && <span aria-hidden="true">·</span>}
          {host && info.source && (
            <a
              href={info.source}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline decoration-line-strong underline-offset-2 hover:text-ink hover:decoration-ink-3 break-all"
            >
              {host}
              <ExternalLink className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
              <span className="sr-only">(source, opens in a new tab)</span>
            </a>
          )}
        </p>
      )}
    </Section>
  );
}
