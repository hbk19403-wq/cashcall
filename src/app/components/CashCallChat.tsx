"use client";
import { useState, useRef, useEffect } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Message {
  role: "user" | "assistant";
  content: string;
}

// ── CashCall AI Chat Widget ───────────────────────────────────────────────────
export default function CashCallChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm CashCall's AI assistant. I can help you understand how CashCall works, answer questions about pricing, features, or getting started. What would you like to know?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showBadge, setShowBadge] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [messages, open]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setShowBadge(false);
    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });
      if (!res.ok) throw new Error("Failed to get response");
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.content }]);
    } catch {
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content:
            "I'm having a moment — could you try again? Or email us at hello@cashcall.io and we'll get back to you right away.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const quickQuestions = [
    "How does prime cost tracking work?",
    "What does $79/month include?",
    "How do I set it up?",
    "Does it work with Toast / Clover?",
  ];

  return (
    <>
      {/* ── Chat window ─────────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed bottom-24 right-5 z-50 flex flex-col rounded-3xl overflow-hidden"
          style={{
            width: 360,
            height: 520,
            background: "#0A1628",
            border: "1px solid rgba(0,184,150,0.30)",
            boxShadow: "0 30px 80px rgba(0,0,0,0.60), 0 0 0 1px rgba(255,255,255,0.04)",
          }}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4"
            style={{ background: "rgba(0,184,150,0.08)", borderBottom: "1px solid rgba(0,184,150,0.18)" }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg,#00b896,#007a5e)", boxShadow: "0 0 12px rgba(0,184,150,0.35)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-black text-white leading-tight">CashCall AI</p>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#00b896" }}/>
                  <span className="text-[10px]" style={{ color: "#00b896" }}>Online · Usually replies instantly</span>
                </div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white transition-colors p-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ scrollbarWidth: "none" }}>
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center mr-2 flex-shrink-0 mt-0.5"
                    style={{ background: "rgba(0,184,150,0.18)", flexShrink: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="#00b896" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
                <div
                  className="rounded-2xl px-4 py-3 max-w-[240px] text-sm leading-relaxed"
                  style={
                    msg.role === "user"
                      ? { background: "linear-gradient(135deg,#00b896,#007a5e)", color: "white", borderBottomRightRadius: 6 }
                      : { background: "rgba(255,255,255,0.06)", color: "#e2e8f0", borderBottomLeftRadius: 6 }
                  }>
                  {(msg.content ?? "").split("\n").map((line, j, arr) => (
                    <span key={j}>{line}{j < arr.length - 1 && <br/>}</span>
                  ))}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center mr-2 flex-shrink-0"
                  style={{ background: "rgba(0,184,150,0.18)" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="#00b896" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="rounded-2xl px-4 py-3 flex items-center gap-1.5"
                  style={{ background: "rgba(255,255,255,0.06)", borderBottomLeftRadius: 6 }}>
                  {[0,1,2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{ background: "#00b896", animationDelay: `${i * 150}ms` }}/>
                  ))}
                </div>
              </div>
            )}
            {/* Quick questions — only when still on first message */}
            {messages.length === 1 && !loading && (
              <div className="flex flex-col gap-2 pt-2">
                <p className="text-[10px] text-gray-600 px-1">Quick questions:</p>
                {quickQuestions.map(q => (
                  <button key={q}
                    className="text-left text-xs rounded-xl px-3 py-2 transition-all hover:border-teal-500"
                    style={{ background: "rgba(0,184,150,0.06)", border: "1px solid rgba(0,184,150,0.20)", color: "#94a3b8" }}
                    onMouseDown={e => {
                      e.preventDefault();
                      if (loading) return;
                      setShowBadge(false);
                      const newMsgs: Message[] = [...messages, { role: "user", content: q }];
                      setMessages(newMsgs);
                      setLoading(true);
                      fetch("/api/chat", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ messages: newMsgs }),
                      })
                        .then(r => r.json())
                        .then(d => setMessages(prev => [...prev, { role: "assistant", content: d.content ?? "I couldn't get a response. Please try again." }]))
                        .catch(() => setMessages(prev => [...prev, { role: "assistant", content: "I'm having a moment — try again or email hello@cashcall.io" }]))
                        .finally(() => setLoading(false));
                    }}
                    onClick={e => {
                      // Fallback for keyboard activation (mouseDown already handles mouse clicks)
                      if (e.detail === 0 && !loading) {
                        setShowBadge(false);
                        const newMsgs: Message[] = [...messages, { role: "user", content: q }];
                        setMessages(newMsgs);
                        setLoading(true);
                        fetch("/api/chat", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ messages: newMsgs }),
                        })
                          .then(r => r.json())
                          .then(d => setMessages(prev => [...prev, { role: "assistant", content: d.content ?? "I couldn't get a response. Please try again." }]))
                          .catch(() => setMessages(prev => [...prev, { role: "assistant", content: "I'm having a moment — try again or email hello@cashcall.io" }]))
                          .finally(() => setLoading(false));
                      }
                    }}>
                    {q}
                  </button>
                ))}
              </div>
            )}
            <div ref={messagesEndRef}/>
          </div>

          {/* Input */}
          <div className="px-4 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-2 rounded-2xl px-4 py-2.5"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask anything about CashCall..."
                className="flex-1 bg-transparent text-sm text-white outline-none placeholder-gray-600"
                disabled={loading}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all"
                style={{
                  background: input.trim() && !loading ? "linear-gradient(135deg,#00b896,#007a5e)" : "rgba(255,255,255,0.06)",
                  opacity: input.trim() && !loading ? 1 : 0.5,
                }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            <p className="text-center text-[10px] text-gray-700 mt-2">Powered by CashCall AI · <a href="mailto:hello@cashcall.io" className="hover:text-gray-500">hello@cashcall.io</a></p>
          </div>
        </div>
      )}

      {/* ── FAB button ──────────────────────────────────────────────────── */}
      <button
        onClick={() => { setOpen(o => !o); setShowBadge(false); }}
        className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-2xl flex items-center justify-center transition-all hover:scale-110"
        style={{
          background: open ? "#0a1628" : "linear-gradient(135deg,#00b896,#007a5e)",
          border: open ? "1px solid rgba(0,184,150,0.4)" : "none",
          boxShadow: "0 8px 32px rgba(0,184,150,0.40)",
        }}
        aria-label="Open CashCall AI chat">
        {/* Notification badge */}
        {showBadge && !open && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white"
            style={{ background: "#ef4444", boxShadow: "0 0 8px rgba(239,68,68,0.5)" }}>1</span>
        )}
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>
    </>
  );
}
