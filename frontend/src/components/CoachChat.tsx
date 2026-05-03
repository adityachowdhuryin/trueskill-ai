"use client";

import { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, Loader2, ChevronUp, ChevronDown } from "lucide-react";

export interface ChatMessage {
    role: "user" | "assistant";
    content: string;
    timestamp: number;
}

interface Props {
    messages: ChatMessage[];
    isLoading: boolean;
    onSend: (message: string) => void;
    disabled: boolean;
}

const SUGGESTED_QUESTIONS = [
    "What should I focus on first?",
    "Can I finish this in 2 weeks?",
    "Best free resources for my top gap skill?",
];

function TypingDots() {
    return (
        <div style={{ display: "flex", gap: 4, alignItems: "center", padding: "10px 14px" }}>
            {[0, 1, 2].map(i => (
                <div
                    key={i}
                    style={{
                        width: 7, height: 7, borderRadius: "50%", background: "#7c3aed",
                        animation: "typingBounce 1.2s ease-in-out infinite",
                        animationDelay: `${i * 0.2}s`,
                    }}
                />
            ))}
        </div>
    );
}

export default function CoachChat({ messages, isLoading, onSend, disabled }: Props) {
    const [input, setInput] = useState("");
    const [expanded, setExpanded] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-expand on first message received
    useEffect(() => {
        if (messages.length > 0) setExpanded(true);
    }, [messages.length]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (expanded) {
            setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }
    }, [messages, isLoading, expanded]);

    const handleSend = () => {
        const msg = input.trim();
        if (!msg || isLoading || disabled) return;
        setInput("");
        onSend(msg);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    const formatTime = (ts: number) =>
        new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    return (
        <>
            <style>{`
                @keyframes typingBounce {
                    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
                    30% { transform: translateY(-6px); opacity: 1; }
                }
            `}</style>
            <div style={{ background: "white", borderRadius: 16, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,0.04)" }}>
                {/* Header */}
                <div
                    style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "14px 20px", cursor: disabled ? "default" : "pointer",
                        background: "rgba(99,102,241,0.03)",
                        borderBottom: expanded ? "1px solid #f1f5f9" : "none",
                        opacity: disabled ? 0.6 : 1,
                    }}
                    onClick={() => !disabled && setExpanded(e => !e)}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ padding: "6px", background: "rgba(99,102,241,0.1)", borderRadius: 8 }}>
                            <MessageSquare size={14} style={{ color: "#6366f1" }} />
                        </div>
                        <div>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>Ask your Coach</span>
                            {messages.length > 0 && (
                                <span style={{ marginLeft: 8, fontSize: 11, color: "#64748b" }}>{messages.length} message{messages.length > 1 ? "s" : ""}</span>
                            )}
                            {disabled && (
                                <span style={{ marginLeft: 8, fontSize: 11, color: "#94a3b8" }}>Generate an action plan first</span>
                            )}
                        </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {messages.length > 0 && (
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s infinite" }} />
                        )}
                        {expanded ? <ChevronUp size={16} style={{ color: "#94a3b8" }} /> : <ChevronDown size={16} style={{ color: "#94a3b8" }} />}
                    </div>
                </div>

                {expanded && !disabled && (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                        {/* Suggested questions (shown only when no messages yet) */}
                        {messages.length === 0 && !isLoading && (
                            <div style={{ padding: "14px 20px 0" }}>
                                <p style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Suggested</p>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                                    {SUGGESTED_QUESTIONS.map((q, i) => (
                                        <button
                                            key={i}
                                            onClick={() => onSend(q)}
                                            style={{
                                                padding: "6px 12px", background: "rgba(99,102,241,0.07)",
                                                border: "1px solid rgba(99,102,241,0.2)", borderRadius: 20,
                                                fontSize: 12, color: "#4338ca", fontWeight: 500, cursor: "pointer",
                                                transition: "all 0.15s",
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.background = "rgba(99,102,241,0.14)"; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = "rgba(99,102,241,0.07)"; }}
                                        >
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Message thread */}
                        <div style={{ maxHeight: 300, overflowY: "auto", padding: "14px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                            {messages.map((msg, i) => {
                                const isUser = msg.role === "user";
                                return (
                                    <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
                                        <div style={{
                                            maxWidth: "82%", padding: "10px 14px", borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                                            background: isUser ? "linear-gradient(135deg,#6366f1,#7c3aed)" : "white",
                                            color: isUser ? "white" : "#1e293b",
                                            border: isUser ? "none" : "1px solid #e2e8f0",
                                            fontSize: 13, lineHeight: 1.5,
                                            boxShadow: isUser ? "0 2px 8px rgba(99,102,241,0.25)" : "0 1px 4px rgba(0,0,0,0.05)",
                                        }}>
                                            {msg.content}
                                        </div>
                                        <span style={{ fontSize: 10, color: "#94a3b8", marginTop: 3 }}>{formatTime(msg.timestamp)}</span>
                                    </div>
                                );
                            })}
                            {isLoading && (
                                <div style={{ display: "flex", alignItems: "flex-start" }}>
                                    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "14px 14px 14px 4px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                                        <TypingDots />
                                    </div>
                                </div>
                            )}
                            <div ref={bottomRef} />
                        </div>

                        {/* Input bar */}
                        <div style={{ padding: "10px 16px 14px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 8 }}>
                            <input
                                ref={inputRef}
                                id="coach-chat-input"
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask anything about your gaps, timeline, or projects…"
                                disabled={isLoading}
                                style={{
                                    flex: 1, padding: "9px 14px", borderRadius: 10, fontSize: 13,
                                    border: "1px solid #e2e8f0", outline: "none", background: "#f8fafc",
                                    color: "#1e293b", transition: "border-color 0.15s",
                                }}
                                onFocus={e => { e.target.style.borderColor = "#6366f1"; e.target.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.12)"; }}
                                onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "none"; }}
                            />
                            <button
                                id="coach-chat-send-btn"
                                onClick={handleSend}
                                disabled={!input.trim() || isLoading}
                                style={{
                                    width: 38, height: 38, borderRadius: 10, border: "none", cursor: "pointer",
                                    background: input.trim() && !isLoading ? "linear-gradient(135deg,#6366f1,#7c3aed)" : "#e2e8f0",
                                    color: input.trim() && !isLoading ? "white" : "#94a3b8",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    transition: "all 0.15s", flexShrink: 0,
                                    boxShadow: input.trim() && !isLoading ? "0 2px 8px rgba(99,102,241,0.3)" : "none",
                                }}
                            >
                                {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
