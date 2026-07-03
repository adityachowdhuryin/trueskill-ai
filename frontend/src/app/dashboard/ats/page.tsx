"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import {
    Upload, FileText, Loader2, Target, CheckCircle, AlertCircle,
    Trash2, Clock, ChevronDown, ChevronUp, ScanSearch,
} from "lucide-react";
import ATSSkeleton from "@/components/ATSSkeleton";
import { useDashboard, API_BASE_URL } from "@/contexts/DashboardContext";
import type { ATSReport } from "@/types/dashboard";

const ATSScorePanel = dynamic(() => import("@/components/ATSScorePanel"), { ssr: false });

// ─── Score History Card ───────────────────────────────────────────────────────
function HistoryCard({
    report,
    index,
    onExpand,
    isExpanded,
}: {
    report: ATSReport;
    index: number;
    onExpand: () => void;
    isExpanded: boolean;
}) {
    const color = report.ats_score >= 75 ? "#22c55e" : report.ats_score >= 50 ? "#f59e0b" : "#ef4444";
    const timeLabel = `Run #${index + 1}`;

    return (
        <div
            className="rounded-xl border transition-all duration-200"
            style={{
                background: "rgba(255,255,255,0.02)",
                borderColor: isExpanded ? `${color}40` : "rgba(255,255,255,0.07)",
            }}
        >
            <button
                onClick={onExpand}
                className="w-full flex items-center gap-4 px-4 py-3 text-left"
            >
                <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0"
                    style={{ background: `${color}20`, color }}
                >
                    {report.ats_score}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-200 truncate">
                        {report.job_title || "ATS Score"}{report.company_name ? ` @ ${report.company_name}` : ""}
                    </p>
                    <p className="text-[11px] text-slate-500">{timeLabel} · {report.match_level || "Scored"}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}>
                        {report.keyword_matches.filter(k => k.found).length}/{report.keyword_matches.length} kw
                    </span>
                    {isExpanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                </div>
            </button>
            {isExpanded && (
                <div className="px-4 pb-4 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <div className="pt-4">
                        <ATSScorePanel
                            report={report}
                            apiBaseUrl={API_BASE_URL}
                            candidateName="Candidate"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Main ATS Scorer Page ─────────────────────────────────────────────────────
export default function ATSScorerPage() {
    const {
        atsReport,
        atsReportHistory,
        isScoring,
        atsError,
        setAtsError,
        handleGetATSScore,
        pdfFile,
        setPdfFile,
        jobDescription,
        setJobDescription,
        extractedText,
    } = useDashboard();

    const [localPdfFile, setLocalPdfFile] = useState<File | null>(null);
    const [localJd, setLocalJd]           = useState("");
    const [isDragging, setIsDragging]     = useState(false);
    const [localError, setLocalError]     = useState<string | null>(null);
    const [expandedHistory, setExpandedHistory] = useState<number | null>(null);
    const [jdFocused, setJdFocused]       = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const resultRef    = useRef<HTMLDivElement>(null);

    // Use context PDF/JD if available, otherwise use local state
    const activePdf = pdfFile ?? localPdfFile;
    const activeJd  = jobDescription || localJd;

    // Auto-scroll to result when ATS report loads
    useEffect(() => {
        if (atsReport && resultRef.current) {
            resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }, [atsReport]);

    const handleFileUpload = useCallback((file: File) => {
        if (!file.name.toLowerCase().endsWith(".pdf")) {
            setLocalError("Please upload a valid PDF file.");
            return;
        }
        setLocalError(null);
        setLocalPdfFile(file);
        setPdfFile(file);  // also set in context so other pages see it
    }, [setPdfFile]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFileUpload(file);
    }, [handleFileUpload]);

    const handleScore = () => {
        const jdToUse = activeJd.trim();
        if (!activePdf && !extractedText) {
            setLocalError("Please upload your resume PDF first.");
            return;
        }
        if (!jdToUse) {
            setLocalError("Please paste a job description.");
            return;
        }
        if (jdToUse.split(/\s+/).length < 20) {
            setLocalError("Job description too short — please paste at least 20 words.");
            return;
        }
        // Sync local JD to context if it's not already
        if (!jobDescription && localJd) setJobDescription(localJd);
        setLocalError(null);
        setAtsError(null);
        handleGetATSScore();
    };

    const wordCount = activeJd.trim().split(/\s+/).filter(Boolean).length;
    const canScore  = (!!activePdf || !!extractedText) && wordCount >= 20 && !isScoring;

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

                {/* ── Page Header ── */}
                <div className="flex items-center gap-4">
                    <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)", boxShadow: "0 0 20px rgba(99,102,241,0.35)" }}
                    >
                        <ScanSearch size={18} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">ATS Scorer</h1>
                        <p className="text-sm text-slate-500 font-medium">
                            Score your resume against any job description — instantly
                        </p>
                    </div>
                </div>

                {/* ── Two-column layout ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

                    {/* ── Left: Inputs ── */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">

                        {/* Resume upload */}
                        <div>
                            <h2 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                                <FileText size={14} className="text-indigo-500" />
                                Resume PDF
                            </h2>

                            {activePdf ? (
                                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50">
                                    <CheckCircle size={16} className="text-emerald-600 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-emerald-800 truncate">{activePdf.name}</p>
                                        <p className="text-xs text-emerald-600">{(activePdf.size / 1024).toFixed(1)} KB</p>
                                    </div>
                                    <button
                                        onClick={() => { setLocalPdfFile(null); setPdfFile(null); }}
                                        className="text-emerald-600 hover:text-red-500 transition-colors"
                                        title="Remove file"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ) : extractedText ? (
                                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-indigo-200 bg-indigo-50">
                                    <CheckCircle size={16} className="text-indigo-600 flex-shrink-0" />
                                    <p className="text-sm font-semibold text-indigo-800">Resume from Verification loaded</p>
                                </div>
                            ) : (
                                <div
                                    className={`relative rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-8 text-center transition-all duration-200 cursor-pointer ${isDragging ? "scale-[1.01]" : ""}`}
                                    style={{
                                        borderColor: isDragging ? "rgba(99,102,241,0.7)" : "rgba(0,0,0,0.1)",
                                        background: isDragging ? "rgba(99,102,241,0.04)" : "rgba(0,0,0,0.01)",
                                    }}
                                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                    onDragLeave={() => setIsDragging(false)}
                                    onDrop={handleDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".pdf"
                                        className="hidden"
                                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
                                    />
                                    <Upload size={28} className="text-slate-400 mb-2" />
                                    <p className="text-sm font-medium text-slate-600">
                                        {isDragging ? "Release to upload" : "Drop your resume PDF here"}
                                    </p>
                                    <p className="text-xs text-slate-400 mt-1">or click to browse · PDF only · max 10 MB</p>
                                </div>
                            )}
                        </div>

                        {/* Job description */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                    <Target size={14} className="text-violet-500" />
                                    Job Description
                                </h2>
                                {activeJd && (
                                    <span className="text-[10px] text-slate-400">{wordCount} words</span>
                                )}
                            </div>
                            <textarea
                                placeholder="Paste the full job description here..."
                                value={activeJd}
                                onChange={e => {
                                    setLocalJd(e.target.value);
                                    setJobDescription(e.target.value);
                                }}
                                onFocus={() => setJdFocused(true)}
                                onBlur={() => setJdFocused(false)}
                                className={`w-full h-40 px-4 py-3 border rounded-xl text-sm resize-none focus:outline-none transition-all duration-200 ${
                                    jdFocused
                                        ? "border-violet-400 shadow-[0_0_0_3px_rgba(139,92,246,0.15)]"
                                        : "border-slate-200 hover:border-slate-300"
                                }`}
                            />
                            {wordCount > 0 && wordCount < 20 && (
                                <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                                    <AlertCircle size={11} />
                                    Need at least 20 words for accurate analysis ({20 - wordCount} more needed)
                                </p>
                            )}
                        </div>

                        {/* Error */}
                        {(localError || atsError) && (
                            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">
                                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                                {localError ?? atsError}
                            </div>
                        )}

                        {/* Score button */}
                        <button
                            id="ats-page-score-btn"
                            onClick={handleScore}
                            disabled={!canScore}
                            className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                            style={{
                                background: canScore
                                    ? "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)"
                                    : "rgba(99,102,241,0.3)",
                                color: "white",
                                boxShadow: canScore ? "0 8px 30px rgba(79,70,229,0.3)" : "none",
                            }}
                        >
                            {isScoring
                                ? <><Loader2 size={16} className="animate-spin" />Analyzing Resume…</>
                                : <><ScanSearch size={16} />Score My Resume</>
                            }
                        </button>
                    </div>

                    {/* ── Right: Results ── */}
                    <div ref={resultRef}>
                        {isScoring ? (
                            <ATSSkeleton />
                        ) : atsReport ? (
                            <ATSScorePanel
                                report={atsReport}
                                previousReport={atsReportHistory[0] ?? null}
                                candidateName={activePdf?.name.replace(/\.pdf$/i, "") ?? "Candidate"}
                                apiBaseUrl={API_BASE_URL}
                                onReAnalyze={handleGetATSScore}
                            />
                        ) : (
                            <div
                                className="h-full min-h-80 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center p-10"
                                style={{ borderColor: "rgba(0,0,0,0.08)", background: "rgba(0,0,0,0.01)" }}
                            >
                                <div
                                    className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                                    style={{ background: "rgba(99,102,241,0.08)" }}
                                >
                                    <ScanSearch size={26} className="text-indigo-400" />
                                </div>
                                <p className="text-slate-600 font-semibold">Your ATS report will appear here</p>
                                <p className="text-slate-400 text-sm mt-1">Upload a PDF and paste a job description, then click Score</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Score History ── */}
                {atsReportHistory.length > 0 && (
                    <div
                        className="rounded-2xl overflow-hidden"
                        style={{
                            background: "linear-gradient(160deg, #0f172a 0%, #0a0f1e 100%)",
                            border: "1px solid rgba(255,255,255,0.07)",
                        }}
                    >
                        <div
                            className="px-6 py-4"
                            style={{
                                borderBottom: "1px solid rgba(255,255,255,0.07)",
                                background: "rgba(255,255,255,0.02)",
                            }}
                        >
                            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                                <Clock size={14} className="text-indigo-400" />
                                Score History
                                <span className="text-[10px] font-medium text-slate-500">— last {atsReportHistory.length} run{atsReportHistory.length > 1 ? "s" : ""}</span>
                            </h3>
                        </div>
                        <div className="p-4 space-y-2">
                            {atsReportHistory.map((hist, i) => (
                                <HistoryCard
                                    key={i}
                                    report={hist}
                                    index={i}
                                    onExpand={() => setExpandedHistory(expandedHistory === i ? null : i)}
                                    isExpanded={expandedHistory === i}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
