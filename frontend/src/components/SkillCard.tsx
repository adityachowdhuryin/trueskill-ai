"use client";

import { useState, useEffect, useRef } from "react";
import { CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronUp, Code, FileCode, Copy, Check, MessageSquare, Loader2 } from "lucide-react";

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

interface SkillCardProps {
    result: VerificationResult;
    index?: number;
}

// ─── Animated circular score ring ────────────────────────────────────────────
function ScoreRing({ score, color }: { score: number; color: string }) {
    const radius = 20;
    const circumference = 2 * Math.PI * radius;
    const [offset, setOffset] = useState(circumference);

    useEffect(() => {
        // Trigger animation after mount
        const timer = setTimeout(() => {
            setOffset(circumference - (score / 100) * circumference);
        }, 100);
        return () => clearTimeout(timer);
    }, [score, circumference]);

    return (
        <div className="relative flex items-center justify-center" style={{ width: 52, height: 52 }}>
            <svg width="52" height="52" style={{ transform: "rotate(-90deg)" }}>
                {/* Track */}
                <circle cx="26" cy="26" r={radius} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="4" />
                {/* Progress */}
                <circle
                    cx="26" cy="26" r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    className="score-ring"
                    style={{ filter: `drop-shadow(0 0 4px ${color}66)` }}
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-bold" style={{ color }}>{score}</span>
            </div>
        </div>
    );
}

// ─── Status config ────────────────────────────────────────────────────────────
const statusConfig = {
    "Verified": {
        icon: CheckCircle,
        bg: "bg-emerald-50",
        text: "text-emerald-700",
        border: "border-emerald-200",
        hoverBorder: "hover:border-emerald-400",
        accentBar: "bg-emerald-500",
        ringColor: "#10b981",
        badgeBg: "bg-emerald-500/10",
        badgeText: "text-emerald-600",
        badgeBorder: "border-emerald-200",
    },
    "Partially Verified": {
        icon: AlertCircle,
        bg: "bg-amber-50",
        text: "text-amber-700",
        border: "border-amber-200",
        hoverBorder: "hover:border-amber-400",
        accentBar: "bg-amber-500",
        ringColor: "#f59e0b",
        badgeBg: "bg-amber-500/10",
        badgeText: "text-amber-600",
        badgeBorder: "border-amber-200",
    },
    "Unverified": {
        icon: XCircle,
        bg: "bg-red-50",
        text: "text-red-700",
        border: "border-red-200",
        hoverBorder: "hover:border-red-400",
        accentBar: "bg-red-500",
        ringColor: "#ef4444",
        badgeBg: "bg-red-500/10",
        badgeText: "text-red-600",
        badgeBorder: "border-red-200",
    },
};

// ─── Evidence chip with copy ──────────────────────────────────────────────────
function EvidenceChip({ nodeId }: { nodeId: string }) {
    const [copied, setCopied] = useState(false);
    const label = nodeId.length > 40 ? `...${nodeId.slice(-40)}` : nodeId;

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(nodeId).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    return (
        <button
            onClick={handleCopy}
            className="group/chip flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 rounded text-xs font-mono text-slate-600 hover:text-indigo-700 transition-all duration-150"
            title={nodeId}
        >
            <span>{label}</span>
            {copied
                ? <Check className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                : <Copy className="w-3 h-3 text-slate-300 group-hover/chip:text-indigo-400 flex-shrink-0" />
            }
        </button>
    );
}

// ─── Interview question level badge ──────────────────────────────────────────
const LEVEL_STYLES: Record<string, string> = {
    Easy:   "bg-emerald-50 text-emerald-700 border-emerald-200",
    Medium: "bg-amber-50 text-amber-700 border-amber-200",
    Hard:   "bg-red-50 text-red-700 border-red-200",
};

// ─── Main Card ────────────────────────────────────────────────────────────────
export default function SkillCard({ result, index = 0 }: SkillCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    // Feature 5 — Interview Questions state
    const [showInterview, setShowInterview] = useState(false);
    const [interviewLoading, setInterviewLoading] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [interviewData, setInterviewData] = useState<any | null>(null);

    const handleGenerateQuestions = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (interviewData) { setShowInterview(!showInterview); return; }
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
            setInterviewData({ questions: [], error: "Failed to generate questions" });
        } finally {
            setInterviewLoading(false);
        }
    };

    const config = statusConfig[result.status];
    const StatusIcon = config.icon;


    return (
        <div
            className={`group relative rounded-xl border ${config.border} ${config.hoverBorder} ${config.bg} transition-all duration-300 cursor-pointer animate-slide-up`}
            style={{ animationDelay: `${index * 60}ms` }}
            onClick={() => setIsExpanded(!isExpanded)}
        >
            {/* Left accent bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${config.accentBar} transition-all duration-300 ${isExpanded ? "opacity-100" : "opacity-0 group-hover:opacity-60"}`} />

            {/* Card Header */}
            <div className="p-4 flex items-center justify-between gap-3 pl-5">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Status icon with scale-in animation */}
                    <StatusIcon className={`w-5 h-5 flex-shrink-0 ${config.text} transition-transform duration-200 group-hover:scale-110`} />
                    <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-800 truncate">{result.topic}</h3>
                        <p className="text-sm text-slate-500 line-clamp-1 mt-0.5">{result.claim_text}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Animated score ring */}
                    <ScoreRing score={result.score} color={config.ringColor} />

                    {/* Status Badge */}
                    <span className={`hidden sm:inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${config.badgeBg} ${config.badgeText} border ${config.badgeBorder}`}>
                        {result.status}
                    </span>

                    {/* Interview Prep hint chip — always visible on header */}
                    <span
                        title="Expand to generate AI Interview Prep questions"
                        className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-indigo-200 bg-indigo-50 text-indigo-500 text-[10px] font-semibold opacity-70 group-hover:opacity-100 transition-opacity"
                    >
                        <MessageSquare className="w-2.5 h-2.5" />
                        Prep
                    </span>

                    {/* Expand icon */}
                    <div className={`transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}>
                        <ChevronDown className={`w-4 h-4 ${config.text} opacity-60`} />
                    </div>
                </div>
            </div>

            {/* Expanded Content — smooth accordion */}
            <div
                style={{
                    maxHeight: isExpanded ? "9999px" : "0px",
                    transition: isExpanded
                        ? "max-height 600ms cubic-bezier(0.4, 0, 0.2, 1)"
                        : "max-height 300ms cubic-bezier(0.4, 0, 0.2, 1)",
                    overflow: "hidden",
                }}
            >
                <div>
                    <div className="px-5 pb-5 pt-1 border-t border-slate-200/70 space-y-4">
                        {/* Reasoning */}
                        <div>
                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <Code className="w-3.5 h-3.5" />
                                Analysis
                            </h4>
                            <p className="text-sm text-slate-700 bg-white/80 p-3 rounded-lg border border-slate-200 leading-relaxed">
                                {result.reasoning || "No reasoning provided."}
                            </p>
                        </div>

                        {/* Complexity */}
                        {result.complexity_analysis && (
                            <div>
                                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                    Complexity Analysis
                                </h4>
                                <p className="text-sm text-slate-700 bg-white/80 p-3 rounded-lg border border-slate-200 leading-relaxed">
                                    {result.complexity_analysis}
                                </p>
                            </div>
                        )}

                        {/* Evidence Nodes */}
                        {result.evidence_node_ids.length > 0 && (
                            <div>
                                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <FileCode className="w-3.5 h-3.5" />
                                    Evidence Nodes
                                    <span className="ml-1 px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded text-[10px] font-bold">
                                        {result.evidence_node_ids.length}
                                    </span>
                                </h4>
                                <div className="flex flex-wrap gap-1.5">
                                    {result.evidence_node_ids.slice(0, 10).map((nodeId, idx) => (
                                        <EvidenceChip key={idx} nodeId={nodeId} />
                                    ))}
                                    {result.evidence_node_ids.length > 10 && (
                                        <span className="px-2 py-1 text-xs text-slate-400 italic">
                                            +{result.evidence_node_ids.length - 10} more
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Feature 5 — Interview Prep Button */}
                        <div className="pt-1">
                            <button
                                id={`interview-btn-${result.claim_id}`}
                                onClick={handleGenerateQuestions}
                                disabled={interviewLoading}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-60"
                                style={{
                                    background: showInterview ? "rgba(99,102,241,0.1)" : "rgba(99,102,241,0.06)",
                                    border: "1px solid rgba(99,102,241,0.25)",
                                    color: "#6366f1",
                                }}
                            >
                                {interviewLoading
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <MessageSquare className="w-3.5 h-3.5" />}
                                {interviewLoading ? "Generating…" : showInterview ? "Hide Interview Prep" : "Interview Prep"}
                            </button>

                            {/* Questions panel */}
                            {showInterview && (
                                <div className="mt-3 space-y-2.5">
                                    {interviewLoading && (
                                        <div className="flex items-center gap-2 py-4 justify-center">
                                            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                                            <span className="text-xs text-slate-400">Generating personalised questions…</span>
                                        </div>
                                    )}
                                    {interviewData?.interviewer_note && (
                                        <p className="text-xs text-slate-500 italic px-3 py-2 rounded-lg border border-indigo-100 bg-indigo-50">
                                            💡 {interviewData.interviewer_note}
                                        </p>
                                    )}
                                    {(interviewData?.questions ?? []).map((q: any, qi: number) => (
                                        <div
                                            key={qi}
                                            className="p-3 rounded-lg border border-slate-200 bg-white/80 space-y-1.5"
                                        >
                                            <div className="flex items-center gap-1.5">
                                                <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded border ${LEVEL_STYLES[q.level] ?? LEVEL_STYLES.Medium}`}>
                                                    {q.level}
                                                </span>
                                                <span className="text-[10px] text-slate-400">Q{qi + 1}</span>
                                            </div>
                                            <p className="text-xs font-medium text-slate-800 leading-relaxed">{q.question}</p>
                                            {q.expected_answer_hint && (
                                                <p className="text-[11px] text-slate-500 pl-2 border-l-2 border-slate-200 leading-relaxed">
                                                    {q.expected_answer_hint}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                    {interviewData?.error && (
                                        <p className="text-xs text-red-500">{interviewData.error}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
