"use client";

import React, { useState } from "react";
import {
    BarChart2, BookOpen, Wrench, Zap, Megaphone,
    Loader2, Copy, Check, ChevronRight, AlertTriangle,
    TrendingUp, TrendingDown, Star, Shield, Info,
    CheckCircle, XCircle, Minus,
} from "lucide-react";
import type { ProjectVerificationResult } from "./ProjectCard";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScoreDimension {
    name: string;
    score: number;
    rationale: string;
}

interface ScorecardData {
    dimensions: ScoreDimension[];
    aggregate_score: number;
    verdict: string;
    strengths: string[];
    growth_areas: string[];
    error?: string;
}

interface SummaryData {
    what: string;
    how: string;
    why: string;
    one_liner: string;
    readme_used: boolean;
    error?: string;
}

interface TechDebtHotspot {
    name: string;
    file: string;
    complexity: number;
    risk: string;
    suggestion: string;
}

interface TechDebtData {
    overall_health: string;
    health_score: number;
    risk_level: string;
    summary: string;
    hotspots: TechDebtHotspot[];
    quick_wins: string[];
    refactor_priority: string;
    positive_signals: string[];
    stats?: {
        avg_complexity: number;
        high_complexity_pct: number;
        docstring_ratio: number;
        orphan_count: number;
        complexity_buckets: Record<string, number>;
    };
    error?: string;
}

interface SkillSignal {
    skill: string;
    evidence_strength: "Strong" | "Medium" | "Weak";
    proof_point: string;
    interview_angle: string;
}

interface SkillSignalsData {
    signals: SkillSignal[];
    top_skill: string;
    weakest_signal: string;
    overall_signal: string;
    error?: string;
}

interface PitchData {
    pitch: string;
    linkedin_version: string;
    tagline: string;
    tone_note: string;
    error?: string;
}

type DeepDiveTab = "scorecard" | "summary" | "techdebt" | "skills" | "pitch";

interface ProjectDeepDiveProps {
    result: ProjectVerificationResult;
}

// ─── Helper components ────────────────────────────────────────────────────────

function LoadingPanel({ message }: { message: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div className="relative">
                <div className="w-8 h-8 rounded-full border-2 border-cyan-200" />
                <Loader2 className="w-8 h-8 animate-spin text-cyan-500 absolute inset-0" />
            </div>
            <p className="text-xs text-slate-500">{message}</p>
        </div>
    );
}

function ErrorPanel({ message }: { message: string }) {
    return (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-red-100 bg-red-50 text-xs text-red-600">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{message}</span>
        </div>
    );
}

// ─── Score bar for scorecard ──────────────────────────────────────────────────
function DimensionBar({ dim, index }: { dim: ScoreDimension; index: number }) {
    const pct = (dim.score / 10) * 100;
    const color = dim.score >= 8 ? "#10b981" : dim.score >= 6 ? "#6366f1" : dim.score >= 4 ? "#f59e0b" : "#ef4444";
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-slate-600 truncate flex-1">{dim.name}</span>
                <span className="text-[11px] font-bold flex-shrink-0" style={{ color }}>{dim.score}/10</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                        width: `${pct}%`,
                        backgroundColor: color,
                        transitionDelay: `${index * 60}ms`,
                    }}
                />
            </div>
            {dim.rationale && (
                <p className="text-[10px] text-slate-400 italic leading-relaxed">{dim.rationale}</p>
            )}
        </div>
    );
}

// ─── Aggregate score circle ───────────────────────────────────────────────────
function AggregateCircle({ score }: { score: number }) {
    const r = 28;
    const circ = 2 * Math.PI * r;
    const color = score >= 75 ? "#10b981" : score >= 55 ? "#6366f1" : score >= 35 ? "#f59e0b" : "#ef4444";
    const label = score >= 75 ? "Excellent" : score >= 55 ? "Good" : score >= 35 ? "Fair" : "Weak";
    const dash = (score / 100) * circ;
    return (
        <div className="flex flex-col items-center gap-1">
            <div className="relative" style={{ width: 72, height: 72 }}>
                <svg width={72} height={72}>
                    <circle cx={36} cy={36} r={r} fill="none" stroke="#e2e8f0" strokeWidth={7} />
                    <circle cx={36} cy={36} r={r} fill="none" stroke={color} strokeWidth={7}
                        strokeLinecap="round"
                        strokeDasharray={`${dash} ${circ - dash}`}
                        transform="rotate(-90,36,36)"
                        style={{ transition: "stroke-dasharray 1s cubic-bezier(0.4,0,0.2,1)" }}
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-sm font-black tabular-nums" style={{ color }}>{score}</span>
                    <span className="text-[8px] text-slate-400 font-semibold">/ 100</span>
                </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${color}18`, color }}>{label}</span>
        </div>
    );
}

// ─── Evidence strength badge ──────────────────────────────────────────────────
function EvidenceBadge({ strength }: { strength: "Strong" | "Medium" | "Weak" }) {
    const cfg = {
        Strong: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle className="w-3 h-3" /> },
        Medium: { cls: "bg-amber-50 text-amber-700 border-amber-200", icon: <Minus className="w-3 h-3" /> },
        Weak:   { cls: "bg-red-50 text-red-600 border-red-200",     icon: <XCircle className="w-3 h-3" /> },
    }[strength];
    return (
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${cfg.cls}`}>
            {cfg.icon}
            {strength}
        </span>
    );
}

// ─── Risk level badge ─────────────────────────────────────────────────────────
function RiskBadge({ level }: { level: string }) {
    const cfg: Record<string, string> = {
        Low:      "bg-emerald-50 text-emerald-700 border-emerald-200",
        Medium:   "bg-amber-50 text-amber-700 border-amber-200",
        High:     "bg-orange-50 text-orange-700 border-orange-200",
        Critical: "bg-red-50 text-red-700 border-red-200",
    };
    return (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg[level] ?? "bg-slate-50 text-slate-600 border-slate-200"}`}>
            {level} Risk
        </span>
    );
}

// ─── Health score bar ─────────────────────────────────────────────────────────
function HealthBar({ score }: { score: number }) {
    const color = score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
    return (
        <div className="space-y-1">
            <div className="flex justify-between items-center">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Code Health</span>
                <span className="text-[11px] font-bold" style={{ color }}>{score}/100</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score}%`, backgroundColor: color }} />
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProjectDeepDive({ result }: ProjectDeepDiveProps) {
    const [activeTab, setActiveTab] = useState<DeepDiveTab>("scorecard");

    // Per-tab state: data + loading + error
    const [scorecardData, setScorecardData] = useState<ScorecardData | null>(null);
    const [scorecardLoading, setScorecardLoading] = useState(false);
    const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [techDebtData, setTechDebtData] = useState<TechDebtData | null>(null);
    const [techDebtLoading, setTechDebtLoading] = useState(false);
    const [skillsData, setSkillsData] = useState<SkillSignalsData | null>(null);
    const [skillsLoading, setSkillsLoading] = useState(false);
    const [pitchData, setPitchData] = useState<PitchData | null>(null);
    const [pitchLoading, setPitchLoading] = useState(false);

    // Copy state for pitch
    const [pitchCopied, setPitchCopied] = useState<"pitch" | "linkedin" | null>(null);

    const isNotIngested = result.status === "Repo Not Ingested";

    const handleTabClick = async (tab: DeepDiveTab) => {
        setActiveTab(tab);

        // Lazy-load: only fetch if not already loaded
        if (tab === "scorecard" && !scorecardData && !scorecardLoading) {
            setScorecardLoading(true);
            try {
                const res = await fetch("/api/projects/deep-dive/scorecard", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        project_name: result.name,
                        tech_stack: result.tech_stack,
                        matched_repo_id: result.matched_repo_id,
                        matched_repo_name: result.matched_repo_name,
                        overall_score: result.overall_score,
                        tech_coverage_score: result.tech_coverage_score,
                        architecture_score: result.architecture_score,
                        claim_support_score: result.claim_support_score,
                        reasoning: result.reasoning,
                        bullet_verdicts: result.bullet_verdicts,
                        tech_coverage: result.tech_coverage,
                    }),
                });
                setScorecardData(await res.json());
            } catch {
                setScorecardData({ dimensions: [], aggregate_score: 0, verdict: "", strengths: [], growth_areas: [], error: "Failed to generate scorecard." });
            } finally {
                setScorecardLoading(false);
            }
        }

        if (tab === "summary" && !summaryData && !summaryLoading) {
            setSummaryLoading(true);
            try {
                const res = await fetch("/api/projects/deep-dive/summary", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        project_name: result.name,
                        tech_stack: result.tech_stack,
                        bullet_claims: result.bullet_verdicts.map((v: any) => v.claim),
                        matched_repo_id: result.matched_repo_id,
                        matched_repo_name: result.matched_repo_name,
                        repo_github_url: result.repo_github_url,
                    }),
                });
                setSummaryData(await res.json());
            } catch {
                setSummaryData({ what: "", how: "", why: "", one_liner: "", readme_used: false, error: "Failed to generate summary." });
            } finally {
                setSummaryLoading(false);
            }
        }

        if (tab === "techdebt" && !techDebtData && !techDebtLoading) {
            setTechDebtLoading(true);
            try {
                const res = await fetch("/api/projects/deep-dive/tech-debt", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        matched_repo_id: result.matched_repo_id,
                        matched_repo_name: result.matched_repo_name,
                        tech_stack: result.tech_stack,
                    }),
                });
                setTechDebtData(await res.json());
            } catch {
                setTechDebtData({ overall_health: "Unknown", health_score: 0, risk_level: "Unknown", summary: "", hotspots: [], quick_wins: [], refactor_priority: "", positive_signals: [], error: "Failed to generate tech debt analysis." });
            } finally {
                setTechDebtLoading(false);
            }
        }

        if (tab === "skills" && !skillsData && !skillsLoading) {
            setSkillsLoading(true);
            try {
                const res = await fetch("/api/projects/deep-dive/skill-signals", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        project_name: result.name,
                        tech_stack: result.tech_stack,
                        bullet_verdicts: result.bullet_verdicts,
                        reasoning: result.reasoning,
                        all_evidence_node_ids: result.all_evidence_node_ids ?? [],
                        matched_repo_name: result.matched_repo_name,
                    }),
                });
                setSkillsData(await res.json());
            } catch {
                setSkillsData({ signals: [], top_skill: "", weakest_signal: "", overall_signal: "", error: "Failed to extract skill signals." });
            } finally {
                setSkillsLoading(false);
            }
        }

        if (tab === "pitch" && !pitchData && !pitchLoading) {
            setPitchLoading(true);
            try {
                const res = await fetch("/api/projects/deep-dive/recruiter-pitch", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        project_name: result.name,
                        tech_stack: result.tech_stack,
                        overall_score: result.overall_score,
                        status: result.status,
                        bullet_verdicts: result.bullet_verdicts,
                        reasoning: result.reasoning,
                        matched_repo_name: result.matched_repo_name,
                    }),
                });
                setPitchData(await res.json());
            } catch {
                setPitchData({ pitch: "", linkedin_version: "", tagline: "", tone_note: "", error: "Failed to generate pitch." });
            } finally {
                setPitchLoading(false);
            }
        }
    };

    const copyText = (text: string, key: "pitch" | "linkedin") => {
        navigator.clipboard.writeText(text).then(() => {
            setPitchCopied(key);
            setTimeout(() => setPitchCopied(null), 2000);
        });
    };

    // Auto-load the first available tab
    React.useEffect(() => {
        // For Repo Not Ingested, scorecard and techdebt need a repo — start on Summary instead
        handleTabClick(isNotIngested ? "summary" : "scorecard");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const tabs: { id: DeepDiveTab; icon: React.ReactNode; label: string; disabled?: boolean }[] = [
        { id: "scorecard", icon: <BarChart2 className="w-3.5 h-3.5" />, label: "Score Card", disabled: isNotIngested },
        { id: "summary",   icon: <BookOpen className="w-3.5 h-3.5" />,  label: "Summary" },
        { id: "techdebt",  icon: <Wrench className="w-3.5 h-3.5" />,    label: "Tech Debt", disabled: isNotIngested },
        { id: "skills",    icon: <Zap className="w-3.5 h-3.5" />,       label: "Skill Signals" },
        { id: "pitch",     icon: <Megaphone className="w-3.5 h-3.5" />, label: "Pitch" },
    ];

    return (
        <div className="rounded-xl border border-cyan-200 bg-gradient-to-b from-cyan-50/40 to-white overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-cyan-100 bg-gradient-to-r from-cyan-50 to-sky-50">
                <div className="w-5 h-5 rounded-md bg-gradient-to-br from-cyan-500 to-sky-600 flex items-center justify-center flex-shrink-0">
                    <BarChart2 className="w-3 h-3 text-white" />
                </div>
                <span className="text-[11px] font-bold text-cyan-800 uppercase tracking-wide">Project Deep Dive</span>
                {isNotIngested && (
                    <span className="ml-auto text-[10px] text-slate-400 italic">Some tabs need an ingested repo</span>
                )}
            </div>

            {/* Sub-tab bar */}
            <div className="flex border-b border-slate-100 bg-slate-50/60 overflow-x-auto">
                {tabs.map(t => (
                    <button
                        key={t.id}
                        id={`deep-dive-tab-${t.id}`}
                        disabled={t.disabled}
                        onClick={() => !t.disabled && handleTabClick(t.id)}
                        className={`flex items-center gap-1.5 px-3.5 py-2.5 text-[11px] font-semibold border-b-2 transition-all duration-150 whitespace-nowrap flex-shrink-0 ${
                            t.disabled
                                ? "border-transparent text-slate-300 cursor-not-allowed"
                                : activeTab === t.id
                                ? "border-cyan-500 text-cyan-700 bg-white"
                                : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-white/60"
                        }`}
                    >
                        {t.icon}
                        {t.label}
                        {t.disabled && <span className="text-[9px] text-slate-300 ml-0.5">(needs repo)</span>}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div className="p-4">

                {/* ── Score Card ─────────────────────────────────────────── */}
                {activeTab === "scorecard" && (
                    isNotIngested ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-400">
                            <BarChart2 className="w-8 h-8 text-slate-300" />
                            <p className="text-xs font-medium">Ingest the repository to generate a scorecard</p>
                        </div>
                    ) :
                    scorecardLoading ? <LoadingPanel message="Generating 10-dimension scorecard…" /> :
                    scorecardData?.error ? <ErrorPanel message={scorecardData.error} /> :
                    scorecardData ? (
                        <div className="space-y-4">
                            {/* Aggregate + verdict */}
                            <div className="flex items-start gap-4 p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                                <AggregateCircle score={scorecardData.aggregate_score} />
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Overall Verdict</p>
                                    <p className="text-xs text-slate-700 leading-relaxed">{scorecardData.verdict}</p>
                                </div>
                            </div>

                            {/* 10 dimensions */}
                            <div className="space-y-3">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">10-Dimension Rating</p>
                                {scorecardData.dimensions.map((dim, i) => (
                                    <DimensionBar key={dim.name} dim={dim} index={i} />
                                ))}
                            </div>

                            {/* Strengths + Growth areas */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {scorecardData.strengths.length > 0 && (
                                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 space-y-1.5">
                                        <div className="flex items-center gap-1.5">
                                            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                                            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Strengths</p>
                                        </div>
                                        {scorecardData.strengths.map((s, i) => (
                                            <div key={i} className="flex items-start gap-1.5">
                                                <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0 mt-0.5" />
                                                <p className="text-[11px] text-emerald-800 leading-relaxed">{s}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {scorecardData.growth_areas.length > 0 && (
                                    <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3 space-y-1.5">
                                        <div className="flex items-center gap-1.5">
                                            <TrendingDown className="w-3.5 h-3.5 text-amber-500" />
                                            <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Growth Areas</p>
                                        </div>
                                        {scorecardData.growth_areas.map((g, i) => (
                                            <div key={i} className="flex items-start gap-1.5">
                                                <ChevronRight className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
                                                <p className="text-[11px] text-amber-800 leading-relaxed">{g}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : null
                )}

                {/* ── Summary ────────────────────────────────────────────── */}
                {activeTab === "summary" && (
                    summaryLoading ? <LoadingPanel message="Fetching README & generating project summary…" /> :
                    summaryData?.error ? <ErrorPanel message={summaryData.error} /> :
                    summaryData ? (
                        <div className="space-y-4">
                            {/* One-liner + README badge */}
                            <div className="p-3 rounded-xl border border-sky-100 bg-sky-50/60">
                                <div className="flex items-center gap-2 mb-1.5">
                                    <Star className="w-3.5 h-3.5 text-sky-500" />
                                    <p className="text-[10px] font-bold text-sky-700 uppercase tracking-wide">One-Liner</p>
                                    {summaryData.readme_used && (
                                        <span className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-semibold">
                                            <CheckCircle className="w-2.5 h-2.5" /> README used
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs font-semibold text-sky-900 leading-relaxed italic">"{summaryData.one_liner}"</p>
                            </div>

                            {/* What */}
                            {summaryData.what && (
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">What it does</p>
                                    <p className="text-xs text-slate-700 leading-relaxed">{summaryData.what}</p>
                                </div>
                            )}

                            {/* How */}
                            {summaryData.how && (
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">How it works</p>
                                    <p className="text-xs text-slate-700 leading-relaxed">{summaryData.how}</p>
                                </div>
                            )}

                            {/* Why */}
                            {summaryData.why && (
                                <div className="p-3 rounded-xl border border-violet-100 bg-violet-50/60 space-y-1">
                                    <p className="text-[10px] font-bold text-violet-600 uppercase tracking-widest">Why it matters (hiring lens)</p>
                                    <p className="text-xs text-violet-900 leading-relaxed">{summaryData.why}</p>
                                </div>
                            )}
                        </div>
                    ) : null
                )}

                {/* ── Tech Debt ──────────────────────────────────────────── */}
                {activeTab === "techdebt" && (
                    isNotIngested ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-400">
                            <Wrench className="w-8 h-8 text-slate-300" />
                            <p className="text-xs font-medium">Ingest the repository to see tech debt analysis</p>
                        </div>
                    ) :
                    techDebtLoading ? <LoadingPanel message="Analysing code complexity & tech debt…" /> :
                    techDebtData?.error ? <ErrorPanel message={techDebtData.error} /> :
                    techDebtData ? (
                        <div className="space-y-4">
                            {/* Health overview */}
                            <div className="p-3 rounded-xl border border-slate-100 bg-white shadow-sm space-y-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border border-slate-200 bg-slate-50 text-slate-700">
                                        {techDebtData.overall_health}
                                    </span>
                                    <RiskBadge level={techDebtData.risk_level} />
                                    {techDebtData.stats && (
                                        <span className="text-[10px] text-slate-400">
                                            Avg complexity: {techDebtData.stats.avg_complexity.toFixed(1)} · High-complexity fns: {techDebtData.stats.high_complexity_pct}% · Docs: {techDebtData.stats.docstring_ratio}%
                                        </span>
                                    )}
                                </div>
                                <HealthBar score={techDebtData.health_score} />
                                {techDebtData.summary && <p className="text-xs text-slate-600 leading-relaxed">{techDebtData.summary}</p>}
                            </div>

                            {/* Hotspots */}
                            {techDebtData.hotspots.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">⚠️ Complexity Hotspots</p>
                                    {techDebtData.hotspots.map((h, i) => (
                                        <div key={i} className="rounded-xl border border-orange-100 bg-orange-50/50 p-3 space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-[11px] font-bold text-orange-800">{h.name}</span>
                                                {h.file && <span className="text-[10px] text-slate-400">in {h.file}</span>}
                                                <span className="ml-auto text-[10px] font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded">
                                                    CC: {h.complexity}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-orange-700">{h.risk}</p>
                                            {h.suggestion && (
                                                <p className="text-[11px] text-slate-500 italic">💡 {h.suggestion}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Quick wins */}
                            {techDebtData.quick_wins.length > 0 && (
                                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 space-y-1.5">
                                    <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">✅ Quick Wins</p>
                                    {techDebtData.quick_wins.map((w, i) => (
                                        <div key={i} className="flex items-start gap-1.5">
                                            <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0 mt-0.5" />
                                            <p className="text-[11px] text-emerald-800 leading-relaxed">{w}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Positive signals */}
                            {techDebtData.positive_signals.length > 0 && (
                                <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-3 space-y-1.5">
                                    <p className="text-[10px] font-bold text-sky-700 uppercase tracking-widest">🌟 Positive Signals</p>
                                    {techDebtData.positive_signals.map((s, i) => (
                                        <div key={i} className="flex items-start gap-1.5">
                                            <Star className="w-3 h-3 text-sky-400 flex-shrink-0 mt-0.5" />
                                            <p className="text-[11px] text-sky-800 leading-relaxed">{s}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Refactor priority */}
                            {techDebtData.refactor_priority && (
                                <div className="p-3 rounded-xl border border-red-100 bg-red-50/60">
                                    <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest mb-1">🔥 Refactor Priority</p>
                                    <p className="text-[11px] text-red-800 leading-relaxed">{techDebtData.refactor_priority}</p>
                                </div>
                            )}
                        </div>
                    ) : null
                )}

                {/* ── Skill Signals ──────────────────────────────────────── */}
                {activeTab === "skills" && (
                    skillsLoading ? <LoadingPanel message="Extracting demonstrable skill signals…" /> :
                    skillsData?.error ? <ErrorPanel message={skillsData.error} /> :
                    skillsData ? (
                        <div className="space-y-4">
                            {/* Overall signal */}
                            {skillsData.overall_signal && (
                                <div className="p-3 rounded-xl border border-indigo-100 bg-indigo-50/60">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Info className="w-3.5 h-3.5 text-indigo-500" />
                                        <p className="text-[10px] font-bold text-indigo-700 uppercase tracking-wide">Skill Story</p>
                                    </div>
                                    <p className="text-xs text-indigo-900 leading-relaxed">{skillsData.overall_signal}</p>
                                </div>
                            )}

                            {/* Top + Weakest highlights */}
                            <div className="grid grid-cols-2 gap-2">
                                {skillsData.top_skill && (
                                    <div className="p-2.5 rounded-xl border border-emerald-100 bg-emerald-50/60">
                                        <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider mb-0.5">⭐ Strongest Skill</p>
                                        <p className="text-[11px] font-semibold text-emerald-800">{skillsData.top_skill}</p>
                                    </div>
                                )}
                                {skillsData.weakest_signal && (
                                    <div className="p-2.5 rounded-xl border border-amber-100 bg-amber-50/60">
                                        <p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider mb-0.5">⚠️ Weakest Signal</p>
                                        <p className="text-[11px] font-semibold text-amber-800">{skillsData.weakest_signal}</p>
                                    </div>
                                )}
                            </div>

                            {/* Signal cards */}
                            <div className="space-y-2">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Evidence-Backed Skills</p>
                                {skillsData.signals.map((s, i) => (
                                    <div key={i} className="rounded-xl border border-slate-100 bg-white shadow-sm p-3 space-y-1.5">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-xs font-bold text-slate-800">{s.skill}</span>
                                            <EvidenceBadge strength={s.evidence_strength} />
                                        </div>
                                        {s.proof_point && (
                                            <p className="text-[11px] text-slate-600 leading-relaxed">
                                                <span className="font-semibold text-slate-500">Evidence: </span>{s.proof_point}
                                            </p>
                                        )}
                                        {s.interview_angle && (
                                            <div className="flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg bg-violet-50 border border-violet-100">
                                                <Zap className="w-3 h-3 text-violet-400 flex-shrink-0 mt-0.5" />
                                                <p className="text-[10px] text-violet-700 leading-relaxed">{s.interview_angle}</p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null
                )}

                {/* ── Recruiter Pitch ────────────────────────────────────── */}
                {activeTab === "pitch" && (
                    pitchLoading ? <LoadingPanel message="Crafting your recruiter-ready pitch…" /> :
                    pitchData?.error ? <ErrorPanel message={pitchData.error} /> :
                    pitchData ? (
                        <div className="space-y-4">
                            {/* Tagline */}
                            {pitchData.tagline && (
                                <div className="p-3 rounded-xl border border-cyan-200 bg-gradient-to-r from-cyan-50 to-sky-50">
                                    <p className="text-[10px] font-bold text-cyan-600 uppercase tracking-widest mb-1">Tagline</p>
                                    <p className="text-sm font-black text-cyan-900 leading-tight">"{pitchData.tagline}"</p>
                                </div>
                            )}

                            {/* Main pitch */}
                            {pitchData.pitch && (
                                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-2">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Interview / Verbal Pitch</p>
                                        <button
                                            onClick={() => copyText(pitchData.pitch, "pitch")}
                                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border border-slate-200 bg-slate-50 text-slate-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition-colors"
                                        >
                                            {pitchCopied === "pitch" ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                                            {pitchCopied === "pitch" ? "Copied!" : "Copy"}
                                        </button>
                                    </div>
                                    <p className="text-xs text-slate-700 leading-relaxed border-l-2 border-cyan-300 pl-3">{pitchData.pitch}</p>
                                </div>
                            )}

                            {/* LinkedIn version */}
                            {pitchData.linkedin_version && (
                                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <Shield className="w-3.5 h-3.5 text-blue-500" />
                                            <p className="text-[10px] font-bold text-blue-700 uppercase tracking-widest">LinkedIn Version</p>
                                        </div>
                                        <button
                                            onClick={() => copyText(pitchData.linkedin_version, "linkedin")}
                                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border border-blue-200 bg-white text-blue-600 hover:bg-blue-100 transition-colors"
                                        >
                                            {pitchCopied === "linkedin" ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                                            {pitchCopied === "linkedin" ? "Copied!" : "Copy"}
                                        </button>
                                    </div>
                                    <p className="text-xs text-blue-900 leading-relaxed">{pitchData.linkedin_version}</p>
                                </div>
                            )}

                            {/* Tone note */}
                            {pitchData.tone_note && (
                                <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-100 bg-amber-50/60">
                                    <Info className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                                    <p className="text-[11px] text-amber-800 leading-relaxed">
                                        <span className="font-bold">Delivery tip: </span>{pitchData.tone_note}
                                    </p>
                                </div>
                            )}
                        </div>
                    ) : null
                )}

            </div>
        </div>
    );
}
