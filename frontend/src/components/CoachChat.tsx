"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
    MessageSquare, Send, Loader2, ChevronUp, ChevronDown,
    Copy, Check, Zap, Brain, BookOpen, Target,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ChatMessage {
    role: "user" | "assistant";
    content: string;
    timestamp: number;
    streaming?: boolean; // true while being streamed
}

export interface ContextStatus {
    skills: boolean;
    bridge_projects: boolean;
    roadmap: boolean;
    ats: boolean;
}

interface Props {
    messages: ChatMessage[];
    isLoading: boolean;
    onSend: (message: string) => void;
    disabled: boolean;
    suggestions?: string[];
    contextStatus?: ContextStatus;
}

// ─── Markdown renderer (zero npm deps) ───────────────────────────────────────
function renderMarkdown(text: string): React.ReactNode {
    const lines = text.split("\n");
    const nodes: React.ReactNode[] = [];
    let listItems: string[] = [];
    let listType: "ul" | "ol" | null = null;

    const flushList = (key: string) => {
        if (!listItems.length) return;
        if (listType === "ol") {
            nodes.push(
                <ol key={key} style={{ paddingLeft: 18, margin: "6px 0", fontSize: 13, lineHeight: 1.7 }}>
                    {listItems.map((li, i) => <li key={i}>{renderInline(li)}</li>)}
                </ol>
            );
        } else {
            nodes.push(
                <ul key={key} style={{ paddingLeft: 18, margin: "6px 0", fontSize: 13, lineHeight: 1.7, listStyle: "disc" }}>
                    {listItems.map((li, i) => <li key={i}>{renderInline(li)}</li>)}
                </ul>
            );
        }
        listItems = [];
        listType = null;
    };

    lines.forEach((line, i) => {
        const olMatch = line.match(/^\d+\.\s+(.*)/);
        const ulMatch = line.match(/^[-*]\s+(.*)/);

        if (olMatch) {
            if (listType === "ul") flushList(`flush-${i}`);
            listType = "ol";
            listItems.push(olMatch[1]);
        } else if (ulMatch) {
            if (listType === "ol") flushList(`flush-${i}`);
            listType = "ul";
            listItems.push(ulMatch[1]);
        } else {
            flushList(`flush-${i}`);
            if (line.trim() === "") {
                nodes.push(<div key={i} style={{ height: 6 }} />);
            } else {
                nodes.push(<p key={i} style={{ margin: "3px 0", fontSize: 13, lineHeight: 1.6 }}>{renderInline(line)}</p>);
            }
        }
    });
    flushList("final");

    return <>{nodes}</>;
}

function renderInline(text: string): React.ReactNode {
    // Bold: **text**
    // Inline code: `code`
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return (
        <>
            {parts.map((part, i) => {
                if (part.startsWith("**") && part.endsWith("**")) {
                    return <strong key={i} style={{ fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
                }
                if (part.startsWith("`") && part.endsWith("`")) {
                    return (
                        <code key={i} style={{
                            fontFamily: "monospace", fontSize: 11, background: "rgba(99,102,241,0.1)",
                            color: "#4338ca", padding: "1px 5px", borderRadius: 4,
                        }}>{part.slice(1, -1)}</code>
                    );
                }
                return <span key={i}>{part}</span>;
            })}
        </>
    );
}

// ─── Typing dots ─────────────────────────────────────────────────────────────
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

// ─── Copy button ─────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* ignore */ }
    };
    return (
        <button
            onClick={handleCopy}
            title="Copy message"
            style={{
                background: "none", border: "none", cursor: "pointer",
                color: copied ? "#10b981" : "#94a3b8", padding: "2px 4px",
                borderRadius: 4, transition: "color 0.15s",
                display: "flex", alignItems: "center",
            }}
        >
            {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
    );
}

// ─── Context status pills ─────────────────────────────────────────────────────
function ContextPills({ status }: { status: ContextStatus }) {
    const pills = [
        { label: "Skills", active: status.skills, icon: <Brain size={10} /> },
        { label: "Projects", active: status.bridge_projects, icon: <Target size={10} /> },
        { label: "Roadmap", active: status.roadmap, icon: <BookOpen size={10} /> },
        { label: "ATS", active: status.ats, icon: <Zap size={10} /> },
    ];
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 16px 0", flexWrap: "wrap" }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 2 }}>
                AI has:
            </span>
            {pills.map(p => (
                <span
                    key={p.label}
                    style={{
                        display: "inline-flex", alignItems: "center", gap: 3,
                        padding: "2px 7px", borderRadius: 20, fontSize: 10, fontWeight: 600,
                        background: p.active ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.08)",
                        color: p.active ? "#059669" : "#dc2626",
                        border: `1px solid ${p.active ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.2)"}`,
                    }}
                >
                    {p.icon} {p.label}
                </span>
            ))}
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────
const DEFAULT_SUGGESTIONS = [
    "What should I focus on first?",
    "Can I finish this in 2 weeks?",
    "Best free resources for my top gap skill?",
];

export default function CoachChat({
    messages, isLoading, onSend, disabled,
    suggestions = DEFAULT_SUGGESTIONS,
    contextStatus,
}: Props) {
    const [input, setInput] = useState("");
    const [expanded, setExpanded] = useState(false);
    const [hoveredMsg, setHoveredMsg] = useState<number | null>(null);
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

    const handleSend = useCallback((msg?: string) => {
        const text = (msg ?? input).trim();
        if (!text || isLoading || disabled) return;
        setInput("");
        onSend(text);
    }, [input, isLoading, disabled, onSend]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    const formatTime = (ts: number) =>
        new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // Last assistant message preview for collapsed state
    const lastAiMsg = [...messages].reverse().find(m => m.role === "assistant");
    const collapsedPreview = lastAiMsg
        ? lastAiMsg.content.replace(/\*\*/g, "").slice(0, 80) + (lastAiMsg.content.length > 80 ? "…" : "")
        : null;

    return (
        <>
            <style>{`
                @keyframes typingBounce {
                    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
                    30% { transform: translateY(-6px); opacity: 1; }
                }
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(6px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                @keyframes streamCursor {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0; }
                }
                .coach-msg-enter { animation: fadeInUp 0.2s ease; }
                .stream-cursor::after {
                    content: "▋";
                    display: inline;
                    animation: streamCursor 0.8s infinite;
                    color: #7c3aed;
                    font-size: 12px;
                    margin-left: 1px;
                }
            `}</style>

            <div style={{
                background: "white", borderRadius: 16,
                border: "1px solid #e2e8f0", overflow: "hidden",
                boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
            }}>
                {/* Header */}
                <div
                    style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "14px 20px",
                        cursor: disabled ? "default" : "pointer",
                        background: expanded
                            ? "linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(124,58,237,0.04) 100%)"
                            : "rgba(99,102,241,0.03)",
                        borderBottom: expanded ? "1px solid #f1f5f9" : "none",
                        opacity: disabled ? 0.55 : 1,
                        transition: "background 0.2s",
                    }}
                    onClick={() => !disabled && setExpanded(e => !e)}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                        <div style={{
                            padding: "7px", background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(124,58,237,0.12))",
                            borderRadius: 10, flexShrink: 0,
                        }}>
                            <MessageSquare size={14} style={{ color: "#6366f1" }} />
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>Ask Alex</span>
                                <span style={{ fontSize: 10, fontWeight: 600, color: "#7c3aed", background: "rgba(124,58,237,0.08)", padding: "1px 7px", borderRadius: 20 }}>AI Coach</span>
                                {messages.length > 0 && (
                                    <span style={{ fontSize: 11, color: "#64748b" }}>{messages.length} message{messages.length > 1 ? "s" : ""}</span>
                                )}
                            </div>
                            {/* Preview of last AI message when collapsed */}
                            {!expanded && collapsedPreview && (
                                <p style={{ fontSize: 11, color: "#64748b", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {collapsedPreview}
                                </p>
                            )}
                            {disabled && (
                                <span style={{ fontSize: 11, color: "#94a3b8" }}>Run an analysis to enable coaching</span>
                            )}
                        </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        {messages.length > 0 && (
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 0 2px rgba(34,197,94,0.2)" }} />
                        )}
                        {expanded ? <ChevronUp size={16} style={{ color: "#94a3b8" }} /> : <ChevronDown size={16} style={{ color: "#94a3b8" }} />}
                    </div>
                </div>

                {expanded && !disabled && (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                        {/* Context status pills */}
                        {contextStatus && (
                            <ContextPills status={contextStatus} />
                        )}

                        {/* Suggested questions — shown when no messages, or as follow-ups after each AI reply */}
                        {suggestions.length > 0 && !isLoading && (
                            <div style={{ padding: contextStatus ? "8px 16px 0" : "14px 20px 0" }}>
                                <p style={{ fontSize: 10, color: "#94a3b8", marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                    {messages.length === 0 ? "Try asking" : "Follow-up"}
                                </p>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                    {suggestions.map((q, i) => (
                                        <button
                                            key={i}
                                            onClick={() => handleSend(q)}
                                            style={{
                                                padding: "5px 11px",
                                                background: "rgba(99,102,241,0.06)",
                                                border: "1px solid rgba(99,102,241,0.18)",
                                                borderRadius: 20,
                                                fontSize: 11, color: "#4338ca", fontWeight: 500, cursor: "pointer",
                                                transition: "all 0.15s",
                                                lineHeight: 1.4,
                                            }}
                                            onMouseEnter={e => {
                                                e.currentTarget.style.background = "rgba(99,102,241,0.13)";
                                                e.currentTarget.style.borderColor = "rgba(99,102,241,0.35)";
                                            }}
                                            onMouseLeave={e => {
                                                e.currentTarget.style.background = "rgba(99,102,241,0.06)";
                                                e.currentTarget.style.borderColor = "rgba(99,102,241,0.18)";
                                            }}
                                        >
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Message thread */}
                        <div style={{
                            maxHeight: 420, overflowY: "auto",
                            padding: "14px 20px",
                            display: "flex", flexDirection: "column", gap: 12,
                        }}>
                            {messages.map((msg, i) => {
                                const isUser = msg.role === "user";
                                const isHovered = hoveredMsg === i;
                                return (
                                    <div
                                        key={i}
                                        className="coach-msg-enter"
                                        style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}
                                        onMouseEnter={() => setHoveredMsg(i)}
                                        onMouseLeave={() => setHoveredMsg(null)}
                                    >
                                        {/* Avatar label */}
                                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                                            {!isUser && (
                                                <span style={{ fontSize: 10, fontWeight: 700, color: "#7c3aed" }}>Alex</span>
                                            )}
                                            <span style={{ fontSize: 10, color: "#94a3b8" }}>{formatTime(msg.timestamp)}</span>
                                            {!isUser && isHovered && <CopyButton text={msg.content} />}
                                        </div>

                                        {/* Bubble */}
                                        <div style={{
                                            maxWidth: "85%",
                                            padding: isUser ? "10px 14px" : "12px 16px",
                                            borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                                            background: isUser
                                                ? "linear-gradient(135deg, #6366f1, #7c3aed)"
                                                : "#f8fafc",
                                            color: isUser ? "white" : "#1e293b",
                                            border: isUser ? "none" : "1px solid #e2e8f0",
                                            boxShadow: isUser
                                                ? "0 3px 12px rgba(99,102,241,0.28)"
                                                : "0 1px 4px rgba(0,0,0,0.05)",
                                            transition: "box-shadow 0.15s",
                                        }}>
                                            {isUser
                                                ? <span style={{ fontSize: 13, lineHeight: 1.5 }}>{msg.content}</span>
                                                : <div className={msg.streaming ? "stream-cursor" : ""}>{renderMarkdown(msg.content)}</div>
                                            }
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Typing indicator */}
                            {isLoading && !messages.some(m => m.streaming) && (
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: "#7c3aed", marginBottom: 3 }}>Alex</span>
                                    <div style={{
                                        background: "#f8fafc", border: "1px solid #e2e8f0",
                                        borderRadius: "16px 16px 16px 4px",
                                        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                                    }}>
                                        <TypingDots />
                                    </div>
                                </div>
                            )}
                            <div ref={bottomRef} />
                        </div>

                        {/* Input bar */}
                        <div style={{
                            padding: "10px 16px 14px",
                            borderTop: "1px solid #f1f5f9",
                            display: "flex", gap: 8, alignItems: "center",
                            background: "rgba(248,250,252,0.6)",
                        }}>
                            <input
                                ref={inputRef}
                                id="coach-chat-input"
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask Alex anything about your gaps, timeline, or projects…"
                                disabled={isLoading}
                                style={{
                                    flex: 1, padding: "10px 14px", borderRadius: 12, fontSize: 13,
                                    border: "1.5px solid #e2e8f0", outline: "none",
                                    background: "white", color: "#1e293b",
                                    transition: "border-color 0.15s, box-shadow 0.15s",
                                }}
                                onFocus={e => {
                                    e.target.style.borderColor = "#6366f1";
                                    e.target.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.12)";
                                }}
                                onBlur={e => {
                                    e.target.style.borderColor = "#e2e8f0";
                                    e.target.style.boxShadow = "none";
                                }}
                            />
                            <button
                                id="coach-chat-send-btn"
                                onClick={() => handleSend()}
                                disabled={!input.trim() || isLoading}
                                style={{
                                    width: 40, height: 40, borderRadius: 12, border: "none",
                                    cursor: input.trim() && !isLoading ? "pointer" : "default",
                                    background: input.trim() && !isLoading
                                        ? "linear-gradient(135deg, #6366f1, #7c3aed)"
                                        : "#e2e8f0",
                                    color: input.trim() && !isLoading ? "white" : "#94a3b8",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    transition: "all 0.15s", flexShrink: 0,
                                    boxShadow: input.trim() && !isLoading
                                        ? "0 3px 10px rgba(99,102,241,0.35)"
                                        : "none",
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
