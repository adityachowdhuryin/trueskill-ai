"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Download, ChevronDown, ChevronUp, CheckCircle2,
    XCircle, AlertTriangle, Zap, TrendingUp, Target,
    Rocket, Pencil, ChevronRight, Copy, Check, RefreshCw,
    Award, BarChart3,
} from "lucide-react";
import type {
    ATSReport,
    ATSKeywordMatch,
    ATSSectionFeedback,
    ATSPriorityAction,
    ATSRewriteSuggestion,
} from "@/types/dashboard";

// Re-export for any consumers that import types from here
export type { ATSReport, ATSKeywordMatch as KeywordMatch, ATSSectionFeedback as SectionFeedback, ATSPriorityAction as PriorityAction, ATSRewriteSuggestion as RewriteSuggestion };

interface ATSScorePanelProps {
    report: ATSReport;
    previousReport?: ATSReport | null;
    candidateName?: string;
    apiBaseUrl: string;
    onReAnalyze?: () => void;
    onApplyToResume?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function scoreColor(score: number): string {
    if (score >= 75) return "#22c55e";
    if (score >= 50) return "#f59e0b";
    return "#ef4444";
}

function scoreLabel(score: number): string {
    if (score >= 75) return "Strong";
    if (score >= 50) return "Fair";
    return "Needs Work";
}

function scoreBg(score: number): string {
    if (score >= 75) return "rgba(34,197,94,0.1)";
    if (score >= 50) return "rgba(245,158,11,0.1)";
    return "rgba(239,68,68,0.1)";
}

function impactColor(impact: string): string {
    if (impact === "High") return "#ef4444";
    if (impact === "Medium") return "#f59e0b";
    return "#22c55e";
}

function impactBg(impact: string): string {
    if (impact === "High") return "rgba(239,68,68,0.12)";
    if (impact === "Medium") return "rgba(245,158,11,0.12)";
    return "rgba(34,197,94,0.12)";
}

function matchLevelColor(level: string): string {
    if (level === "Excellent Match") return "#22c55e";
    if (level === "Good Match") return "#60a5fa";
    if (level === "Partial Match") return "#f59e0b";
    return "#ef4444";
}

// ─── Delta Badge ──────────────────────────────────────────────────────────────
function DeltaBadge({ delta }: { delta: number }) {
    if (delta === 0) return null;
    const isPos = delta > 0;
    return (
        <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1"
            style={{
                background: isPos ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                color: isPos ? "#86efac" : "#fca5a5",
                border: `1px solid ${isPos ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
            }}
        >
            {isPos ? "+" : ""}{delta}
        </span>
    );
}

// ─── Circular Gauge ────────────────────────────────────────────────────────────
function CircularGauge({ score }: { score: number }) {
    const [displayed, setDisplayed] = useState(0);
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (displayed / 100) * circumference;
    const color = scoreColor(displayed);

    // Animate from 0 → score on mount
    useEffect(() => {
        const timer = setTimeout(() => setDisplayed(score), 120);
        return () => clearTimeout(timer);
    }, [score]);

    return (
        <div className="relative flex items-center justify-center" style={{ width: 140, height: 140 }}>
            <svg width="140" height="140" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="70" cy="70" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
                <circle
                    cx="70" cy="70" r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1), stroke 0.3s" }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black" style={{ color }}>{displayed}</span>
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>ATS Score</span>
            </div>
        </div>
    );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
function ScoreBar({ label, score, delta }: { label: string; score: number; delta?: number }) {
    const color = scoreColor(score);
    return (
        <div className="space-y-1">
            <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-slate-400">{label}</span>
                <div className="flex items-center">
                    <span className="text-sm font-bold" style={{ color }}>{score}%</span>
                    {delta !== undefined && <DeltaBadge delta={delta} />}
                </div>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{ width: `${score}%`, background: color, boxShadow: `0 0 8px ${color}55` }}
                />
            </div>
        </div>
    );
}

// ─── Benchmark Bar ────────────────────────────────────────────────────────────
function BenchmarkBar({ score }: { score: number }) {
    const passThreshold = 65;
    const passes = score >= passThreshold;
    return (
        <div
            className="px-4 py-2.5 rounded-xl flex items-center gap-3"
            style={{
                background: passes ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.07)",
                border: `1px solid ${passes ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
            }}
        >
            <div
                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: passes ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)" }}
            >
                {passes
                    ? <CheckCircle2 size={13} className="text-green-400" />
                    : <XCircle size={13} className="text-red-400" />
                }
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold" style={{ color: passes ? "#86efac" : "#fca5a5" }}>
                    {passes ? "Likely to pass ATS filters" : "At risk of ATS rejection"}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                    Most ATS systems filter below <strong className="text-slate-400">{passThreshold}</strong>. Your score: <strong style={{ color: scoreColor(score) }}>{score}</strong>
                </p>
            </div>
            {/* Marker track */}
            <div className="relative w-20 h-1.5 rounded-full flex-shrink-0" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="h-full rounded-full" style={{ width: `${score}%`, background: scoreColor(score) }} />
                <div
                    className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 rounded-full"
                    style={{ left: `${passThreshold}%`, background: "rgba(255,255,255,0.3)" }}
                />
            </div>
        </div>
    );
}

// ─── Match Level Badge ────────────────────────────────────────────────────────
function MatchLevelBadge({ level, jobTitle, company }: { level: string; jobTitle?: string; company?: string }) {
    if (!level && !jobTitle) return null;
    const color = matchLevelColor(level);
    return (
        <div className="flex flex-wrap items-center gap-2">
            {(jobTitle || company) && (
                <span className="text-xs text-slate-400 truncate max-w-xs">
                    {[jobTitle, company].filter(Boolean).join(" @ ")}
                </span>
            )}
            {level && (
                <span
                    className="text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-widest flex items-center gap-1"
                    style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}
                >
                    <Award size={9} />
                    {level}
                </span>
            )}
        </div>
    );
}

// ─── Priority Action Card ─────────────────────────────────────────────────────
function PriorityActionCard({ action }: { action: ATSPriorityAction }) {
    const ic = impactColor(action.impact);
    const ib = impactBg(action.impact);
    return (
        <div
            className="flex items-start gap-3 rounded-xl p-4 transition-all duration-200"
            style={{ background: "rgba(255,255,255,0.03)", border: `1px solid rgba(255,255,255,0.07)`, borderLeft: `3px solid ${ic}` }}
        >
            <div
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-black"
                style={{ background: ib, color: ic }}
            >
                {action.rank}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center flex-wrap gap-1.5 mb-1.5">
                    <span
                        className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                        style={{ background: ib, color: ic }}
                    >
                        {action.impact} Impact
                    </span>
                    <span className="text-[10px] text-slate-500">·</span>
                    <span className="text-[10px] text-slate-500">{action.section}</span>
                    <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto"
                        style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)" }}
                    >
                        +{action.estimated_gain} pts
                    </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{action.action}</p>
            </div>
        </div>
    );
}

// ─── Copy Button ──────────────────────────────────────────────────────────────
function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback for older browsers
            const el = document.createElement("textarea");
            el.value = text;
            document.body.appendChild(el);
            el.select();
            document.execCommand("copy");
            document.body.removeChild(el);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }, [text]);

    return (
        <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all duration-200"
            style={{
                background: copied ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)",
                border: `1px solid ${copied ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.1)"}`,
                color: copied ? "#86efac" : "#94a3b8",
            }}
        >
            {copied ? <Check size={10} /> : <Copy size={10} />}
            {copied ? "Copied!" : label}
        </button>
    );
}

// ─── Rewrite Suggestion Card ──────────────────────────────────────────────────
function RewriteCard({ rs }: { rs: ATSRewriteSuggestion }) {
    const [open, setOpen] = useState(false);
    return (
        <div
            className="rounded-xl overflow-hidden transition-all duration-200"
            style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}
        >
            <button
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
                <div className="flex items-center gap-2">
                    <Pencil size={12} className="text-indigo-400 flex-shrink-0" />
                    <span className="text-xs font-semibold text-slate-300">{rs.section} Section Rewrite</span>
                </div>
                {open ? <ChevronUp size={13} className="text-slate-500" /> : <ChevronDown size={13} className="text-slate-500" />}
            </button>
            {open && (
                <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                    <div className="grid grid-cols-2 gap-3 pt-3">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-1.5">Before</p>
                            <div
                                className="rounded-lg p-3 text-[11px] text-red-200 leading-relaxed"
                                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
                            >
                                {rs.original_snippet}
                            </div>
                        </div>
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-green-400">After</p>
                                <CopyButton text={rs.rewritten_snippet} label="Copy" />
                            </div>
                            <div
                                className="rounded-lg p-3 text-[11px] text-green-200 leading-relaxed"
                                style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}
                            >
                                {rs.rewritten_snippet}
                            </div>
                        </div>
                    </div>
                    <p className="text-[11px] text-slate-500 italic flex items-start gap-1.5">
                        <Zap size={11} className="text-amber-400 mt-0.5 flex-shrink-0" />
                        {rs.rationale}
                    </p>
                </div>
            )}
        </div>
    );
}

// ─── Keyword Detail Row ────────────────────────────────────────────────────────
function KeywordChip({ km }: { km: ATSKeywordMatch }) {
    const [expanded, setExpanded] = useState(false);
    const hasContext = !!km.context;

    return (
        <div className="inline-block">
            <button
                onClick={() => hasContext && setExpanded(v => !v)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-transform hover:scale-105 ${hasContext ? "cursor-pointer" : "cursor-default"}`}
                style={{
                    background: km.found ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                    border: `1px solid ${km.found ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                    color: km.found ? "#86efac" : "#fca5a5",
                }}
            >
                {km.found ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                {km.keyword}
                {hasContext && (
                    <ChevronDown
                        size={9}
                        className="ml-0.5 transition-transform duration-200"
                        style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
                    />
                )}
            </button>
            {expanded && hasContext && (
                <div
                    className="mt-1 px-3 py-2 rounded-lg text-[10px] text-slate-400 leading-relaxed max-w-xs"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                >
                    <span className="text-slate-500 font-semibold">Found: </span>
                    {km.context}
                </div>
            )}
        </div>
    );
}

// ─── Section Accordion ────────────────────────────────────────────────────────
function SectionCard({ sf, delta }: { sf: ATSSectionFeedback; delta?: number }) {
    const [open, setOpen] = useState(false);
    const color = scoreColor(sf.score);

    return (
        <div
            className="rounded-xl border transition-all duration-200"
            style={{
                background: open ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
                borderColor: open ? `${color}40` : "rgba(255,255,255,0.07)",
            }}
        >
            <button
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
                <div className="flex items-center gap-3">
                    <span
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black"
                        style={{ background: scoreBg(sf.score), color }}
                    >
                        {sf.score}
                    </span>
                    <span className="text-sm font-semibold text-slate-200">{sf.section}</span>
                    {delta !== undefined && <DeltaBadge delta={delta} />}
                </div>
                <div className="flex items-center gap-3">
                    <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div className="h-full rounded-full" style={{ width: `${sf.score}%`, background: color }} />
                    </div>
                    {open ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                </div>
            </button>

            {open && (
                <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <p className="text-xs text-slate-400 leading-relaxed pt-3">{sf.feedback}</p>
                    {sf.suggestions.length > 0 && (
                        <ul className="space-y-1.5">
                            {sf.suggestions.map((s, i) => (
                                <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                                    <span className="mt-0.5 w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center flex-shrink-0 text-[9px] font-bold">
                                        {i + 1}
                                    </span>
                                    {s}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────
type KeywordTab = "all" | "found" | "missing";

export default function ATSScorePanel({
    report,
    previousReport,
    candidateName = "Candidate",
    apiBaseUrl,
    onReAnalyze,
    onApplyToResume,
}: ATSScorePanelProps) {
    const [kwTab, setKwTab] = useState<KeywordTab>("all");
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState<string | null>(null);
    const [showRewrites, setShowRewrites] = useState(false);
    const [showAllKeywords, setShowAllKeywords] = useState(false);

    const found   = report.keyword_matches.filter(k => k.found);
    const missing = report.keyword_matches.filter(k => !k.found);
    const displayed = kwTab === "found" ? found : kwTab === "missing" ? missing : report.keyword_matches;
    const visibleKeywords = showAllKeywords ? displayed : displayed.slice(0, 24);

    const priorityActions    = report.priority_actions ?? [];
    const rewriteSuggestions = report.rewrite_suggestions ?? [];

    // Score deltas vs previous run
    const scoreDelta = previousReport ? report.ats_score - previousReport.ats_score : undefined;
    const kwDelta    = previousReport ? report.keyword_match_score - previousReport.keyword_match_score : undefined;
    const cntDelta   = previousReport ? report.content_score - previousReport.content_score : undefined;
    const fmtDelta   = previousReport ? report.format_score - previousReport.format_score : undefined;
    const expDelta   = previousReport ? report.experience_match_score - previousReport.experience_match_score : undefined;

    // Section deltas
    const prevSections: Record<string, number> = {};
    if (previousReport) {
        previousReport.section_feedback.forEach(sf => { prevSections[sf.section] = sf.score; });
    }

    const handleDownload = async () => {
        setIsDownloading(true);
        setDownloadError(null);
        try {
            const res = await fetch(`${apiBaseUrl}/api/ats-report`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ats_report: report, candidate_name: candidateName }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: "Download failed" }));
                throw new Error(err.detail ?? "Download failed");
            }
            const blob = await res.blob();
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement("a");
            a.href     = url;
            a.download = "ats_report.html";
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            setDownloadError(e instanceof Error ? e.message : "Download failed");
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <div
            className="rounded-2xl overflow-hidden"
            style={{
                background: "linear-gradient(160deg, #0f172a 0%, #0a0f1e 100%)",
                border: "1px solid rgba(255,255,255,0.07)",
                boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
            }}
        >
            {/* ── Header ── */}
            <div
                className="px-6 py-4 flex items-center justify-between flex-wrap gap-3"
                style={{
                    background: "linear-gradient(90deg, rgba(79,70,229,0.2) 0%, rgba(124,58,237,0.12) 100%)",
                    borderBottom: "1px solid rgba(255,255,255,0.07)",
                }}
            >
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(99,102,241,0.3)" }}>
                        <Target size={16} className="text-indigo-300" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-100 text-sm">ATS Evaluation Report</h3>
                        <MatchLevelBadge
                            level={report.match_level ?? ""}
                            jobTitle={report.job_title}
                            company={report.company_name}
                        />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {onReAnalyze && (
                        <button
                            onClick={onReAnalyze}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                            style={{
                                background: "rgba(255,255,255,0.05)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                color: "#94a3b8",
                            }}
                            title="Re-run ATS analysis"
                        >
                            <RefreshCw size={11} />
                            Re-analyze
                        </button>
                    )}
                    <button
                        onClick={handleDownload}
                        disabled={isDownloading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        style={{
                            background: isDownloading ? "rgba(99,102,241,0.1)" : "rgba(99,102,241,0.25)",
                            border: "1px solid rgba(99,102,241,0.4)",
                            color: "#a5b4fc",
                        }}
                    >
                        <Download size={12} />
                        {isDownloading ? "Downloading..." : "Download Report"}
                    </button>
                </div>
            </div>

            {downloadError && (
                <div className="mx-6 mt-3 px-3 py-2 rounded-lg text-xs text-red-300 flex items-center gap-2"
                    style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                    <XCircle size={12} className="flex-shrink-0" />
                    {downloadError}
                </div>
            )}

            <div className="p-6 space-y-6">
                {/* ── Score Dashboard ── */}
                <div className="flex items-center gap-8 flex-wrap">
                    {/* Circular gauge */}
                    <div className="flex flex-col items-center gap-2">
                        <CircularGauge score={report.ats_score} />
                        <div className="flex items-center gap-1.5">
                            <span
                                className="text-xs font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full"
                                style={{ color: scoreColor(report.ats_score), background: scoreBg(report.ats_score) }}
                            >
                                {scoreLabel(report.ats_score)}
                            </span>
                            {scoreDelta !== undefined && <DeltaBadge delta={scoreDelta} />}
                        </div>
                    </div>

                    {/* Sub-score bars */}
                    <div className="flex-1 min-w-48 space-y-4">
                        <ScoreBar label="Keyword Match"    score={report.keyword_match_score}      delta={kwDelta} />
                        <ScoreBar label="Content Quality"  score={report.content_score}             delta={cntDelta} />
                        <ScoreBar label="Formatting"       score={report.format_score}              delta={fmtDelta} />
                        <ScoreBar label="Experience Match" score={report.experience_match_score ?? 0} delta={expDelta} />
                    </div>

                    {/* Quick stats */}
                    <div className="flex flex-col gap-3 text-center min-w-28">
                        <div className="rounded-xl px-4 py-3" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
                            <div className="text-2xl font-black text-green-400">{found.length}</div>
                            <div className="text-[10px] text-green-600 uppercase tracking-widest font-semibold mt-0.5">Keywords Found</div>
                        </div>
                        <div className="rounded-xl px-4 py-3" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                            <div className="text-2xl font-black text-red-400">{missing.length}</div>
                            <div className="text-[10px] text-red-600 uppercase tracking-widest font-semibold mt-0.5">Keywords Missing</div>
                        </div>
                    </div>
                </div>

                {/* ── Benchmark Bar ── */}
                <BenchmarkBar score={report.ats_score} />

                {/* ── Overall recommendation ── */}
                {report.overall_recommendation && (
                    <div
                        className="px-4 py-3 rounded-xl text-sm text-slate-300 leading-relaxed"
                        style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}
                    >
                        <span className="font-semibold text-indigo-300">📋 Recommendation: </span>
                        {report.overall_recommendation}
                    </div>
                )}

                {/* ── Priority Actions ── */}
                {priorityActions.length > 0 && (
                    <div>
                        <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-3">
                            <Rocket size={14} className="text-indigo-400" />
                            Priority Actions
                            <span className="text-[10px] font-medium text-slate-500 ml-1">— ranked by score impact</span>
                        </h4>
                        <div className="space-y-2">
                            {priorityActions.map((pa, i) => (
                                <PriorityActionCard key={i} action={pa} />
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Rewrite Suggestions ── */}
                {rewriteSuggestions.length > 0 && (
                    <div>
                        <button
                            onClick={() => setShowRewrites(v => !v)}
                            className="w-full flex items-center justify-between text-sm font-bold text-slate-200 mb-3"
                        >
                            <span className="flex items-center gap-2">
                                <Pencil size={14} className="text-violet-400" />
                                Rewrite Suggestions
                                <span className="text-[10px] font-medium text-slate-500 ml-1">— copy-paste ready improvements</span>
                            </span>
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold"
                                style={{ color: "#a78bfa" }}>
                                {showRewrites ? "Hide" : "Show"} {rewriteSuggestions.length} suggestions
                                <ChevronRight size={12} className={`transition-transform duration-200 ${showRewrites ? "rotate-90" : ""}`} />
                            </div>
                        </button>
                        {showRewrites && (
                            <div className="space-y-2">
                                {rewriteSuggestions.map((rs, i) => (
                                    <RewriteCard key={i} rs={rs} />
                                ))}
                                {onApplyToResume && (
                                    <button
                                        onClick={onApplyToResume}
                                        className="w-full mt-2 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all hover:scale-[1.01]"
                                        style={{
                                            background: "linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(139,92,246,0.15) 100%)",
                                            border: "1px solid rgba(99,102,241,0.4)",
                                            color: "#a5b4fc",
                                        }}
                                    >
                                        <Pencil size={12} />
                                        Improve Resume with These Suggestions →
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Keyword Analysis ── */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                            <Zap size={14} className="text-yellow-400" />
                            Keyword Analysis
                        </h4>
                        {/* Tab pills */}
                        <div
                            className="flex rounded-lg overflow-hidden text-[11px] font-semibold"
                            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                        >
                            {(["all", "found", "missing"] as KeywordTab[]).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => { setKwTab(tab); setShowAllKeywords(false); }}
                                    className="px-2.5 py-1.5 capitalize transition-all"
                                    style={{
                                        background: kwTab === tab ? "rgba(99,102,241,0.35)" : "transparent",
                                        color: kwTab === tab ? "#c7d2fe" : "#64748b",
                                    }}
                                >
                                    {tab} {tab === "found" ? `(${found.length})` : tab === "missing" ? `(${missing.length})` : `(${report.keyword_matches.length})`}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Top missing chips */}
                    {kwTab !== "found" && report.top_missing_keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                            {report.top_missing_keywords.map(k => (
                                <span
                                    key={k}
                                    className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full"
                                    style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5" }}
                                >
                                    ✗ {k}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Keyword chips — expandable, with click-to-expand context */}
                    <div className="flex flex-wrap gap-1.5">
                        {visibleKeywords.map((km) => (
                            <KeywordChip key={km.keyword} km={km} />
                        ))}
                    </div>

                    {displayed.length > 24 && (
                        <button
                            onClick={() => setShowAllKeywords(v => !v)}
                            className="mt-2 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
                        >
                            {showAllKeywords
                                ? <><ChevronUp size={11} /> Show less</>
                                : <><ChevronDown size={11} /> Show all {displayed.length} keywords</>
                            }
                        </button>
                    )}
                </div>

                {/* ── Section Feedback ── */}
                <div>
                    <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-3">
                        <TrendingUp size={14} className="text-blue-400" />
                        Section-by-Section Analysis
                    </h4>
                    <div className="space-y-2">
                        {report.section_feedback.map((sf, i) => (
                            <SectionCard
                                key={i}
                                sf={sf}
                                delta={previousReport ? (sf.score - (prevSections[sf.section] ?? sf.score)) : undefined}
                            />
                        ))}
                    </div>
                </div>

                {/* ── Formatting Flags ── */}
                {report.formatting_flags.length > 0 && (
                    <div>
                        <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-3">
                            <AlertTriangle size={14} className="text-amber-400" />
                            Formatting Flags
                        </h4>
                        <div className="space-y-1.5">
                            {report.formatting_flags.map((f, i) => (
                                <div
                                    key={i}
                                    className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs text-amber-300"
                                    style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderLeft: "3px solid #f59e0b" }}
                                >
                                    <AlertTriangle size={11} className="text-amber-400 mt-0.5 flex-shrink-0" />
                                    {f}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Strengths & Improvements ── */}
                <div className="grid grid-cols-2 gap-4">
                    <div
                        className="rounded-xl p-4"
                        style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)" }}
                    >
                        <p className="text-xs font-bold uppercase tracking-widest text-green-400 mb-3 flex items-center gap-1.5">
                            <CheckCircle2 size={12} /> Strengths
                        </p>
                        <ul className="space-y-1.5">
                            {report.strengths.map((s, i) => (
                                <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5">
                                    <span className="text-green-500 mt-0.5">•</span>
                                    {s}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div
                        className="rounded-xl p-4"
                        style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}
                    >
                        <p className="text-xs font-bold uppercase tracking-widest text-red-400 mb-3 flex items-center gap-1.5">
                            <XCircle size={12} /> To Improve
                        </p>
                        <ul className="space-y-1.5">
                            {report.improvements.map((s, i) => (
                                <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5">
                                    <span className="text-red-500 mt-0.5">•</span>
                                    {s}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                {/* ── Score Comparison (if previous report exists) ── */}
                {previousReport && (
                    <div
                        className="rounded-xl p-4 space-y-3"
                        style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)" }}
                    >
                        <h4 className="text-xs font-bold uppercase tracking-widest text-indigo-400 flex items-center gap-1.5">
                            <BarChart3 size={12} />
                            vs. Previous Run
                        </h4>
                        <div className="flex items-center gap-4 flex-wrap text-sm">
                            <div className="text-center">
                                <div className="text-lg font-black" style={{ color: scoreColor(previousReport.ats_score) }}>{previousReport.ats_score}</div>
                                <div className="text-[10px] text-slate-500">Before</div>
                            </div>
                            <ChevronRight size={16} className="text-slate-600" />
                            <div className="text-center">
                                <div className="text-lg font-black" style={{ color: scoreColor(report.ats_score) }}>{report.ats_score}</div>
                                <div className="text-[10px] text-slate-500">Now</div>
                            </div>
                            <div
                                className="px-3 py-1 rounded-full text-xs font-bold"
                                style={{
                                    background: scoreDelta! >= 0 ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                                    color: scoreDelta! >= 0 ? "#86efac" : "#fca5a5",
                                    border: `1px solid ${scoreDelta! >= 0 ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                                }}
                            >
                                {scoreDelta! >= 0 ? "+" : ""}{scoreDelta} pts
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
