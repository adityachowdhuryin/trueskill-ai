"use client";

import React, { useState, useEffect } from "react";
import {
    CheckCircle, XCircle, AlertCircle, Clock, ChevronDown, ChevronUp,
    GitBranch, Cpu, BarChart2, Layers, ExternalLink, Network,
    RotateCcw, Loader2, Info, ChevronRight, MessageSquare, AlertTriangle,
    Building2, Eye, Check, ClipboardCopy,
} from "lucide-react";
import CodeViewer from "./CodeViewer";
import ProjectDeepDive from "./ProjectDeepDive";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TechCoverageItem {
    tech: string;
    found: boolean;
    evidence_node_ids: string[];
}

export interface BulletVerdict {
    claim: string;
    supported: boolean;
    evidence_nodes: string[];
    missing_evidence_hint?: string;
}

export interface ProjectVerificationResult {
    project_id: string;
    name: string;
    tech_stack: string[];
    status: "Verified" | "Partially Verified" | "Unverified" | "Repo Not Ingested";
    overall_score: number;
    matched_repo_id: string;
    matched_repo_name: string;
    repo_github_url: string;
    match_confidence: number;
    match_reason: string;
    tech_coverage: TechCoverageItem[];
    tech_coverage_score: number;
    architecture_score: number;
    claim_support_score: number;
    tech_found_count: number;
    tech_total_count: number;
    reasoning: string;
    bullet_verdicts: BulletVerdict[];
    all_evidence_node_ids?: string[];
}

export interface IngestedRepo {
    id: string;
    name: string;
}

interface ProjectCardProps {
    result: ProjectVerificationResult;
    index: number;
    forceExpanded?: boolean;
    onShowInGraph?: (ids: string[]) => void;
    ingestedRepos?: IngestedRepo[];
    onReVerify?: (projectId: string, repoId: string) => Promise<void>;
    isReVerifying?: boolean;
    repoIds?: string[];
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
    "Verified":           { bg: "bg-emerald-50",  border: "border-emerald-200", text: "text-emerald-700",  badge: "bg-emerald-100 text-emerald-700 border-emerald-200",  dot: "bg-emerald-500", icon: <CheckCircle className="w-4 h-4" />,  scoreColor: "#10b981" },
    "Partially Verified": { bg: "bg-amber-50",    border: "border-amber-200",   text: "text-amber-700",    badge: "bg-amber-100 text-amber-700 border-amber-200",         dot: "bg-amber-400",   icon: <AlertCircle className="w-4 h-4" />, scoreColor: "#f59e0b" },
    "Unverified":         { bg: "bg-red-50",      border: "border-red-200",     text: "text-red-700",      badge: "bg-red-100 text-red-700 border-red-200",               dot: "bg-red-400",     icon: <XCircle className="w-4 h-4" />,    scoreColor: "#ef4444" },
    "Repo Not Ingested":  { bg: "bg-slate-50",    border: "border-slate-200",   text: "text-slate-500",    badge: "bg-slate-100 text-slate-500 border-slate-200",         dot: "bg-slate-400",   icon: <Clock className="w-4 h-4" />,      scoreColor: "#94a3b8" },
} as const;

// ─── Mini Score Ring ──────────────────────────────────────────────────────────
function ScoreRing({ score, color }: { score: number; color: string }) {
    const r = 14; const circ = 2 * Math.PI * r;
    const [animated, setAnimated] = useState(false);
    useEffect(() => { const t = setTimeout(() => setAnimated(true), 200); return () => clearTimeout(t); }, []);
    const dashLen = animated ? (score / 100) * circ : 0;
    return (
        <div className="relative flex-shrink-0" style={{ width: 38, height: 38 }}>
            <svg width={38} height={38}>
                <circle cx={19} cy={19} r={r} fill="none" stroke="#e2e8f0" strokeWidth={5} />
                <circle cx={19} cy={19} r={r} fill="none" stroke={color} strokeWidth={5}
                    strokeLinecap="round" strokeDasharray={`${dashLen} ${circ - dashLen}`}
                    transform="rotate(-90,19,19)"
                    style={{ transition: "stroke-dasharray 800ms cubic-bezier(0.4,0,0.2,1)" }} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[10px] font-bold tabular-nums" style={{ color }}>{score}</span>
            </div>
        </div>
    );
}

// ─── Score Bar ────────────────────────────────────────────────────────────────
function ScoreBar({ label, value, max, color, delay = 0 }: { label: string; value: number; max: number; color: string; delay?: number }) {
    const pct = Math.round((value / max) * 100);
    return (
        <div className="space-y-1">
            <div className="flex justify-between items-center">
                <span className="text-[11px] font-medium text-slate-600">{label}</span>
                <span className="text-[11px] font-semibold text-slate-700">{value}/{max}</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${pct}%`, backgroundColor: color, transitionDelay: `${delay}ms` }} />
            </div>
        </div>
    );
}

// ─── Confidence Badge ─────────────────────────────────────────────────────────
function ConfidenceBadge({ confidence, reason }: { confidence: number; reason: string }) {
    if (confidence <= 0) return null;
    const isHigh   = confidence >= 0.75;
    const isMedium = confidence >= 0.45;
    const label    = isHigh ? "High Confidence" : isMedium ? "Medium Confidence" : "Low Confidence";
    const cls      = isHigh
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : isMedium
            ? "bg-amber-50 text-amber-700 border-amber-200"
            : "bg-rose-50 text-rose-600 border-rose-200";
    return (
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${cls}`}
            title={reason}>
            <span className={`w-1.5 h-1.5 rounded-full ${isHigh ? "bg-emerald-500" : isMedium ? "bg-amber-400" : "bg-rose-400"}`} />
            {label}
        </span>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProjectCard({
    result, index, forceExpanded, onShowInGraph, ingestedRepos = [], onReVerify, isReVerifying, repoIds = [],
}: ProjectCardProps) {
    const [expanded, setExpanded]           = useState(false);
    const [overrideRepo, setOverrideRepo]   = useState("");
    const [drillTech, setDrillTech]         = useState<string | null>(null);
    const [codeViewerNode, setCodeViewerNode] = useState<string | null>(null);

    // Interview Prep
    const [showInterview, setShowInterview]       = useState(false);
    const [interviewLoading, setInterviewLoading] = useState(false);
    const [interviewData, setInterviewData]       = useState<any>(null);
    const [allCopied, setAllCopied]               = useState(false);
    // Devil's Advocate
    const [showChallenge, setShowChallenge]       = useState(false);
    const [challengeLoading, setChallengeLoading] = useState(false);
    const [challengeText, setChallengeText]       = useState<string | null>(null);
    // Architecture Snapshot
    const [showArch, setShowArch]                 = useState(false);
    const [archLoading, setArchLoading]           = useState(false);
    const [archData, setArchData]                 = useState<any>(null);
    const [archSuggestionsOpen, setArchSuggestionsOpen] = useState(false);
    const [showAllModules, setShowAllModules]           = useState(false);
    // Bullet Explain
    const [bulletExplain, setBulletExplain]       = useState<Record<number, string>>({});
    const [bulletLoading, setBulletLoading]       = useState<Record<number, boolean>>({});
    // Project Deep Dive
    const [showDeepDive, setShowDeepDive]         = useState(false);

    useEffect(() => {
        if (forceExpanded !== undefined) setExpanded(forceExpanded);
    }, [forceExpanded]);

    const handleInterview = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (interviewData) { setShowInterview(v => !v); return; }
        setInterviewLoading(true); setShowInterview(true);
        try {
            const res = await fetch("/api/projects/interview-questions", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    project_name: result.name, tech_stack: result.tech_stack,
                    bullet_claims: result.bullet_verdicts.map(v => v.claim),
                    all_evidence_node_ids: result.all_evidence_node_ids ?? [],
                    reasoning: result.reasoning, matched_repo_name: result.matched_repo_name, num_questions: 6,
                }),
            });
            setInterviewData(await res.json());
        } catch { setInterviewData({ questions: [], error: "Failed to generate questions." }); }
        finally { setInterviewLoading(false); }
    };

    const handleChallenge = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (challengeText) { setShowChallenge(v => !v); return; }
        setChallengeLoading(true); setShowChallenge(true);
        try {
            const res = await fetch("/api/projects/challenge", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    project_name: result.name, tech_stack: result.tech_stack,
                    status: result.status, overall_score: result.overall_score,
                    tech_coverage_score: result.tech_coverage_score,
                    architecture_score: result.architecture_score,
                    claim_support_score: result.claim_support_score,
                    reasoning: result.reasoning, bullet_verdicts: result.bullet_verdicts,
                    match_confidence: result.match_confidence,
                }),
            });
            const d = await res.json();
            setChallengeText(d.challenge ?? "Could not generate challenge.");
        } catch { setChallengeText("Network error — please try again."); }
        finally { setChallengeLoading(false); }
    };

    const handleArchSnapshot = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (archData) { setShowArch(v => !v); return; }
        setArchLoading(true); setShowArch(true);
        try {
            const res = await fetch("/api/projects/architecture-snapshot", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ matched_repo_id: result.matched_repo_id, matched_repo_name: result.matched_repo_name }),
            });
            setArchData(await res.json());
        } catch { setArchData({ error: "Failed to load architecture snapshot." }); }
        finally { setArchLoading(false); }
    };

    const handleBulletExplain = async (e: React.MouseEvent, idx: number, verdict: BulletVerdict) => {
        e.stopPropagation();
        if (bulletExplain[idx]) { setBulletExplain(prev => { const n = {...prev}; delete n[idx]; return n; }); return; }
        setBulletLoading(prev => ({...prev, [idx]: true}));
        try {
            const res = await fetch("/api/projects/explain-missing-bullet", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    project_name: result.name, bullet_claim: verdict.claim, tech_stack: result.tech_stack,
                    matched_repo_name: result.matched_repo_name, missing_evidence_hint: verdict.missing_evidence_hint ?? "",
                }),
            });
            const d = await res.json();
            setBulletExplain(prev => ({...prev, [idx]: d.explanation ?? "No explanation available."}));
        } catch { setBulletExplain(prev => ({...prev, [idx]: "Network error."})); }
        finally { setBulletLoading(prev => ({...prev, [idx]: false})); }
    };

    const handleCopyAll = (e: React.MouseEvent) => {
        e.stopPropagation();
        const qs = (interviewData?.questions ?? [])
            .map((q: any, i: number) => `Q${i+1} [${q.level}]: ${q.question}\nHint: ${q.expected_answer_hint ?? ""}`)
            .join("\n\n");
        navigator.clipboard.writeText(qs).then(() => { setAllCopied(true); setTimeout(() => setAllCopied(false), 2000); });
    };

    const cfg           = STATUS_CONFIG[result.status];
    const isNotIngested = result.status === "Repo Not Ingested";
    const foundCount    = result.tech_found_count ?? result.tech_coverage.filter(t => t.found).length;
    const totalTechs    = result.tech_total_count ?? result.tech_coverage.length;
    const allEvidenceIds = result.tech_coverage.filter(t => t.found).flatMap(t => t.evidence_node_ids);
    const canShowInGraph = onShowInGraph && allEvidenceIds.length > 0;
    const effectiveRepoIds = result.matched_repo_id
        ? [result.matched_repo_id, ...repoIds.filter(id => id !== result.matched_repo_id)]
        : repoIds.length > 0 ? repoIds : [];
    const COMPLEXITY_COLORS: Record<string, string> = { "Low": "#10b981", "Medium": "#6366f1", "High": "#f59e0b", "Very High": "#ef4444" };
    const complexityColor = archData?.complexity_verdict ? COMPLEXITY_COLORS[archData.complexity_verdict] ?? "#94a3b8" : "#94a3b8";


    return (
        <>
        <div className="rounded-2xl border shadow-sm transition-all duration-300 overflow-hidden animate-slide-in-left"
            style={{ animationDelay: `${index * 60}ms` }}>

            {/* ── Header ── */}
            <button
                onClick={() => setExpanded(v => !v)}
                className={`w-full text-left px-5 py-4 flex items-start gap-4 transition-colors hover:bg-slate-50/70 ${cfg.bg} ${cfg.border} border-b`}
            >
                {/* Score ring / status */}
                <div className="flex-shrink-0 flex flex-col items-center gap-0.5 pt-0.5">
                    {!isNotIngested ? (
                        <ScoreRing score={result.overall_score} color={cfg.scoreColor} />
                    ) : (
                        <div className={`${cfg.text} mt-1`}>{cfg.icon}</div>
                    )}
                </div>

                {/* Project name + meta */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-900 text-sm leading-tight">{result.name}</h3>
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {!isNotIngested && (
                                <ConfidenceBadge confidence={result.match_confidence} reason={result.match_reason} />
                            )}
                            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border flex-shrink-0 ${cfg.badge}`}>
                                {result.status}
                            </span>
                        </div>
                    </div>

                    {/* Matched repo + match reason */}
                    {!isNotIngested && result.matched_repo_name && (
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <GitBranch className="w-3 h-3 text-slate-400 flex-shrink-0" />
                            {result.repo_github_url ? (
                                <a href={result.repo_github_url} target="_blank" rel="noopener noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    className="text-[11px] font-medium text-indigo-600 hover:underline flex items-center gap-0.5">
                                    {result.matched_repo_name}
                                    <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                            ) : (
                                <span className="text-[11px] font-medium text-slate-700">{result.matched_repo_name}</span>
                            )}
                            {result.match_reason && (
                                <span className="text-[10px] text-slate-400">· {result.match_reason}</span>
                            )}
                        </div>
                    )}
                    {isNotIngested && result.match_reason && (
                        <p className="text-[11px] text-slate-400 mt-1 italic">{result.match_reason || "No matching ingested repo found"}</p>
                    )}

                    {/* Tech chips */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        {result.tech_coverage.map(item => (
                            <span key={item.tech}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                                    isNotIngested ? "bg-slate-50 text-slate-500 border-slate-200"
                                    : item.found ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-red-50 text-red-600 border-red-200"
                                }`}>
                                {!isNotIngested && (item.found ? <CheckCircle className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />)}
                                {item.tech}
                                {item.found && item.evidence_node_ids.length > 0 && (
                                    <span className="text-[8px] bg-emerald-100 text-emerald-700 px-1 rounded font-bold">
                                        {item.evidence_node_ids.length}
                                    </span>
                                )}
                            </span>
                        ))}
                    </div>
                </div>

                <div className="flex-shrink-0 text-slate-400 pt-0.5">
                    {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
            </button>

            {/* ── Expanded Body ── */}
            {expanded && (
                <div className="bg-white px-5 py-4 space-y-5">

                    {/* Score Breakdown + View in Graph */}
                    {!isNotIngested && (
                        <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-100">
                            <div className="flex items-center gap-2 mb-1">
                                <BarChart2 className="w-3.5 h-3.5 text-indigo-400" />
                                <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Score Breakdown</span>
                                <span className="ml-auto text-[11px] font-bold text-slate-700">{result.overall_score}/100</span>
                                {canShowInGraph && (
                                    <button onClick={() => onShowInGraph!(allEvidenceIds)}
                                        className="flex items-center gap-1 text-[10px] text-indigo-600 font-semibold hover:text-indigo-800 border border-indigo-200 rounded-lg px-2 py-0.5 hover:bg-indigo-50 transition-colors">
                                        <Network className="w-3 h-3" />View in Graph
                                    </button>
                                )}
                            </div>
                            <ScoreBar label="Tech Stack Coverage" value={result.tech_coverage_score} max={40} color="#6366f1" delay={0} />
                            <ScoreBar label="Architecture Assessment" value={result.architecture_score} max={35} color="#f59e0b" delay={80} />
                            <ScoreBar label="Claim Support" value={result.claim_support_score} max={25} color="#8b5cf6" delay={160} />
                        </div>
                    )}

                    {/* Tech Coverage Detail with drill-down */}
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                            <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Tech Stack Coverage</span>
                            {!isNotIngested && (
                                <span className="ml-auto text-[11px] font-medium text-slate-500">{foundCount}/{totalTechs} found</span>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {result.tech_coverage.map(item => (
                                <div key={item.tech} className="flex flex-col">
                                    <button
                                        onClick={() => item.found && item.evidence_node_ids.length > 0 && setDrillTech(drillTech === item.tech ? null : item.tech)}
                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-all ${
                                            isNotIngested ? "bg-slate-50 text-slate-500 border-slate-200 cursor-default"
                                            : item.found ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 cursor-pointer"
                                            : "bg-red-50 text-red-600 border-red-200 cursor-default"
                                        }`}
                                    >
                                        {!isNotIngested && (item.found ? <CheckCircle className="w-3 h-3 flex-shrink-0" /> : <XCircle className="w-3 h-3 flex-shrink-0" />)}
                                        <span className="font-medium">{item.tech}</span>
                                        {item.found && item.evidence_node_ids.length > 0 && (
                                            <>
                                                <span className="text-[9px] bg-emerald-100 text-emerald-600 px-1 rounded">{item.evidence_node_ids.length} node{item.evidence_node_ids.length > 1 ? "s" : ""}</span>
                                                <ChevronRight className={`w-3 h-3 transition-transform ${drillTech === item.tech ? "rotate-90" : ""}`} />
                                            </>
                                        )}
                                    </button>
                                    {drillTech === item.tech && item.evidence_node_ids.length > 0 && (
                                        <div className="mt-1 ml-2 pl-2 border-l-2 border-emerald-200 space-y-0.5">
                                            {item.evidence_node_ids.slice(0, 5).map((nid, j) => (
                                                <div key={j} className="flex items-center gap-2">
                                                    <p className="text-[10px] text-slate-500 font-mono truncate max-w-xs flex-1">
                                                        {nid.includes(":") ? `${nid.split(":")[0].split("/").pop()} · ${nid.split(":").slice(1).join(":")}` : nid}
                                                    </p>
                                                    <button
                                                        onClick={e => { e.stopPropagation(); setCodeViewerNode(nid); }}
                                                        className="flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-600 text-[9px] font-semibold hover:bg-indigo-100"
                                                    >
                                                        <Eye className="w-2.5 h-2.5" /> View
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* AI Architecture Assessment */}
                    {result.reasoning && (
                        <div className="bg-indigo-50/60 rounded-xl p-3.5 border border-indigo-100">
                            <div className="flex items-center gap-2 mb-2">
                                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                                <span className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wide">AI Architecture Assessment</span>
                            </div>
                            <p className="text-xs text-slate-700 leading-relaxed">{result.reasoning}</p>
                        </div>
                    )}

                    {/* Bullet Claim Verdicts */}
                    {result.bullet_verdicts && result.bullet_verdicts.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <CheckCircle className="w-3.5 h-3.5 text-indigo-400" />
                                <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Claim Verdicts</span>
                                <span className="ml-auto text-[11px] text-slate-500">
                                    {result.bullet_verdicts.filter(v => v.supported).length}/{result.bullet_verdicts.length} supported
                                </span>
                            </div>
                            <div className="space-y-2">
                                {result.bullet_verdicts.map((verdict, i) => (
                                    <div key={i} className={`rounded-lg border text-xs ${
                                        isNotIngested ? "bg-slate-50 border-slate-100"
                                        : verdict.supported ? "bg-emerald-50/80 border-emerald-100"
                                        : "bg-red-50/70 border-red-100"
                                    }`}>
                                        <div className="flex items-start gap-2.5 p-2.5">
                                            <span className="flex-shrink-0 mt-0.5">
                                                {isNotIngested ? <Clock className="w-3.5 h-3.5 text-slate-400" />
                                                    : verdict.supported ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                                    : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                                            </span>
                                            <span className="leading-relaxed text-slate-700">{verdict.claim}</span>
                                            {verdict.evidence_nodes && verdict.evidence_nodes.length > 0 && (
                                                <span className="flex-shrink-0 ml-auto text-[9px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded font-medium">
                                                    {verdict.evidence_nodes.length} node{verdict.evidence_nodes.length > 1 ? "s" : ""}
                                                </span>
                                            )}
                                        </div>
                                        {/* Missing evidence hint for unsupported bullets */}
                                        {!verdict.supported && verdict.missing_evidence_hint && (
                                            <div className="flex items-start gap-1.5 px-2.5 pb-2 -mt-1">
                                                <Info className="w-3 h-3 text-slate-400 flex-shrink-0 mt-0.5" />
                                                <p className="text-[10px] text-slate-400 italic">{verdict.missing_evidence_hint}</p>
                                            </div>
                                        )}
                                        {/* Bullet Explain Why button */}
                                        {!verdict.supported && !isNotIngested && (
                                            <div className="px-2.5 pb-2.5">
                                                <button
                                                    onClick={e => handleBulletExplain(e, i, verdict)}
                                                    disabled={bulletLoading[i]}
                                                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-lg border border-violet-200 bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors disabled:opacity-50"
                                                >
                                                    {bulletLoading[i] ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Info className="w-2.5 h-2.5" />}
                                                    {bulletExplain[i] ? "Hide explanation" : "💡 Explain why →"}
                                                </button>
                                                {bulletExplain[i] && (
                                                    <div className="mt-2 p-2.5 rounded-lg border border-violet-100 bg-violet-50/60 text-[11px] text-violet-900 leading-relaxed">
                                                        {bulletExplain[i]}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Architecture Snapshot ── */}
                    {!isNotIngested && (
                        <div className="space-y-2">
                            <button
                                onClick={handleArchSnapshot}
                                disabled={archLoading}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold w-full justify-center transition-all duration-200 hover:scale-[1.01] active:scale-95 disabled:opacity-60"
                                style={{
                                    background: showArch ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "linear-gradient(135deg,rgba(99,102,241,0.07),rgba(139,92,246,0.07))",
                                    border: "1.5px solid rgba(99,102,241,0.3)",
                                    color: showArch ? "white" : "#6366f1",
                                    boxShadow: showArch ? "0 4px 12px rgba(99,102,241,0.25)" : "none",
                                }}
                            >
                                {archLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Building2 className="w-3.5 h-3.5" />}
                                {archLoading ? "Analysing codebase…" : showArch && archData ? "Hide Architecture Snapshot" : "🏗️ Architecture Snapshot"}
                            </button>
                            {showArch && archData && !archLoading && (
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 text-xs">
                                    {archData.error ? (
                                        <p className="text-red-500">{archData.error}</p>
                                    ) : (
                                        <>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {archData.architecture_style && (
                                                    <span className="px-2 py-0.5 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 text-[10px] font-bold">{archData.architecture_style}</span>
                                                )}
                                                {archData.complexity_verdict && (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: `${complexityColor}18`, color: complexityColor, border: `1px solid ${complexityColor}44` }}>
                                                        Complexity: {archData.complexity_verdict}
                                                    </span>
                                                )}
                                            </div>
                                            {archData.summary && <p className="text-slate-700 leading-relaxed">{archData.summary}</p>}
                                            {archData.modules?.length > 0 && (
                                                <div className="space-y-1">
                                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Modules</p>
                                                    {archData.modules.slice(0, showAllModules ? undefined : 4).map((m: any, i: number) => (
                                                        <div key={i} className="flex gap-2 items-start">
                                                            <span className="font-semibold text-slate-700 shrink-0">{m.name}:</span>
                                                            <span className="text-slate-500">{m.role}</span>
                                                        </div>
                                                    ))}
                                                    {archData.modules?.length > 4 && (
                                                        <button
                                                            onClick={e => { e.stopPropagation(); setShowAllModules(v => !v); }}
                                                            className="flex items-center gap-1 text-[10px] font-semibold text-indigo-500 hover:text-indigo-700 transition-colors mt-1"
                                                        >
                                                            <ChevronRight className={`w-3 h-3 transition-transform ${showAllModules ? "rotate-90" : ""}`} />
                                                            {showAllModules ? "Show less" : `Show all ${archData.modules.length} modules`}
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                            {archData.hotspot_analysis && (
                                                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-100 text-amber-800">
                                                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 mb-1">⚡ Hotspot</p>
                                                    <p className="leading-relaxed">{archData.hotspot_analysis}</p>
                                                </div>
                                            )}
                                            {archData.improvement_suggestions?.length > 0 && (
                                                <div>
                                                    <button onClick={e => { e.stopPropagation(); setArchSuggestionsOpen(v => !v); }}
                                                        className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-indigo-600">
                                                        <ChevronRight className={`w-3 h-3 transition-transform ${archSuggestionsOpen ? "rotate-90" : ""}`} />
                                                        {archSuggestionsOpen ? "Hide" : "Show"} improvement suggestions
                                                    </button>
                                                    {archSuggestionsOpen && (
                                                        <ul className="mt-1.5 space-y-1 pl-4 list-disc">
                                                            {archData.improvement_suggestions.map((s: string, i: number) => (
                                                                <li key={i} className="text-slate-600">{s}</li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Interview Prep ── */}
                    {!isNotIngested && (
                        <div className="space-y-2">
                            <button
                                onClick={handleInterview}
                                disabled={interviewLoading}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold w-full justify-center transition-all duration-200 hover:scale-[1.01] active:scale-95 disabled:opacity-60"
                                style={{
                                    background: showInterview ? "linear-gradient(135deg,#6366f1,#7c3aed)" : "linear-gradient(135deg,rgba(99,102,241,0.08),rgba(124,58,237,0.08))",
                                    border: "1.5px solid rgba(99,102,241,0.3)",
                                    color: showInterview ? "white" : "#6366f1",
                                    boxShadow: showInterview ? "0 4px 12px rgba(99,102,241,0.3)" : "none",
                                }}
                            >
                                {interviewLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
                                {interviewLoading ? "Generating project interview questions…" : showInterview && interviewData ? "Hide Interview Prep" : "✨ Generate Project Interview Questions"}
                            </button>
                            {showInterview && (
                                <div className="space-y-2.5">
                                    {interviewLoading ? (
                                        <div className="flex flex-col items-center gap-2 py-6">
                                            <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                                            <p className="text-xs text-slate-500">Analysing project architecture & claims…</p>
                                        </div>
                                    ) : (
                                        <>
                                            {interviewData?.interviewer_note && (
                                                <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-indigo-100 bg-indigo-50">
                                                    <span className="text-sm">💡</span>
                                                    <p className="text-[11px] text-indigo-700 italic leading-relaxed">{interviewData.interviewer_note}</p>
                                                </div>
                                            )}
                                            {(interviewData?.questions?.length ?? 0) > 0 && (
                                                <div className="flex items-center justify-between">
                                                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{interviewData.questions.length} Questions</p>
                                                    <button onClick={handleCopyAll} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border border-indigo-200 bg-white text-indigo-600 hover:bg-indigo-50">
                                                        {allCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <ClipboardCopy className="w-3 h-3" />}
                                                        {allCopied ? "Copied!" : "Copy All"}
                                                    </button>
                                                </div>
                                            )}
                                            <div className="space-y-2">
                                                {(interviewData?.questions ?? []).map((q: any, qi: number) => {
                                                    const lvlCls = q.level === "Easy" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : q.level === "Hard" ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200";
                                                    const lvlIcon = q.level === "Easy" ? "🟢" : q.level === "Hard" ? "🔴" : "🟡";
                                                    return (
                                                        <div key={qi} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                                                            <div className="px-4 py-3">
                                                                <div className="flex items-center gap-2 mb-1.5">
                                                                    <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">{qi+1}</div>
                                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${lvlCls}`}>{lvlIcon} {q.level}</span>
                                                                    {q.why_this_question && <span className="text-[10px] text-slate-400 italic line-clamp-1">{q.why_this_question}</span>}
                                                                </div>
                                                                <p className="text-xs font-medium text-slate-800 leading-relaxed">{q.question}</p>
                                                            </div>
                                                            {q.expected_answer_hint && (
                                                                <div className="border-t border-slate-100 px-4 py-2">
                                                                    <p className="text-[11px] text-slate-500 italic leading-relaxed border-l-2 border-indigo-300 pl-2">{q.expected_answer_hint}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            {interviewData?.error && <p className="text-xs text-red-500 px-1">{interviewData.error}</p>}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Devil's Advocate ── */}
                    {!isNotIngested && (
                        <div className="space-y-2">
                            <button
                                onClick={handleChallenge}
                                disabled={challengeLoading}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold w-full justify-center transition-all duration-200 hover:scale-[1.01] active:scale-95 disabled:opacity-60"
                                style={{
                                    background: showChallenge ? "linear-gradient(135deg,#ef4444,#dc2626)" : "linear-gradient(135deg,rgba(239,68,68,0.06),rgba(220,38,38,0.06))",
                                    border: "1.5px solid rgba(239,68,68,0.3)",
                                    color: showChallenge ? "white" : "#ef4444",
                                    boxShadow: showChallenge ? "0 4px 12px rgba(239,68,68,0.25)" : "none",
                                }}
                            >
                                {challengeLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                                {challengeLoading ? "Generating challenge…" : showChallenge && challengeText ? "Hide Challenge" : "🔴 Challenge This Verdict"}
                            </button>
                            {showChallenge && (
                                <div>
                                    {challengeLoading ? (
                                        <div className="flex items-center gap-3 py-3 px-3 rounded-xl bg-red-50 border border-red-100">
                                            <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                                            <p className="text-xs text-red-500">Generating adversarial challenge…</p>
                                        </div>
                                    ) : challengeText ? (
                                        <div className="p-3 rounded-xl border-l-4 border-red-400 border-t border-r border-b border-red-100 bg-red-50/60">
                                            <div className="flex items-center gap-1.5 mb-2">
                                                <AlertTriangle className="w-3 h-3 text-red-500" />
                                                <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Sceptical View</span>
                                            </div>
                                            <p className="text-xs text-red-800 leading-relaxed">{challengeText}</p>
                                        </div>
                                    ) : null}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Project Deep Dive ── */}
                    <div className="space-y-2">
                        <button
                            id={`project-deep-dive-toggle-${result.project_id}`}
                            onClick={() => setShowDeepDive(v => !v)}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold w-full justify-center transition-all duration-200 hover:scale-[1.01] active:scale-95"
                            style={{
                                background: showDeepDive
                                    ? "linear-gradient(135deg,#06b6d4,#0284c7)"
                                    : "linear-gradient(135deg,rgba(6,182,212,0.06),rgba(2,132,199,0.06))",
                                border: "1.5px solid rgba(6,182,212,0.35)",
                                color: showDeepDive ? "white" : "#0891b2",
                                boxShadow: showDeepDive ? "0 4px 14px rgba(6,182,212,0.28)" : "none",
                            }}
                        >
                            <BarChart2 className="w-3.5 h-3.5" />
                            {showDeepDive ? "Hide Deep Dive" : "🔬 Project Deep Dive"}
                        </button>
                        {showDeepDive && (
                            <ProjectDeepDive result={result} />
                        )}
                    </div>

                    {/* Repo Not Ingested CTA */}
                    {isNotIngested && (
                        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                            <Clock className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-xs font-semibold text-amber-800">Repo not yet ingested</p>
                                <p className="text-[11px] text-amber-700 mt-0.5">
                                    To verify this project, ingest its GitHub repository using the <strong>Ingest Repo</strong> button, then re-run project verification.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Manual repo override */}
                    {onReVerify && ingestedRepos.length > 0 && (
                        <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                            <RotateCcw className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            <span className="text-[11px] text-slate-500">Verify against a different repo:</span>
                            <select
                                value={overrideRepo}
                                onChange={e => setOverrideRepo(e.target.value)}
                                className="flex-1 text-[11px] border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 text-slate-600"
                            >
                                <option value="">Select repo…</option>
                                {ingestedRepos.map(r => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                            </select>
                            <button
                                disabled={!overrideRepo || isReVerifying}
                                onClick={() => overrideRepo && onReVerify(result.project_id, overrideRepo)}
                                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-indigo-600 text-white rounded-lg disabled:opacity-40 hover:bg-indigo-700 transition-colors"
                            >
                                {isReVerifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                                Re-verify
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>

        {codeViewerNode && (
            <CodeViewer
                nodeId={codeViewerNode}
                repoIds={effectiveRepoIds}
                fileName={codeViewerNode.includes(":") ? codeViewerNode.split(":")[0].split("/").pop() ?? codeViewerNode : codeViewerNode}
                functionName={codeViewerNode.includes(":") ? codeViewerNode.split(":").slice(1).join(":") : codeViewerNode}
                onClose={() => setCodeViewerNode(null)}
            />
        )}
        </>
    );
}
