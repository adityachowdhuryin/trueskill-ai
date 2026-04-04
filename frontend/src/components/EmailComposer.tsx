"use client";

import { useState } from "react";
import { Copy, Check, Mail, Send, Hash, Pencil } from "lucide-react";

export interface EmailDraft {
    subject: string;
    body: string;
    tone: string;
    word_count: number;
}

interface EmailComposerProps {
    draft: EmailDraft;
    recipientEmail?: string;
    onBodyChange: (newBody: string) => void;
    onSubjectChange: (newSubject: string) => void;
}

function CopyButton({ text, label = "Copy", size = "sm" }: { text: string; label?: string; size?: "sm" | "xs" }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            onClick={handleCopy}
            className={`flex items-center gap-1.5 rounded-lg font-semibold transition-all duration-200 ${size === "xs" ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-xs"}`}
            style={{
                background: copied ? "rgba(16,185,129,0.15)" : "rgba(99,102,241,0.12)",
                border: `1px solid ${copied ? "rgba(16,185,129,0.4)" : "rgba(99,102,241,0.3)"}`,
                color: copied ? "#6ee7b7" : "#a5b4fc",
            }}
        >
            {copied ? <Check size={size === "xs" ? 10 : 12} /> : <Copy size={size === "xs" ? 10 : 12} />}
            {copied ? "Copied!" : label}
        </button>
    );
}

export default function EmailComposer({ draft, recipientEmail, onBodyChange, onSubjectChange }: EmailComposerProps) {
    const [isEditing, setIsEditing] = useState(false);

    const wordCount = draft.body.split(/\s+/).filter(Boolean).length;

    return (
        <div className="space-y-4">
            {/* Email header meta */}
            <div className="flex flex-wrap items-center gap-2">
                {/* Tone badge */}
                <span
                    className="text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest"
                    style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)", color: "#a5b4fc" }}
                >
                    {draft.tone}
                </span>

                {/* Word count */}
                <span
                    className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full"
                    style={{ background: "rgba(148,163,184,0.08)", border: "1px solid rgba(148,163,184,0.15)", color: "#94a3b8" }}
                >
                    <Hash size={10} />
                    {wordCount} words
                </span>

                <div className="ml-auto flex items-center gap-2">
                    <button
                        onClick={() => setIsEditing((v) => !v)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        style={{
                            background: isEditing ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.05)",
                            border: `1px solid ${isEditing ? "rgba(245,158,11,0.4)" : "rgba(255,255,255,0.1)"}`,
                            color: isEditing ? "#fcd34d" : "#64748b",
                        }}
                    >
                        <Pencil size={12} />
                        {isEditing ? "Done Editing" : "Edit"}
                    </button>
                    <CopyButton text={`Subject: ${draft.subject}\n\n${draft.body}`} label="Copy Full Email" />
                </div>
            </div>

            {/* Email card */}
            <div
                className="rounded-2xl overflow-hidden"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
                {/* Email client header stripe */}
                <div
                    className="px-4 py-3 flex items-center gap-2"
                    style={{
                        background: "linear-gradient(90deg, rgba(99,102,241,0.15) 0%, rgba(139,92,246,0.08) 100%)",
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                    }}
                >
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(99,102,241,0.3)" }}>
                        <Mail size={14} className="text-indigo-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">To</p>
                        <p className="text-xs font-semibold text-slate-300 truncate">
                            {recipientEmail || "hiring.manager@company.com"}
                        </p>
                    </div>
                    <Send size={14} className="text-slate-600" />
                </div>

                {/* Subject line */}
                <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex-shrink-0">Subject</span>
                        {isEditing ? (
                            <input
                                type="text"
                                value={draft.subject}
                                onChange={(e) => onSubjectChange(e.target.value)}
                                className="flex-1 bg-transparent text-sm font-semibold text-slate-100 outline-none border-b border-indigo-500/40 pb-0.5"
                            />
                        ) : (
                            <span className="text-sm font-semibold text-slate-100 flex-1">{draft.subject}</span>
                        )}
                        <CopyButton text={draft.subject} label="Copy" size="xs" />
                    </div>
                </div>

                {/* Email body */}
                <div className="p-4">
                    {isEditing ? (
                        <textarea
                            value={draft.body}
                            onChange={(e) => onBodyChange(e.target.value)}
                            className="w-full text-xs text-slate-300 leading-relaxed bg-transparent outline-none resize-none font-sans"
                            style={{ minHeight: "220px" }}
                        />
                    ) : (
                        <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap" style={{ minHeight: "220px" }}>
                            {draft.body || "No email body generated."}
                        </div>
                    )}
                </div>
            </div>

            {/* Tips */}
            <div
                className="rounded-xl px-4 py-3"
                style={{ background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.15)" }}
            >
                <p className="text-[11px] text-emerald-400 font-semibold mb-1">💡 Pro tips</p>
                <ul className="text-[11px] text-slate-400 space-y-0.5">
                    <li>• Send on Tuesday–Thursday between 8–10 AM (recipient&apos;s time zone) for highest open rates</li>
                    <li>• Personalize the company-specific line in paragraph 1 before sending</li>
                    <li>• Follow up once after 5 business days if no response</li>
                </ul>
            </div>
        </div>
    );
}
