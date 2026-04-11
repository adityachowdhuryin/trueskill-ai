"use client";

import { useState } from "react";
import {
    Download, ChevronDown, ChevronUp, CheckCircle2,
    XCircle, AlertTriangle, Zap, TrendingUp, Target,
    Rocket, Pencil, ChevronRight
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface KeywordMatch {
    keyword: string;
    found: boolean;
    context: string;
}

export interface SectionFeedback {
    section: string;
    score: number;
    feedback: string;
    suggestions: string[];
}

export interface PriorityAction {
    rank: number;
    action: string;
    impact: string;
    estimated_gain: number;
    section: string;
}

export interface RewriteSuggestion {
    section: string;
    original_snippet: string;
    rewritten_snippet: string;
    rationale: string;
}

export interface ATSReport {
    ats_score: number;
    keyword_match_score: number;
    format_score: number;
    content_score: number;
    keyword_matches: KeywordMatch[];
    section_feedback: SectionFeedback[];
    top_missing_keywords: string[];
    formatting_flags: string[];
    overall_recommendation: string;
    strengths: string[];
    improvements: string[];
    priority_actions?: PriorityAction[];
    rewrite_suggestions?: RewriteSuggestion[];
}

interface ATSScorePanelProps {
    report: ATSReport;
    candidateName?: string;
    apiBaseUrl?: string;
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

// ─── Circular Gauge ────────────────────────────────────────────────────────────
function CircularGauge({ score }: { score: number }) {
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;
    const color = scoreColor(score);

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
                    style={{ transition: "stroke-dashoffset 1s ease-out, stroke 0.3s" }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black" style={{ color }}>{score}</span>
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>ATS Score</span>
            </div>
        </div>
    );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
function ScoreBar({ label, score }: { label: string; score: number }) {
    const color = scoreColor(score);
    return (
        <div className="space-y-1">
            <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-slate-400">{label}</span>
                <span className="text-sm font-bold" style={{ color }}>{score}%</span>
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

// ─── Priority Action Card ─────────────────────────────────────────────────────
function PriorityActionCard({ action }: { action: PriorityAction }) {
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

// ─── Rewrite Suggestion Card ──────────────────────────────────────────────────
function RewriteCard({ rs }: { rs: RewriteSuggestion }) {
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
                            <p className="text-[10px] font-bold uppercase tracking-widest text-green-400 mb-1.5">After</p>
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

// ─── Section Accordion ────────────────────────────────────────────────────────
function SectionCard({ sf }: { sf: SectionFeedback }) {
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

export default function ATSScorePanel({ report, candidateName = "Candidate", apiBaseUrl = "http://localhost:8000" }: ATSScorePanelProps) {
    const [kwTab, setKwTab] = useState<KeywordTab>("all");
    const [isDownloading, setIsDownloading] = useState(false);
    const [showRewrites, setShowRewrites] = useState(false);

    const found = report.keyword_matches.filter(k => k.found);
    const missing = report.keyword_matches.filter(k => !k.found);
    const displayed = kwTab === "found" ? found : kwTab === "missing" ? missing : report.keyword_matches;

    const priorityActions = report.priority_actions ?? [];
    const rewriteSuggestions = report.rewrite_suggestions ?? [];

    const handleDownload = async () => {
        setIsDownloading(true);
        try {
            const res = await fetch(`${apiBaseUrl}/api/ats-report`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ats_report: report, candidate_name: candidateName }),
            });
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "ats_report.html";
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            console.error("Download failed");
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
                className="px-6 py-4 flex items-center justify-between"
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
                        <p className="text-[11px] text-slate-500 mt-0.5">Resume vs. Job Description Analysis</p>
                    </div>
                </div>
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

            <div className="p-6 space-y-6">
                {/* ── Score Dashboard ── */}
                <div className="flex items-center gap-8 flex-wrap">
                    {/* Circular gauge */}
                    <div className="flex flex-col items-center gap-2">
                        <CircularGauge score={report.ats_score} />
                        <span
                            className="text-xs font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full"
                            style={{ color: scoreColor(report.ats_score), background: scoreBg(report.ats_score) }}
                        >
                            {scoreLabel(report.ats_score)}
                        </span>
                    </div>

                    {/* Sub-score bars */}
                    <div className="flex-1 min-w-48 space-y-4">
                        <ScoreBar label="Keyword Match" score={report.keyword_match_score} />
                        <ScoreBar label="Content Quality" score={report.content_score} />
                        <ScoreBar label="Formatting" score={report.format_score} />
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
                                    onClick={() => setKwTab(tab)}
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

                    {/* Keyword chips grid */}
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                        {displayed.map((km, i) => (
                            <div
                                key={i}
                                title={km.context || undefined}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-default transition-transform hover:scale-105"
                                style={{
                                    background: km.found ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                                    border: `1px solid ${km.found ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                                    color: km.found ? "#86efac" : "#fca5a5",
                                }}
                            >
                                {km.found
                                    ? <CheckCircle2 size={10} />
                                    : <XCircle size={10} />
                                }
                                {km.keyword}
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Section Feedback ── */}
                <div>
                    <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-3">
                        <TrendingUp size={14} className="text-blue-400" />
                        Section-by-Section Analysis
                    </h4>
                    <div className="space-y-2">
                        {report.section_feedback.map((sf, i) => (
                            <SectionCard key={i} sf={sf} />
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
                    {/* Strengths */}
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

                    {/* Improvements */}
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
            </div>
        </div>
    );
}
