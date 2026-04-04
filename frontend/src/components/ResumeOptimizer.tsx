"use client";

import { useState } from "react";
import { Copy, Check, Zap, Plus, ArrowRight } from "lucide-react";

interface OptimizationResult {
    original_skills_section: string;
    optimized_skills_section: string;
    injected_keywords: string[];
    changes_summary: string;
    optimization_tip: string;
}

interface ResumeOptimizerProps {
    result: OptimizationResult;
}

function highlightKeywords(text: string, keywords: string[]): React.ReactNode {
    if (!keywords.length || !text) return <>{text}</>;

    // Build a regex that matches any of the keywords (case-insensitive)
    const pattern = new RegExp(
        `(${keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
        "gi"
    );

    const parts = text.split(pattern);
    return (
        <>
            {parts.map((part, i) => {
                const isKeyword = keywords.some((k) => k.toLowerCase() === part.toLowerCase());
                return isKeyword ? (
                    <mark
                        key={i}
                        className="font-bold rounded px-0.5"
                        style={{
                            background: "rgba(99,102,241,0.25)",
                            color: "#a5b4fc",
                            textDecoration: "none",
                        }}
                    >
                        {part}
                    </mark>
                ) : (
                    <span key={i}>{part}</span>
                );
            })}
        </>
    );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
            style={{
                background: copied ? "rgba(16,185,129,0.15)" : "rgba(99,102,241,0.15)",
                border: `1px solid ${copied ? "rgba(16,185,129,0.4)" : "rgba(99,102,241,0.35)"}`,
                color: copied ? "#6ee7b7" : "#a5b4fc",
            }}
        >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied!" : label}
        </button>
    );
}

type ViewMode = "side-by-side" | "diff";

export default function ResumeOptimizer({ result }: ResumeOptimizerProps) {
    const [viewMode, setViewMode] = useState<ViewMode>("side-by-side");

    const { original_skills_section, optimized_skills_section, injected_keywords, changes_summary, optimization_tip } = result;

    return (
        <div className="space-y-4">
            {/* Stats bar */}
            <div className="flex flex-wrap items-center gap-3">
                {/* Keywords injected count */}
                <div
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
                    style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)" }}
                >
                    <Zap size={14} className="text-indigo-400" />
                    <span className="text-slate-300">
                        <span className="font-black text-indigo-300 text-lg mx-1">{injected_keywords.length}</span>
                        keywords injected
                    </span>
                </div>

                {/* View toggle */}
                <div
                    className="flex rounded-lg overflow-hidden text-[11px] font-semibold ml-auto"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                    {(["side-by-side", "diff"] as ViewMode[]).map((mode) => (
                        <button
                            key={mode}
                            onClick={() => setViewMode(mode)}
                            className="px-3 py-1.5 capitalize transition-all"
                            style={{
                                background: viewMode === mode ? "rgba(99,102,241,0.3)" : "transparent",
                                color: viewMode === mode ? "#c7d2fe" : "#64748b",
                            }}
                        >
                            {mode === "side-by-side" ? "Side by Side" : "Diff View"}
                        </button>
                    ))}
                </div>
            </div>

            {/* Injected keyword chips */}
            {injected_keywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {injected_keywords.map((kw) => (
                        <span
                            key={kw}
                            className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
                            style={{
                                background: "rgba(99,102,241,0.12)",
                                border: "1px solid rgba(99,102,241,0.3)",
                                color: "#a5b4fc",
                            }}
                        >
                            <Plus size={9} />
                            {kw}
                        </span>
                    ))}
                </div>
            )}

            {/* Main diff / side-by-side panel */}
            {viewMode === "side-by-side" ? (
                <div className="grid grid-cols-2 gap-3">
                    {/* Original */}
                    <div
                        className="rounded-xl p-4 space-y-2"
                        style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)" }}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-bold uppercase tracking-widest text-red-400">Before</span>
                        </div>
                        <p
                            className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap font-mono"
                            style={{ minHeight: "80px" }}
                        >
                            {original_skills_section || "Original skills section not extracted."}
                        </p>
                    </div>

                    {/* Optimized */}
                    <div
                        className="rounded-xl p-4 space-y-2"
                        style={{ background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.2)" }}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">After</span>
                            <CopyButton text={optimized_skills_section} label="Copy Optimized" />
                        </div>
                        <p
                            className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-mono"
                            style={{ minHeight: "80px" }}
                        >
                            {highlightKeywords(optimized_skills_section, injected_keywords)}
                        </p>
                    </div>
                </div>
            ) : (
                /* Diff view */
                <div
                    className="rounded-xl p-4 font-mono text-xs"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">diff view</span>
                        <CopyButton text={optimized_skills_section} label="Copy New Section" />
                    </div>

                    {/* Show a simple line-by-line diff */}
                    {original_skills_section && (
                        <div className="mb-2">
                            {original_skills_section.split("\n").map((line, i) => (
                                <div
                                    key={`del-${i}`}
                                    className="rounded px-2 py-0.5 mb-0.5"
                                    style={{ background: "rgba(239,68,68,0.08)", color: "#fca5a5" }}
                                >
                                    <span className="opacity-50 mr-2 select-none">−</span>
                                    {line}
                                </div>
                            ))}
                        </div>
                    )}

                    {optimized_skills_section && (
                        <div>
                            {optimized_skills_section.split("\n").map((line, i) => (
                                <div
                                    key={`add-${i}`}
                                    className="rounded px-2 py-0.5 mb-0.5"
                                    style={{ background: "rgba(16,185,129,0.08)", color: "#6ee7b7" }}
                                >
                                    <span className="opacity-50 mr-2 select-none">+</span>
                                    {highlightKeywords(line, injected_keywords)}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Changes summary + tip */}
            {(changes_summary || optimization_tip) && (
                <div className="grid grid-cols-2 gap-3">
                    {changes_summary && (
                        <div
                            className="rounded-xl px-4 py-3 flex items-start gap-2"
                            style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.15)" }}
                        >
                            <ArrowRight size={13} className="text-indigo-400 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-slate-400 leading-relaxed">{changes_summary}</p>
                        </div>
                    )}
                    {optimization_tip && (
                        <div
                            className="rounded-xl px-4 py-3 flex items-start gap-2"
                            style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.15)" }}
                        >
                            <Zap size={13} className="text-amber-400 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-slate-400 leading-relaxed">{optimization_tip}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
