"use client";

import { AlertTriangle, Keyboard, Mic, RotateCcw } from "lucide-react";
import clsx from "clsx";
import { BackendState } from "@/lib/types";
import { HeroOrb } from "./HeroOrb";

export const DESTINATIONS = [
  { code: "FR", name: "France" },
  { code: "JP", name: "Japan" },
  { code: "IT", name: "Italy" },
  { code: "AE", name: "Dubai" },
  { code: "US", name: "USA", phrase: "the USA" },
  { code: "GB", name: "UK", phrase: "the UK" },
  { code: "TH", name: "Thailand" },
  { code: "AU", name: "Australia" },
] as const;

export type Destination = (typeof DESTINATIONS)[number];

const STEPS = [
  {
    n: "01",
    title: "Talk, naturally",
    body: "Speak or type. Live voice is real-time and interruptible, with a lighter voice mode and plain text as fallbacks.",
  },
  {
    n: "02",
    title: "Your profile builds live",
    body: "Destination, passport, dates and travellers are pulled out of the conversation and appear on screen as they're captured.",
  },
  {
    n: "03",
    title: "Verified facts, or a human",
    body: "Visa answers come from a sourced, dated knowledge base. When Aria isn't sure, or you ask, she hands off to a specialist with a brief.",
  },
];

interface Props {
  backend: BackendState;
  retryHealth: () => void;
  isStarting: boolean;
  leaving: boolean;
  onStart: (withVoice: boolean) => void;
  onDestination: (d: Destination) => void;
}

export function Landing({ backend, retryHealth, isStarting, leaving, onStart, onDestination }: Props) {
  const ready = backend === "ready";
  const disabled = isStarting || !ready;

  return (
    <main id="main" className={clsx("flex-1 flex flex-col", leaving && "landing-leave")}>
      <section className="max-w-[1240px] w-full mx-auto px-5 sm:px-8 pt-8 sm:pt-14 lg:pt-16 pb-12 lg:pb-16 grid lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px] gap-6 sm:gap-10 lg:gap-12 items-center">
        <div className="order-2 lg:order-1 text-center lg:text-left">
          <h1 className="rise font-serif text-ink text-[clamp(34px,10.6vw,42px)] leading-[1.04] sm:text-[60px] lg:text-[64px] xl:text-[70px] lg:leading-[1.0] tracking-[-0.018em]">
            Say where you&apos;re going.{" "}
            <span className="block text-ink-2">
              <em className="text-accent">Aria</em> handles the visa questions.
            </span>
          </h1>
          <p className="rise mt-5 sm:mt-6 text-[17px] sm:text-[18px] leading-relaxed text-ink-2 max-w-[33rem] mx-auto lg:mx-0" style={{ animationDelay: "80ms" }}>
            A voice concierge that answers from a verified, dated visa knowledge base and builds your travel profile while you talk.
          </p>

          <div className="rise mt-8 sm:mt-9 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start" style={{ animationDelay: "160ms" }}>
            <button
              type="button"
              onClick={() => onStart(true)}
              disabled={disabled}
              aria-busy={isStarting}
              className="btn btn-primary sm:min-w-[200px] !min-h-[52px]"
            >
              <Mic className="w-[18px] h-[18px]" aria-hidden="true" />
              {isStarting ? "Starting…" : "Talk to Aria"}
            </button>
            <button
              type="button"
              onClick={() => onStart(false)}
              disabled={disabled}
              aria-busy={isStarting}
              className="btn btn-secondary sm:min-w-[170px] !min-h-[52px]"
            >
              <Keyboard className="w-[18px] h-[18px]" aria-hidden="true" />
              Type instead
            </button>
          </div>

          {/* Cold-start status: the free server sleeps when idle */}
          <div
            className="mt-4 min-h-11 flex items-center justify-center lg:justify-start"
            role="status"
            aria-live="polite"
            data-testid="backend-status"
          >
            {backend === "waking" && (
              <div className="flex flex-col items-center lg:items-start gap-2.5">
                <span className="indeterminate block w-44 h-px bg-line-strong rounded-full" aria-hidden="true" />
                <p className="text-[13px] text-ink-2 leading-snug">
                  Waking Aria up… <span className="text-ink-3">free server, ~30–50 s the first time.</span>
                </p>
              </div>
            )}
            {backend === "down" && (
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-3 gap-y-1 text-[13px]">
                <span className="inline-flex items-center gap-1.5 text-danger">
                  <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                  Couldn&apos;t wake Aria&apos;s server.
                </span>
                <button type="button" onClick={() => void retryHealth()} className="btn btn-ghost !min-h-11 !px-3 !text-ink">
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                  Retry
                </button>
              </div>
            )}
            {backend === "ready" && (
              <p className="text-[13px] text-ink-3">No sign-up. Voice asks for your mic; typing doesn&apos;t.</p>
            )}
          </div>

          <div className="mt-8 sm:mt-10">
            <h2 className="label mb-3">Or start with a destination</h2>
            <ul className="flex flex-wrap gap-2 justify-center sm:grid sm:grid-cols-4 sm:max-w-[520px] sm:mx-auto lg:mx-0">
              {DESTINATIONS.map((d) => (
                <li key={d.name}>
                  <button
                    type="button"
                    onClick={() => onDestination(d)}
                    disabled={disabled}
                    className="group inline-flex sm:flex sm:w-full items-center gap-2 h-11 pl-3 pr-3.5 rounded-lg border border-line-strong text-[14px] text-ink-2 transition-colors hover:text-ink hover:border-accent-line hover:bg-accent-soft disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    <span className="font-mono text-[11px] text-ink-3 group-hover:text-accent transition-colors" aria-hidden="true">
                      {d.code}
                    </span>
                    {d.name}
                    <span className="sr-only">: start a chat about this trip</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="order-1 lg:order-2 flex justify-center">
          <HeroOrb backend={backend} />
        </div>
      </section>

      <section aria-labelledby="how-title" className="max-w-[1240px] w-full mx-auto px-5 sm:px-8 pb-14 sm:pb-20">
        <div className="border-t border-line pt-8 sm:pt-10">
          <h2 id="how-title" className="label mb-6 sm:mb-8">How it works</h2>
          <ol className="grid gap-8 sm:grid-cols-3 sm:gap-10">
            {STEPS.map((s) => (
              <li key={s.n}>
                <p className="font-mono text-[12px] text-accent" aria-hidden="true">{s.n}</p>
                <h3 className="mt-2 text-[17px] font-semibold text-ink tracking-[-0.005em]">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-2 max-w-[22rem]">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  );
}
