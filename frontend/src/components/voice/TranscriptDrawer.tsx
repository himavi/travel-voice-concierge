"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, X } from "lucide-react";
import { TranscriptMessage } from "@/lib/types";
import { Message } from "./Message";

interface Props {
  messages: TranscriptMessage[];
  onClose: () => void;
  showInput: boolean;
  textInput: string;
  onTextInputChange: (v: string) => void;
  onSend: () => void;
}

export function TranscriptDrawer({ messages, onClose, showInput, textInput, onTextInputChange, onSend }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleCopy = async () => {
    const text = messages
      .map(m => `[${new Date(m.timestamp).toLocaleTimeString()}] ${m.role === "user" ? "You" : "Aria"}: ${m.text}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard API unavailable — fail silently, nothing else to fall back to
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="flex-1 overflow-hidden flex flex-col"
    >
      <div className="flex items-center justify-between px-4 py-2 border-b flex-shrink-0" style={{ borderColor: "var(--border)" }}>
        <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--ink-dim)" }}>
          Transcript
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            disabled={messages.length === 0}
            aria-label="Copy transcript"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors disabled:opacity-30"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--ink-dim)" }}
          >
            {copied ? <Check className="w-3 h-3" style={{ color: "#3FCFA0" }} aria-hidden="true" /> : <Copy className="w-3 h-3" aria-hidden="true" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={onClose}
            aria-label="Close transcript"
            className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:text-[color:var(--ink)]"
            style={{ color: "var(--ink-dim)" }}
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain p-4" role="log" aria-live="polite" aria-label="Conversation transcript">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-center" style={{ color: "var(--ink-faint)" }}>
              Start the conversation to see the transcript here.
            </p>
          </div>
        ) : (
          <div className="space-y-3 pr-1">
            {messages.map((msg, i) => (
              <Message key={`${msg.timestamp}-${i}`} message={msg} showTimestamp />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {showInput && (
        <div className="p-3 border-t flex gap-2 flex-shrink-0" style={{ borderColor: "var(--border)" }}>
          <label htmlFor="transcript-chat-input" className="sr-only">Type a message</label>
          <input
            id="transcript-chat-input"
            type="text"
            value={textInput}
            onChange={e => onTextInputChange(e.target.value)}
            onKeyDown={e => e.key === "Enter" && onSend()}
            placeholder="Type a message..."
            className="flex-1 rounded-xl px-3 py-2 text-sm focus:outline-none"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--ink)" }}
          />
          <button
            onClick={onSend}
            disabled={!textInput.trim()}
            aria-label="Send message"
            className="w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-30 flex-shrink-0 active:scale-95 transition-transform"
            style={{ background: "linear-gradient(135deg, #FF6B4A, #F5A623)" }}
          >
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
            </svg>
          </button>
        </div>
      )}
    </motion.div>
  );
}
