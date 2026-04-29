"use client";

import { useState, useEffect, useCallback } from "react";
import {
    CheckCircle, XCircle, AlertCircle, ChevronDown,
    Code, FileCode, Copy, Check, MessageSquare, Loader2,
    FileText, Braces, Hash, Eye, EyeOff, ClipboardCopy,
    AlertTriangle, Info,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface VerificationResult {
    claim_id: string;
    topic: string;
    claim_text: string;
    status: "Verified" | "Partially Verified" | "Unverified";
    score: number;
    evidence_node_ids: string[];
    reasoning: string;
    complexity_analysis: string;
}

export interface SkillCardProps {
    result: VerificationResult;
    index?: number;
    forceExpanded?: boolean;
}

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
    "Verified": {
        icon: CheckCircle,
        gradient: "from-emerald-500 to-teal-500",
        bg: "bg-white",
        border: "border-emerald-200",
        hoverBorder: "hover:border-emerald-400",
        accentBar: "bg-emerald-500",
        barColor: "#10b981",
        text: "text-emerald-700",
        badgeBg: "bg-emerald-50",
        badgeText: "text-emerald-700",
        badgeBorder: "border-emerald-200",
        sectionBg: "bg-emerald-50/50",
        scoreText: "text-emerald-600",
    },
    "Partially Verified": {
        icon: AlertCircle,
        gradient: "from-amber-500 to-orange-400",
        bg: "bg-white",
        border: "border-amber-200",
        hoverBorder: "hover:border-amber-400",
        accentBar: "bg-amber-500",
        barColor: "#f59e0b",
        text: "text-amber-700",
        badgeBg: "bg-amber-50",
        badgeText: "text-amber-700",
        badgeBorder: "border-amber-200",
        sectionBg: "bg-amber-50/50",
        scoreText: "text-amber-600",
    },
    "Unverified": {
        icon: XCircle,
        gradient: "from-red-500 to-rose-400",
        bg: "bg-white",
        border: "border-red-200",
        hoverBorder: "hover:border-red-300",
        accentBar: "bg-red-400",
        barColor: "#ef4444",
        text: "text-red-600",
        badgeBg: "bg-red-50",
        badgeText: "text-red-600",
        badgeBorder: "border-red-200",
        sectionBg: "bg-red-50/40",
        scoreText: "text-red-500",
    },
} as const;

// ─── Score bar ────────────────────────────────────────────────────────────────
function ScoreBar({ score, color, delay = 0 }: { score: number; color: string; delay?: number }) {
    const [width, setWidth] = useState(0);

    useEffect(() => {
        const t = setTimeout(() => setWidth(score), 120 + delay);
        return () => clearTimeout(t);
    }, [score, delay]);

    const bgColor =
        score >= 70 ? "#10b981" :
        score >= 40 ? "#f59e0b" : "#ef4444";

    return (
        <div className="flex items-center gap-2.5 w-full">
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                        width: `${width}%`,
                        background: `linear-gradient(90deg, ${bgColor}cc, ${bgColor})`,
                        boxShadow: `0 0 6px ${bgColor}55`,
                    }}
                />
            </div>
            <span className="text-xs font-bold tabular-nums w-8 text-right" style={{ color: bgColor }}>
                {score}
            </span>
        </div>
    );
}

// ─── Evidence node parser ─────────────────────────────────────────────────────
interface ParsedNode {
    file: string;
    name: string;
    ext: string;
    raw: string;
}

function parseNodeId(nodeId: string): ParsedNode {
    // Format: "some/path/file.py:function_name" or just "function_name"
    const colonIdx = nodeId.lastIndexOf(":");
    let file = "";
    let name = nodeId;

    if (colonIdx > 0) {
        file = nodeId.slice(0, colonIdx);
        name = nodeId.slice(colonIdx + 1);
    }

    // Extract just the filename (not full path)
    const fileParts = file.split(/[/\\]/);
    const fileName = fileParts[fileParts.length - 1] || file;
    const ext = fileName.includes(".") ? fileName.split(".").pop() || "" : "";

    return { file: fileName, name, ext, raw: nodeId };
}

function fileExtIcon(ext: string) {
    switch (ext.toLowerCase()) {
        case "py":    return <span className="text-blue-500 font-bold text-[9px] bg-blue-50 border border-blue-200 px-1 rounded">PY</span>;
        case "ts":
        case "tsx":   return <span className="text-violet-500 font-bold text-[9px] bg-violet-50 border border-violet-200 px-1 rounded">TS</span>;
        case "js":
        case "jsx":   return <span className="text-amber-600 font-bold text-[9px] bg-amber-50 border border-amber-200 px-1 rounded">JS</span>;
        case "json":  return <span className="text-slate-500 font-bold text-[9px] bg-slate-100 border border-slate-200 px-1 rounded">JSON</span>;
        default:      return <FileText className="w-3 h-3 text-slate-400" />;
    }
}

function EvidenceRow({ node, onCopy }: { node: ParsedNode; onCopy: () => void }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(node.raw).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
        onCopy();
    };

    return (
        <div className="group/row flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-100 hover:border-slate-300 hover:shadow-sm transition-all duration-150">
            <div className="flex-shrink-0">{fileExtIcon(node.ext)}</div>
            <div className="flex-1 min-w-0">
                {node.file ? (
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-mono text-slate-500 truncate">{node.file}</span>
                        {node.name && (
                            <>
                                <span className="text-slate-300 text-xs">→</span>
                                <span className="text-xs font-mono font-semibold text-slate-700 truncate">{node.name}</span>
                            </>
                        )}
                    </div>
                ) : (
                    <span className="text-xs font-mono text-slate-700 truncate">{node.name}</span>
                )}
            </div>
            <button
                onClick={handleCopy}
                title="Copy node ID"
                className="opacity-0 group-hover/row:opacity-100 transition-opacity p-1 rounded hover:bg-slate-100"
            >
                {copied
                    ? <Check className="w-3 h-3 text-emerald-500" />
                    : <Copy className="w-3 h-3 text-slate-400" />}
            </button>
        </div>
    );
}

// ─── Interview question card ──────────────────────────────────────────────────
const LEVEL_CONFIG: Record<string, { bg: string; text: string; border: string; icon: string }> = {
    Easy:   { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", icon: "🟢" },
    Medium: { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   icon: "🟡" },
    Hard:   { bg: "bg-red-50",     text: "text-red-700",     border: "border-red-200",     icon: "🔴" },
};

function QuestionCard({ q, index }: { q: any; index: number }) {
    const [showHint, setShowHint] = useState(false);
    const level = LEVEL_CONFIG[q.level] ?? LEVEL_CONFIG.Medium;

    return (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            {/* Question header */}
            <div className="px-4 py-3">
                <div className="flex items-start gap-3">
                    {/* Number badge */}
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[11px] font-bold mt-0.5">
                        {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                        {/* Level chip */}
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${level.bg} ${level.text} ${level.border}`}>
                                {level.icon} {q.level}
                            </span>
                            {q.why_this_question && (
                                <span className="text-[10px] text-slate-400 italic line-clamp-1">{q.why_this_question}</span>
                            )}
                        </div>
                        {/* Question text */}
                        <p className="text-sm font-medium text-slate-800 leading-relaxed">{q.question}</p>
                    </div>
                </div>
            </div>

            {/* Hint toggle */}
            {q.expected_answer_hint && (
                <div className="border-t border-slate-100">
                    <button
                        onClick={(e) => { e.stopPropagation(); setShowHint(v => !v); }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-[11px] font-semibold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/50 transition-colors"
                    >
                        {showHint ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        {showHint ? "Hide hint" : "Show expected answer hint"}
                    </button>
                    {showHint && (
                        <div className="px-4 pb-3 pt-0">
                            <p className="text-xs text-slate-600 bg-indigo-50 border border-indigo-100 rounded-lg p-2.5 leading-relaxed border-l-2 border-l-indigo-400">
                                {q.expected_answer_hint}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ icon, title, badge, children }: {
    icon: React.ReactNode;
    title: string;
    badge?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    {icon}
                    {title}
                </div>
                {badge}
            </div>
            {children}
        </div>
    );
}

// ─── Main Card ────────────────────────────────────────────────────────────────
export default function SkillCard({ result, index = 0, forceExpanded }: SkillCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [showInterview, setShowInterview] = useState(false);
    const [interviewLoading, setInterviewLoading] = useState(false);
    const [interviewData, setInterviewData] = useState<any | null>(null);
    const [allCopied, setAllCopied] = useState(false);

    // forceExpanded override
    useEffect(() => {
        if (forceExpanded !== undefined) setIsExpanded(forceExpanded);
    }, [forceExpanded]);

    const handleGenerateQuestions = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (interviewData) { setShowInterview(v => !v); return; }
        setInterviewLoading(true);
        setShowInterview(true);
        try {
            const res = await fetch(`/api/interview-questions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    topic: result.topic,
                    claim_text: result.claim_text,
                    difficulty: 3,
                    evidence_node_ids: result.evidence_node_ids,
                    code_snippets: result.evidence_node_ids.slice(0, 5),
                    reasoning: result.reasoning,
                    num_questions: 5,
                }),
            });
            const data = await res.json();
            setInterviewData(data);
        } catch {
            setInterviewData({ questions: [], error: "Failed to generate questions. Please try again." });
        } finally {
            setInterviewLoading(false);
        }
    };

    const handleCopyAll = (e: React.MouseEvent) => {
        e.stopPropagation();
        const questions = (interviewData?.questions ?? [])
            .map((q: any, i: number) => `Q${i + 1} [${q.level}]: ${q.question}\nHint: ${q.expected_answer_hint ?? ""}`)
            .join("\n\n");
        navigator.clipboard.writeText(questions).then(() => {
            setAllCopied(true);
            setTimeout(() => setAllCopied(false), 2000);
        });
    };

    const cfg = STATUS_CONFIG[result.status] ?? STATUS_CONFIG["Unverified"];
    const StatusIcon = cfg.icon;

    const parsedNodes = result.evidence_node_ids.slice(0, 12).map(parseNodeId);
    const hasEvidence = result.evidence_node_ids.length > 0;
    const isUnverified = result.status === "Unverified";

    return (
        <div
            className={`group relative rounded-2xl border-2 ${cfg.border} ${cfg.hoverBorder} ${cfg.bg} shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer`}
            style={{ animationDelay: `${index * 60}ms` }}
            onClick={() => setIsExpanded(v => !v)}
        >
            {/* Left accent bar */}
            <div className={`absolute left-0 top-3 bottom-3 w-1 rounded-full ${cfg.accentBar} ml-2 transition-opacity duration-300 ${isExpanded ? "opacity-100" : "opacity-0 group-hover:opacity-40"}`} />

            {/* ── Card Header ── */}
            <div className="px-5 pt-4 pb-3 pl-6">
                <div className="flex items-start gap-4">
                    {/* Status icon */}
                    <div className={`flex-shrink-0 mt-0.5 p-1.5 rounded-lg ${cfg.badgeBg} border ${cfg.badgeBorder}`}>
                        <StatusIcon className={`w-4 h-4 ${cfg.text}`} />
                    </div>

                    {/* Topic + claim */}
                    <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-slate-800 text-sm leading-tight">{result.topic}</h3>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.badgeBg} ${cfg.badgeText} ${cfg.badgeBorder}`}>
                                {result.status}
                            </span>
                            {/* Interview Prep hint chip */}
                            <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-indigo-200 bg-indigo-50 text-indigo-500 text-[9px] font-bold opacity-60 group-hover:opacity-100 transition-opacity">
                                <MessageSquare className="w-2.5 h-2.5" />
                                PREP
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 line-clamp-1 leading-relaxed">{result.claim_text}</p>

                        {/* Score bar — always visible */}
                        <div className="pt-2">
                            <ScoreBar score={result.score} color={cfg.barColor} delay={index * 40} />
                        </div>
                    </div>

                    {/* Expand chevron */}
                    <div className={`flex-shrink-0 mt-1 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}>
                        <ChevronDown className={`w-4 h-4 ${cfg.text} opacity-50`} />
                    </div>
                </div>
            </div>

            {/* ── Expanded Content ── */}
            <div
                style={{
                    maxHeight: isExpanded ? "9999px" : "0px",
                    transition: isExpanded
                        ? "max-height 700ms cubic-bezier(0.4, 0, 0.2, 1)"
                        : "max-height 300ms cubic-bezier(0.4, 0, 0.2, 1)",
                    overflow: "hidden",
                }}
            >
                <div className="px-5 pb-5 pt-0 pl-6 space-y-4 border-t-2 border-dashed border-slate-100 mt-1">
                    <div className="pt-3 space-y-4">

                        {/* ── Section 1: AI Reasoning ── */}
                        <Section
                            icon={<Code className="w-3 h-3" />}
                            title="AI Reasoning"
                        >
                            {isUnverified && !hasEvidence ? (
                                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700">
                                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
                                    <div className="space-y-1">
                                        <p className="text-xs font-semibold">No code evidence found</p>
                                        <p className="text-xs text-red-600/80 leading-relaxed">
                                            This skill wasn't demonstrated in the selected repositories.
                                            Try ingesting more repos or adding projects that show this skill.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className={`p-3 rounded-xl border-l-4 ${cfg.accentBar} border-t border-r border-b border-slate-200 bg-slate-50`}>
                                    <p className="text-xs text-slate-700 leading-relaxed">
                                        {result.reasoning || "No reasoning provided."}
                                    </p>
                                </div>
                            )}
                        </Section>

                        {/* ── Section 2: Complexity (only when available) ── */}
                        {result.complexity_analysis && (
                            <Section
                                icon={<Hash className="w-3 h-3" />}
                                title="Complexity Analysis"
                            >
                                <div className="flex items-start gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50">
                                    <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                                    <p className="text-xs text-slate-600 leading-relaxed">{result.complexity_analysis}</p>
                                </div>
                            </Section>
                        )}

                        {/* ── Section 3: Code Evidence ── */}
                        {hasEvidence && (
                            <Section
                                icon={<FileCode className="w-3 h-3" />}
                                title="Code Evidence"
                                badge={
                                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-[9px] font-bold">
                                        {result.evidence_node_ids.length}
                                    </span>
                                }
                            >
                                <div className="space-y-1.5">
                                    {parsedNodes.map((node, idx) => (
                                        <EvidenceRow key={idx} node={node} onCopy={() => {}} />
                                    ))}
                                    {result.evidence_node_ids.length > 12 && (
                                        <p className="text-[10px] text-slate-400 italic pl-2">
                                            +{result.evidence_node_ids.length - 12} more nodes…
                                        </p>
                                    )}
                                </div>
                            </Section>
                        )}

                        {/* ── Section 4: Interview Prep ── */}
                        <Section
                            icon={<MessageSquare className="w-3 h-3" />}
                            title="Interview Prep"
                        >
                            <button
                                id={`interview-btn-${result.claim_id}`}
                                onClick={handleGenerateQuestions}
                                disabled={interviewLoading}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-95 disabled:opacity-60 w-full justify-center"
                                style={{
                                    background: showInterview
                                        ? "linear-gradient(135deg, #6366f1, #7c3aed)"
                                        : "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(124,58,237,0.08))",
                                    border: "1.5px solid rgba(99,102,241,0.3)",
                                    color: showInterview ? "white" : "#6366f1",
                                    boxShadow: showInterview ? "0 4px 12px rgba(99,102,241,0.3)" : "none",
                                }}
                            >
                                {interviewLoading
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <MessageSquare className="w-3.5 h-3.5" />}
                                {interviewLoading
                                    ? "Generating personalised questions…"
                                    : showInterview
                                        ? "Hide Interview Prep"
                                        : "✨ Generate AI Interview Questions"}
                            </button>

                            {/* Questions panel */}
                            {showInterview && (
                                <div className="mt-3 space-y-3">
                                    {interviewLoading ? (
                                        <div className="flex flex-col items-center gap-3 py-8">
                                            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                                                <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                                            </div>
                                            <div className="text-center">
                                                <p className="text-xs font-semibold text-slate-600">Generating personalised questions</p>
                                                <p className="text-[10px] text-slate-400 mt-0.5">Based on your specific code patterns…</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Interviewer note */}
                                            {interviewData?.interviewer_note && (
                                                <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-indigo-100 bg-indigo-50">
                                                    <span className="text-sm">💡</span>
                                                    <p className="text-[11px] text-indigo-700 italic leading-relaxed">
                                                        {interviewData.interviewer_note}
                                                    </p>
                                                </div>
                                            )}

                                            {/* Copy All header */}
                                            {(interviewData?.questions?.length ?? 0) > 0 && (
                                                <div className="flex items-center justify-between">
                                                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                                                        {interviewData.questions.length} Questions
                                                    </p>
                                                    <button
                                                        onClick={handleCopyAll}
                                                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border border-indigo-200 bg-white text-indigo-600 hover:bg-indigo-50 transition-colors"
                                                    >
                                                        {allCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <ClipboardCopy className="w-3 h-3" />}
                                                        {allCopied ? "Copied!" : "Copy All"}
                                                    </button>
                                                </div>
                                            )}

                                            {/* Question cards */}
                                            <div className="space-y-2.5">
                                                {(interviewData?.questions ?? []).map((q: any, qi: number) => (
                                                    <QuestionCard key={qi} q={q} index={qi} />
                                                ))}
                                            </div>

                                            {interviewData?.error && (
                                                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                                                    <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                                                    <p className="text-xs text-red-600">{interviewData.error}</p>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </Section>

                    </div>
                </div>
            </div>
        </div>
    );
}
