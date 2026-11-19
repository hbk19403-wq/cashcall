"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";

interface Message { role: "user" | "assistant"; content: string; }

const SUGGESTED = [
  "How are we doing this week?",
  "What's our prime cost?",
  "Which location is performing best?",
  "Show me today's sales",
];

export default function ChatWidget() {
  const pathname = usePathname();
  // Don't render on public Clover pages — these are shown inside Clover's
  // own embedded WebView and the floating chat button would overlap badly.
  if (pathname?.startsWith("/clover")) return null;
  const [open, setOpen]     = useState(false);
  const [msgs, setMsgs]     = useState<Message[]>([]);
  const [input, setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80);
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [open, msgs]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setError("");
    const userMsg: Message = { role: "user", content: trimmed };
    const updated = [...msgs, userMsg];
    setMsgs(updated);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updated }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMsgs(prev => [...prev, { role: "assistant", content: data.content }]);
    } catch (e) {
      setError("Couldn't reach the AI. Try again.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [msgs, loading]);

  return (
    <>
      {/* ── Floating button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Open AI assistant"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
        style={{
          background: open
            ? "linear-gradient(135deg,#00b896,#00d4a8)"
            : "linear-gradient(135deg,#00b896,#007a5e)",
          boxShadow: "0 0 24px rgba(0,184,150,0.4)",
        }}
      >
        {open ? (
          <svg width="20" height="20" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <line x1="4" y1="4" x2="16" y2="16"/><line x1="16" y1="4" x2="4" y2="16"/>
          </svg>
        ) : (
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
              stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="8" cy="10" r="1" fill="white"/>
            <circle cx="12" cy="10" r="1" fill="white"/>
            <circle cx="16" cy="10" r="1" fill="white"/>
          </svg>
        )}
      </button>

      {/* ── Chat panel ── */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 flex flex-col rounded-2xl overflow-hidden shadow-2xl"
          style={{
            width: "min(420px, calc(100vw - 24px))",
            height: "min(560px, calc(100vh - 140px))",
            background: "#0a1628",
            border: "1px solid rgba(0,184,150,0.25)",
            boxShadow: "0 25px 60px rgba(0,0,0,0.6), 0 0 40px rgba(0,184,150,0.12)",
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.07]"
            style={{ background: "linear-gradient(135deg,#003d30,#005c47)" }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold"
              style={{ background: "rgba(0,212,168,0.2)", color: "#00d4a8" }}>AI</div>
            <div>
              <p className="text-sm font-bold text-white">CashCall AI</p>
              <p className="text-[11px] text-emerald-300/60">Ask about sales, costs, trends</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] text-emerald-400 font-semibold">Live data</span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ scrollbarWidth: "thin" }}>
            {msgs.length === 0 && (
              <div className="pt-2">
                <p className="text-sm text-gray-400 mb-4">
                  Hi! I have access to your real-time sales, food cost, labor, and payroll data across all your locations. Ask me anything.
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {SUGGESTED.map(s => (
                    <button key={s} onClick={() => send(s)}
                      className="text-left text-xs px-3 py-2.5 rounded-xl border border-white/10 text-gray-300 hover:border-emerald-500/40 hover:text-white hover:bg-white/[0.04] transition-all">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <div className="w-6 h-6 rounded-lg mr-2 flex-shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5"
                    style={{ background: "rgba(0,212,168,0.15)", color: "#00d4a8" }}>AI</div>
                )}
                <div
                  className={`rounded-2xl px-3.5 py-2.5 max-w-[80%] text-sm leading-relaxed ${
                    m.role === "user"
                      ? "text-white rounded-br-md"
                      : "text-gray-200 rounded-bl-md"
                  }`}
                  style={m.role === "user"
                    ? { background: "linear-gradient(135deg,#00b896,#007a5e)" }
                    : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }
                  }
                >
                  {m.content.split("\n").map((line, j) => (
                    <span key={j}>{line}{j < m.content.split("\n").length - 1 && <br/>}</span>
                  ))}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="w-6 h-6 rounded-lg mr-2 flex-shrink-0 flex items-center justify-center text-[10px] font-bold"
                  style={{ background: "rgba(0,212,168,0.15)", color: "#00d4a8" }}>AI</div>
                <div className="rounded-2xl rounded-bl-md px-4 py-3" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="flex gap-1.5 items-center h-4">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {error && (
              <p className="text-xs text-red-400 text-center py-1">{error}</p>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 pb-3 pt-2 border-t border-white/[0.07]">
            <form onSubmit={e => { e.preventDefault(); send(input); }}
              className="flex gap-2 items-center rounded-xl border border-white/10 px-3 py-2"
              style={{ background: "rgba(255,255,255,0.04)" }}>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask about your restaurants…"
                className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
                disabled={loading}
              />
              <button type="submit" disabled={loading || !input.trim()}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
                style={{ background: input.trim() ? "linear-gradient(135deg,#00b896,#007a5e)" : "rgba(255,255,255,0.06)" }}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
                    stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </form>
            <p className="text-[10px] text-gray-600 text-center mt-1.5">Powered by CashCall AI · Real-time data</p>
          </div>
        </div>
      )}
    </>
  );
}
