"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
    MessageSquare, Send, Loader2, X, ChevronDown,
    Copy, Check, Zap, Brain, BookOpen, Target, Network, Minimize2,
    Maximize2, Mic, MicOff, ThumbsUp, ThumbsDown, Trash2, Download,
    Search, ArrowDown, Play,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ChatMessage {
    role: "user" | "assistant";
    content: string;
    timestamp: number;
    streaming?: boolean;
    isProactive?: boolean;
    reaction?: "up" | "down" | null;
    actionPrompt?: { label: string; description: string; action: string };
}

export interface ContextStatus {
    skills: boolean;
    ats: boolean;
    projects: boolean;
    graph: boolean;
    roadmap: boolean;
}

export type ChatAction =
    | { type: "switchTab"; tab: string }
    | { type: "highlightNodes"; nodeIds: string[] }
    | { type: "startMockInterview" }
    | { type: "tailorResume" }
    | { type: "showSalary" }
    | { type: "generateApplicationKit" }
    | { type: "runAtsScore" };

interface Props {
    messages: ChatMessage[];
    isLoading: boolean;
    onSend: (message: string) => void;
    suggestions?: string[];
    contextStatus?: ContextStatus;
    onAction?: (actions: ChatAction[]) => void;
    onClear?: () => void;
    onReaction?: (msgIndex: number, reaction: "up" | "down") => void;
    apiBase?: string;
    candidateName?: string;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    disabled?: boolean;
}

// ─── Markdown renderer ────────────────────────────────────────────────────────
function renderInline(text: string): React.ReactNode {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return (
        <>
            {parts.map((part, i) => {
                if (part.startsWith("**") && part.endsWith("**"))
                    return <strong key={i} style={{ fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
                if (part.startsWith("`") && part.endsWith("`"))
                    return <code key={i} style={{ fontFamily: "monospace", fontSize: 11, background: "rgba(99,102,241,0.12)", color: "#4338ca", padding: "1px 5px", borderRadius: 4 }}>{part.slice(1, -1)}</code>;
                return <span key={i}>{part}</span>;
            })}
        </>
    );
}

function renderMarkdown(text: string): React.ReactNode {
    const lines = text.split("\n");
    const nodes: React.ReactNode[] = [];
    let listItems: string[] = [];
    let listType: "ul" | "ol" | null = null;

    const flushList = (key: string) => {
        if (!listItems.length) return;
        if (listType === "ol") {
            nodes.push(<ol key={key} style={{ paddingLeft: 18, margin: "4px 0", fontSize: 13, lineHeight: 1.7 }}>{listItems.map((li, i) => <li key={i}>{renderInline(li)}</li>)}</ol>);
        } else {
            nodes.push(<ul key={key} style={{ paddingLeft: 18, margin: "4px 0", fontSize: 13, lineHeight: 1.7, listStyle: "disc" }}>{listItems.map((li, i) => <li key={i}>{renderInline(li)}</li>)}</ul>);
        }
        listItems = []; listType = null;
    };

    lines.forEach((line, i) => {
        const ol = line.match(/^\d+\.\s+(.*)/);
        const ul = line.match(/^[-*]\s+(.*)/);
        if (ol) { if (listType === "ul") flushList(`f${i}`); listType = "ol"; listItems.push(ol[1]); }
        else if (ul) { if (listType === "ol") flushList(`f${i}`); listType = "ul"; listItems.push(ul[1]); }
        else {
            flushList(`f${i}`);
            if (line.trim() === "") nodes.push(<div key={i} style={{ height: 5 }} />);
            else nodes.push(<p key={i} style={{ margin: "2px 0", fontSize: 13, lineHeight: 1.6 }}>{renderInline(line)}</p>);
        }
    });
    flushList("final");
    return <>{nodes}</>;
}

// ─── Copy Button ──────────────────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button onClick={async () => { await navigator.clipboard.writeText(text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: copied ? "#10b981" : "#94a3b8", padding: "2px 4px", borderRadius: 4, display: "flex", alignItems: "center" }}>
            {copied ? <Check size={11} /> : <Copy size={11} />}
        </button>
    );
}

// ─── Context Pills ────────────────────────────────────────────────────────────
function ContextPills({ status }: { status: ContextStatus }) {
    const pills = [
        { label: "Skills", active: status.skills, icon: <Brain size={9} /> },
        { label: "ATS", active: status.ats, icon: <Zap size={9} /> },
        { label: "Projects", active: status.projects, icon: <Target size={9} /> },
        { label: "Graph", active: status.graph, icon: <Network size={9} /> },
        { label: "Roadmap", active: status.roadmap, icon: <BookOpen size={9} /> },
    ];
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 16px", flexWrap: "wrap", borderBottom: "1px solid #f1f5f9" }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 2 }}>Alex has:</span>
            {pills.map(p => (
                <span key={p.label} style={{
                    display: "inline-flex", alignItems: "center", gap: 3,
                    padding: "2px 6px", borderRadius: 20, fontSize: 9, fontWeight: 600,
                    background: p.active ? "rgba(16,185,129,0.1)" : "rgba(148,163,184,0.08)",
                    color: p.active ? "#059669" : "#94a3b8",
                    border: `1px solid ${p.active ? "rgba(16,185,129,0.25)" : "rgba(148,163,184,0.15)"}`,
                }}>{p.icon} {p.label}</span>
            ))}
        </div>
    );
}

// ─── Typing Dots ──────────────────────────────────────────────────────────────
function TypingDots() {
    return (
        <div style={{ display: "flex", gap: 4, alignItems: "center", padding: "10px 14px" }}>
            {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#7c3aed", animation: "tsBounce 1.2s ease-in-out infinite", animationDelay: `${i * 0.2}s` }} />
            ))}
        </div>
    );
}

// ─── Action Prompt Card ───────────────────────────────────────────────────────
function ActionPromptCard({ ap, onAction }: {
    ap: { label: string; description: string; action: string };
    onAction?: (actions: ChatAction[]) => void;
}) {
    return (
        <div style={{ marginTop: 8, padding: "10px 14px", borderRadius: 12, background: "linear-gradient(135deg,rgba(99,102,241,0.07),rgba(124,58,237,0.05))", border: "1px solid rgba(99,102,241,0.22)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#4338ca", marginBottom: 3 }}>{ap.label}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>{ap.description}</div>
            <button
                onClick={() => onAction?.([{ type: ap.action as ChatAction["type"] }] as ChatAction[])}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#6366f1,#7c3aed)", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
                <Play size={11} /> Start Now
            </button>
        </div>
    );
}

// ─── Capability Data ──────────────────────────────────────────────────────────
const CAPABILITIES = [
    {
        emoji: "🔬", label: "Skills Analysis",
        desc: "Explain any verified score, gap, or forensics finding from your code.",
        example: "Why is my Python score only 54%?",
        requiresData: true,
    },
    {
        emoji: "📄", label: "ATS & Resume",
        desc: "Check your ATS score, find keyword misses, or run a full audit.",
        example: "What's hurting my ATS score?",
        requiresData: false,
    },
    {
        emoji: "🎙️", label: "Mock Interview",
        desc: "Live AI interview calibrated to your skill gaps and target JD.",
        example: "Start my mock interview",
        requiresData: false,
    },
    {
        emoji: "✍️", label: "Resume Tailoring",
        desc: "One-click bullet rewrites matched to any JD — no overclaims.",
        example: "Tailor my resume for this role",
        requiresData: false,
    },
    {
        emoji: "💰", label: "Salary Intelligence",
        desc: "Market range + negotiation talking points from the JD.",
        example: "What's my salary range?",
        requiresData: false,
    },
    {
        emoji: "📦", label: "Application Kit",
        desc: "Cover letter, LinkedIn message, cold email — all auto-generated.",
        example: "Write my cover letter",
        requiresData: false,
    },
    {
        emoji: "🗺️", label: "Career Roadmap",
        desc: "Week-by-week study plan to close your biggest skill gaps.",
        example: "Show me my learning roadmap",
        requiresData: true,
    },
];

// ─── Suggestion Bank ─────────────────────────────────────────────────────────
const SUGGESTION_BANK = [
    // Round 0 — Career Coach tools (most differentiated, shown first)
    ["Start my mock interview", "What's my salary range?", "Write my cover letter", "Tailor my resume", "Generate my application kit"],
    // Round 1 — Skills & Graph
    ["What's my highest verified skill?", "Which skill has the biggest gap?", "Show me my knowledge graph", "Explain my verification score", "What does my 3D graph show?"],
    // Round 2 — ATS & Resume
    ["What's hurting my ATS score?", "Which keywords am I missing?", "Check my ATS score now", "How do I improve my resume?", "What's my resume match %?"],
    // Round 3 — Projects
    ["Are my project bullets verified?", "Which project scored highest?", "What should I build next?", "Show me my project evidence", "Which project has unverified bullets?"],
    // Round 4 — Strategy
    ["What's my biggest career risk?", "Show me my learning roadmap", "How long to close my skill gaps?", "How do I improve my score fastest?", "What's my overall job readiness?"],
];

// ─── Capability Welcome Screen ────────────────────────────────────────────────
function CapabilityWelcomeScreen({ hasData, onSend }: { hasData: boolean; onSend: (q: string) => void }) {
    return (
        <div style={{ width: "100%", padding: "2px 0 8px" }}>
            {/* Header */}
            <div style={{ textAlign: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 24, marginBottom: 3 }}>👋</div>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", margin: 0 }}>Hi, I&apos;m Alex</p>
                <p style={{ fontSize: 11, color: "#64748b", margin: "2px 0 0", lineHeight: 1.4 }}>
                    Your TrueSkill AI career coach. Here&apos;s everything I can do:
                </p>
            </div>

            {/* Capability cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {CAPABILITIES.map((cap) => {
                    const locked = cap.requiresData && !hasData;
                    return (
                        <div key={cap.label} style={{
                            padding: "7px 11px", borderRadius: 11,
                            background: locked ? "rgba(248,250,252,0.8)" : "white",
                            border: `1px solid ${locked ? "#e8ecf0" : "rgba(99,102,241,0.14)"}`,
                            display: "flex", alignItems: "flex-start", gap: 9,
                            opacity: locked ? 0.75 : 1,
                            boxShadow: locked ? "none" : "0 1px 4px rgba(99,102,241,0.06)",
                        }}>
                            <span style={{ fontSize: 15, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>{cap.emoji}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 1 }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: "#1e293b" }}>{cap.label}</span>
                                    {locked && (
                                        <span style={{ fontSize: 9, fontWeight: 600, color: "#94a3b8", background: "#f1f5f9", padding: "1px 5px", borderRadius: 6 }}>
                                            Run analysis first
                                        </span>
                                    )}
                                </div>
                                <p style={{ fontSize: 10.5, color: "#64748b", margin: "0 0 4px", lineHeight: 1.35 }}>{cap.desc}</p>
                                <button
                                    onClick={() => { if (!locked) onSend(cap.example); }}
                                    disabled={locked}
                                    style={{
                                        padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600,
                                        border: `1px solid ${locked ? "#e2e8f0" : "rgba(99,102,241,0.22)"}`,
                                        background: locked ? "#f8fafc" : "rgba(99,102,241,0.06)",
                                        color: locked ? "#94a3b8" : "#4338ca",
                                        cursor: locked ? "default" : "pointer",
                                        fontStyle: "italic", transition: "background 0.15s",
                                    }}
                                    onMouseEnter={e => { if (!locked) e.currentTarget.style.background = "rgba(99,102,241,0.14)"; }}
                                    onMouseLeave={e => { if (!locked) e.currentTarget.style.background = "rgba(99,102,241,0.06)"; }}
                                >
                                    &ldquo;{cap.example}&rdquo;
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {!hasData && (
                <p style={{ fontSize: 10, color: "#94a3b8", textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
                    📊 Upload a résumé + ingest a repo to unlock full context
                </p>
            )}
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────
const DEFAULT_SUGGESTIONS = [
    "What are my strongest skills?",
    "Which skill gap hurts most?",
    "Explain my verification results.",
];

export default function TrueSkillAssistant({
    messages, isLoading, onSend, suggestions = DEFAULT_SUGGESTIONS,
    contextStatus, onAction, onClear, onReaction, apiBase, candidateName,
    isOpen, onOpenChange, disabled = false,
}: Props) {
    const [input, setInput] = useState("");
    const [hoveredMsg, setHoveredMsg] = useState<number | null>(null);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [speechSupported, setSpeechSupported] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [atBottom, setAtBottom] = useState(true);
    const bottomRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const recognitionRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const prevMsgLen = useRef(messages.length);

    // Panel dimensions
    const PW = isExpanded ? 680 : 400;
    const PH = isExpanded ? 740 : 560;

    // Suggestion round = number of completed assistant responses → drives category rotation
    const suggestionRound = useMemo(
        () => messages.filter(m => m.role === "assistant" && !m.streaming).length,
        [messages]
    );

    // Effective suggestions: use rotating bank when LLM suggestions aren't customised
    const effectiveSuggestions = useMemo(() => {
        const isDefault = suggestions.length === 0 ||
            suggestions.every(s => DEFAULT_SUGGESTIONS.includes(s));
        if (isDefault) return SUGGESTION_BANK[suggestionRound % SUGGESTION_BANK.length];
        return suggestions;
    }, [suggestions, suggestionRound]);

    // 3 follow-up chips during conversation (welcome screen covers discovery on empty chat)
    const chipCount = 3;

    // Track unread when closed
    useEffect(() => {
        if (!isOpen && messages.length > prevMsgLen.current) {
            setUnreadCount(c => c + (messages.length - prevMsgLen.current));
        }
        prevMsgLen.current = messages.length;
    }, [messages.length, isOpen]);

    // Clear unread on open
    useEffect(() => {
        if (isOpen) { setUnreadCount(0); setTimeout(() => inputRef.current?.focus(), 200); }
    }, [isOpen]);

    // Auto-scroll
    useEffect(() => {
        if (isOpen) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }, [messages, isLoading, isOpen]);

    // Cmd+K shortcut (open/close) + Ctrl+F (in-chat search)
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); onOpenChange(!isOpen); }
            if ((e.metaKey || e.ctrlKey) && e.key === "f" && isOpen) {
                e.preventDefault();
                setIsSearchOpen(s => !s);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [isOpen, onOpenChange]);

    // Speech recognition support detection
    useEffect(() => {
        setSpeechSupported(typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window));
    }, []);

    // Scroll tracking for jump-to-bottom button
    const handleScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
    }, []);

    // Voice recording
    const handleVoice = useCallback(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) return;
        if (isRecording) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (recognitionRef.current as any)?.stop?.();
            setIsRecording(false);
            return;
        }
        const rec = new SR();
        rec.continuous = false;
        rec.interimResults = true;
        rec.lang = "en-US";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rec.onresult = (ev: any) => {
            const t = Array.from(ev.results as unknown[]).map((r: unknown) => (r as { [0]: { transcript: string } })[0].transcript).join("");
            setInput(t);
        };
        rec.onend = () => setIsRecording(false);
        rec.onerror = () => setIsRecording(false);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (recognitionRef as any).current = rec;
        rec.start();
        setIsRecording(true);
    }, [isRecording]);

    // Export conversation
    const handleExport = useCallback(() => {
        if (!messages.length) return;
        const lines = [
            `# TrueSkill AI — Alex Chat Export`,
            `**Date:** ${new Date().toLocaleDateString()}`,
            candidateName ? `**Candidate:** ${candidateName}` : "",
            "", "---", "",
        ];
        messages.forEach(m => {
            lines.push(`**${m.role === "user" ? "You" : "Alex"}:** ${m.content}`, "");
        });
        const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
        a.download = `alex-chat-${new Date().toISOString().slice(0,10)}.md`;
        a.click();
    }, [messages, candidateName]);

    // Reaction handler
    const handleReaction = useCallback(async (idx: number, reaction: "up" | "down") => {
        onReaction?.(idx, reaction);
        const msg = messages[idx];
        if (!msg || !apiBase) return;
        try {
            await fetch(`${apiBase}/api/coach/feedback`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ session_key: candidateName ?? "", message_content: msg.content, reaction }),
            });
        } catch { /* non-blocking */ }
        // If thumbs-down, prompt follow-up
        if (reaction === "down") {
            setTimeout(() => setInput("What would have been more helpful here?"), 100);
        }
    }, [messages, apiBase, candidateName, onReaction]);

    const handleSend = useCallback((msg?: string) => {
        const text = (msg ?? input).trim();
        if (!text || isLoading) return;
        setInput("");
        onSend(text);
    }, [input, isLoading, onSend]);

    const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const hasData = contextStatus && (
        contextStatus.skills || contextStatus.ats || contextStatus.projects || contextStatus.graph
    );

    return (
        <>
            <style>{`
                @keyframes tsBounce { 0%,60%,100%{transform:translateY(0);opacity:0.4} 30%{transform:translateY(-5px);opacity:1} }
                @keyframes tsFadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
                @keyframes tsPulse { 0%,100%{box-shadow:0 0 0 0 rgba(99,102,241,0.4)} 50%{box-shadow:0 0 0 8px rgba(99,102,241,0)} }
                @keyframes tsSlideUp { from{opacity:0;transform:translateY(16px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
                @keyframes tsCursor { 0%,100%{opacity:1} 50%{opacity:0} }
                .ts-msg-enter{animation:tsFadeUp 0.18s ease}
                .ts-stream-cursor::after{content:"▋";display:inline;animation:tsCursor 0.8s infinite;color:#7c3aed;font-size:12px;margin-left:1px}
            `}</style>

            {/* ── Floating panel ── */}
            {isOpen && (
                <div style={{
                    position: "fixed", bottom: 88, right: 24, zIndex: 9998,
                    width: PW, height: PH,
                    background: "white", borderRadius: 20,
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 24px 64px rgba(0,0,0,0.12), 0 4px 16px rgba(99,102,241,0.08)",
                    display: "flex", flexDirection: "column", overflow: "hidden",
                    animation: "tsSlideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)",
                    transition: "width 0.2s ease, height 0.2s ease",
                }}>
                    {/* Header */}
                    <div style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "14px 16px",
                        background: "linear-gradient(135deg, rgba(99,102,241,0.06), rgba(124,58,237,0.04))",
                        borderBottom: "1px solid #f1f5f9", flexShrink: 0,
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ padding: 8, background: "linear-gradient(135deg, #6366f1, #7c3aed)", borderRadius: 12, boxShadow: "0 4px 12px rgba(99,102,241,0.35)" }}>
                                <MessageSquare size={15} style={{ color: "white" }} />
                            </div>
                            <div>
                                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                    <span style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>Alex</span>
                                    <span style={{ fontSize: 10, fontWeight: 600, color: "#7c3aed", background: "rgba(124,58,237,0.08)", padding: "1px 7px", borderRadius: 20 }}>TrueSkill AI</span>
                                </div>
                                <span style={{ fontSize: 11, color: "#64748b" }}>
                                    {hasData ? "Full session context loaded" : "Run an analysis to unlock full context"}
                                </span>
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                            {messages.length > 0 && (
                                <>
                                    <button onClick={handleExport} title="Export chat" style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 6, borderRadius: 8, display: "flex", alignItems: "center" }}><Download size={14} /></button>
                                    <button onClick={() => setIsSearchOpen(s => !s)} title="Search chat" style={{ background: "none", border: "none", cursor: "pointer", color: isSearchOpen ? "#6366f1" : "#94a3b8", padding: 6, borderRadius: 8, display: "flex", alignItems: "center" }}><Search size={14} /></button>
                                    <button onClick={() => setShowClearConfirm(true)} title="Clear chat" style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 6, borderRadius: 8, display: "flex", alignItems: "center" }}><Trash2 size={14} /></button>
                                </>
                            )}
                            <button onClick={() => setIsExpanded(e => !e)} title={isExpanded ? "Compact" : "Expand"} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 6, borderRadius: 8, display: "flex", alignItems: "center" }}>
                                {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                            </button>
                            <button onClick={() => onOpenChange(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 6, borderRadius: 8, display: "flex", alignItems: "center" }}>
                                <X size={15} />
                            </button>
                        </div>
                    </div>

                    {/* Search bar */}
                    {isSearchOpen && (
                        <div style={{ padding: "6px 14px", borderBottom: "1px solid #f1f5f9", flexShrink: 0 }}>
                            <input
                                autoFocus
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search messages…"
                                style={{ width: "100%", padding: "6px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 12, outline: "none", boxSizing: "border-box" }}
                            />
                        </div>
                    )}

                    {/* Clear confirm */}
                    {showClearConfirm && (
                        <div style={{ padding: "8px 14px", background: "rgba(239,68,68,0.04)", borderBottom: "1px solid rgba(239,68,68,0.12)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 12, color: "#dc2626" }}>Clear all messages?</span>
                            <div style={{ display: "flex", gap: 6 }}>
                                <button onClick={() => { onClear?.(); setShowClearConfirm(false); }} style={{ padding: "3px 10px", borderRadius: 6, border: "none", background: "#ef4444", color: "white", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Yes, clear</button>
                                <button onClick={() => setShowClearConfirm(false)} style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid #e2e8f0", background: "white", fontSize: 11, cursor: "pointer" }}>Cancel</button>
                            </div>
                        </div>
                    )}

                    {/* Context pills */}
                    {contextStatus && <ContextPills status={contextStatus} />}

                    {/* Suggestions — hidden on empty chat (welcome screen takes over), shown during conversation */}
                    {effectiveSuggestions.length > 0 && !isLoading && messages.length > 0 && (
                        <div style={{ padding: "10px 14px 0", flexShrink: 0 }}>
                            <p style={{ fontSize: 9, color: "#94a3b8", marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                Follow-up
                            </p>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                                {effectiveSuggestions.slice(0, chipCount).map((q, i) => (
                                    <button key={i} onClick={() => handleSend(q)} style={{
                                        padding: "4px 10px", background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.18)",
                                        borderRadius: 20, fontSize: 11, color: "#4338ca", fontWeight: 500, cursor: "pointer", lineHeight: 1.4,
                                    }}
                                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(99,102,241,0.13)"; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = "rgba(99,102,241,0.06)"; }}
                                    >{q}</button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Message thread */}
                    <div
                        ref={scrollRef}
                        onScroll={handleScroll}
                        style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10, position: "relative" }}
                    >
                        {messages.length === 0 && !isLoading && (
                            <CapabilityWelcomeScreen hasData={!!hasData} onSend={handleSend} />
                        )}
                        {messages
                            .filter(msg => !searchQuery || msg.content.toLowerCase().includes(searchQuery.toLowerCase()))
                            .map((msg, i) => {
                            const isUser = msg.role === "user";
                            const isHighlighted = searchQuery && msg.content.toLowerCase().includes(searchQuery.toLowerCase());
                            return (
                                <div key={i} className="ts-msg-enter"
                                    style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start", outline: isHighlighted ? "2px solid rgba(99,102,241,0.35)" : "none", borderRadius: 12 }}
                                    onMouseEnter={() => setHoveredMsg(i)} onMouseLeave={() => setHoveredMsg(null)}>
                                    {/* Label row */}
                                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                                        {!isUser && <span style={{ fontSize: 10, fontWeight: 700, color: "#7c3aed" }}>Alex</span>}
                                        {!isUser && msg.isProactive && (
                                            <span style={{ fontSize: 9, fontWeight: 600, color: "#7c3aed", background: "rgba(124,58,237,0.08)", padding: "1px 6px", borderRadius: 10 }}>✨ Auto-insight</span>
                                        )}
                                        <span style={{ fontSize: 10, color: "#94a3b8" }}>{formatTime(msg.timestamp)}</span>
                                        {!isUser && hoveredMsg === i && <CopyBtn text={msg.content} />}
                                        {!isUser && hoveredMsg === i && (
                                            <>
                                                <button onClick={() => handleReaction(i, "up")} style={{ background: "none", border: "none", cursor: "pointer", color: msg.reaction === "up" ? "#10b981" : "#94a3b8", padding: "2px 3px", display: "flex", alignItems: "center" }}><ThumbsUp size={11} /></button>
                                                <button onClick={() => handleReaction(i, "down")} style={{ background: "none", border: "none", cursor: "pointer", color: msg.reaction === "down" ? "#ef4444" : "#94a3b8", padding: "2px 3px", display: "flex", alignItems: "center" }}><ThumbsDown size={11} /></button>
                                            </>
                                        )}
                                    </div>
                                    {/* Bubble */}
                                    <div style={{
                                        maxWidth: "88%", padding: isUser ? "9px 13px" : "11px 14px",
                                        borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                                        background: isUser ? "linear-gradient(135deg, #6366f1, #7c3aed)" : "#f8fafc",
                                        color: isUser ? "white" : "#1e293b",
                                        border: isUser ? "none" : "1px solid #e2e8f0",
                                        boxShadow: isUser ? "0 3px 12px rgba(99,102,241,0.28)" : "0 1px 4px rgba(0,0,0,0.05)",
                                    }}>
                                        {isUser
                                            ? <span style={{ fontSize: 13, lineHeight: 1.5 }}>{msg.content}</span>
                                            : <div className={msg.streaming ? "ts-stream-cursor" : ""}>{renderMarkdown(msg.content)}</div>
                                        }
                                    </div>
                                    {/* Action prompt card */}
                                    {!isUser && msg.actionPrompt && (
                                        <ActionPromptCard ap={msg.actionPrompt} onAction={onAction} />
                                    )}
                                </div>
                            );
                        })}
                        {isLoading && !messages.some(m => m.streaming) && (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: "#7c3aed", marginBottom: 3 }}>Alex</span>
                                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "16px 16px 16px 4px" }}>
                                    <TypingDots />
                                </div>
                            </div>
                        )}
                        <div ref={bottomRef} />
                    </div>

                    {/* Jump to bottom */}
                    {!atBottom && (
                        <button
                            onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
                            style={{ position: "absolute", bottom: 80, right: 30, zIndex: 10, width: 32, height: 32, borderRadius: "50%", border: "1px solid #e2e8f0", background: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.1)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#6366f1" }}
                        >
                            <ArrowDown size={14} />
                        </button>
                    )}

                    {/* Input */}
                    <div style={{ padding: "10px 14px 14px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 8, alignItems: "center", background: "rgba(248,250,252,0.6)", flexShrink: 0 }}>
                        {speechSupported && (
                            <button onClick={handleVoice} title={isRecording ? "Stop recording" : "Voice input"}
                                style={{ width: 34, height: 34, borderRadius: 10, border: "none", flexShrink: 0, cursor: "pointer", background: isRecording ? "rgba(239,68,68,0.1)" : "rgba(99,102,241,0.06)", color: isRecording ? "#ef4444" : "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", animation: isRecording ? "tsPulse 1.5s ease-in-out infinite" : "none" }}
                            >
                                {isRecording ? <MicOff size={14} /> : <Mic size={14} />}
                            </button>
                        )}
                        <input
                            ref={inputRef}
                            id="alex-assistant-input"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                            placeholder={disabled ? "Run an analysis to enable Alex…" : isRecording ? "Listening…" : "Ask Alex anything about your results…"}
                            disabled={isLoading || disabled}
                            style={{ flex: 1, padding: "9px 13px", borderRadius: 12, fontSize: 13, border: "1.5px solid #e2e8f0", outline: "none", background: "white", color: "#1e293b" }}
                            onFocus={e => { e.target.style.borderColor = "#6366f1"; e.target.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.12)"; }}
                            onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "none"; }}
                        />
                        <button
                            id="alex-assistant-send-btn"
                            onClick={() => handleSend()}
                            disabled={!input.trim() || isLoading || disabled}
                            style={{
                                width: 38, height: 38, borderRadius: 12, border: "none", flexShrink: 0,
                                cursor: input.trim() && !isLoading && !disabled ? "pointer" : "default",
                                background: input.trim() && !isLoading && !disabled ? "linear-gradient(135deg, #6366f1, #7c3aed)" : "#e2e8f0",
                                color: input.trim() && !isLoading && !disabled ? "white" : "#94a3b8",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                boxShadow: input.trim() && !isLoading && !disabled ? "0 3px 10px rgba(99,102,241,0.35)" : "none",
                            }}>
                            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        </button>
                    </div>
                </div>
            )}

            {/* ── FAB Button ── */}
            <button
                id="alex-assistant-fab"
                onClick={() => onOpenChange(!isOpen)}
                title={isOpen ? "Close Alex (⌘K)" : "Ask Alex (⌘K)"}
                style={{
                    position: "fixed", bottom: 24, right: 24, zIndex: 9999,
                    width: 56, height: 56, borderRadius: "50%", border: "none",
                    background: isOpen ? "#e2e8f0" : "linear-gradient(135deg, #6366f1, #7c3aed)",
                    color: isOpen ? "#64748b" : "white",
                    cursor: "pointer",
                    boxShadow: isOpen ? "0 4px 12px rgba(0,0,0,0.1)" : "0 8px 24px rgba(99,102,241,0.45)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.2s cubic-bezier(0.34,1.56,0.64,1)",
                    animation: !isOpen && messages.length === 0 ? "tsPulse 2.5s ease-in-out infinite" : "none",
                    transform: isOpen ? "scale(0.92)" : "scale(1)",
                }}>
                {isOpen
                    ? <ChevronDown size={22} />
                    : <MessageSquare size={22} />
                }
                {/* Unread badge */}
                {!isOpen && unreadCount > 0 && (
                    <div style={{
                        position: "absolute", top: -4, right: -4,
                        width: 20, height: 20, borderRadius: "50%",
                        background: "#ef4444", color: "white",
                        fontSize: 11, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        border: "2px solid white",
                    }}>{unreadCount > 9 ? "9+" : unreadCount}</div>
                )}
            </button>
        </>
    );
}
