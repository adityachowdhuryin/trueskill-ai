"use client";

import { useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { useDashboard } from "@/contexts/DashboardContext";
import {
    Upload, Loader2, Github, Wifi, WifiOff,
    RefreshCw, Download, Share2, Check, Copy, AlertCircle,
    Network, Microscope, Target, Activity, BarChart3,
    Search, Filter, ChevronsUpDown, Maximize2, Sparkles,
} from "lucide-react";
import type { VerificationResult } from "@/types/dashboard";
import VerificationSummaryBar from "@/components/VerificationSummaryBar";
import SkillCard from "@/components/SkillCard";
import ErrorBoundary from "@/components/ErrorBoundary";

const GraphVisualizer = dynamic(() => import("@/components/GraphVisualizer"), { ssr: false });
const SkillRadar = dynamic(() => import("@/components/SkillRadar"), { ssr: false });
const ContributionHeatmap = dynamic(() => import("@/components/ContributionHeatmap"), { ssr: false });
const SkillTimeline = dynamic(() => import("@/components/SkillTimeline"), { ssr: false });
const GraphSkeleton = dynamic(() => import("@/components/Skeletons").then(m => ({ default: m.GraphSkeleton })), { ssr: false });
const PipelineStepsSkeleton = dynamic(() => import("@/components/Skeletons").then(m => ({ default: m.PipelineStepsSkeleton })), { ssr: false });

const RESULT_TABS = [
    { id: "skills", label: "Skills", icon: Microscope },
    { id: "radar", label: "Radar", icon: Target },
    { id: "activity", label: "Activity", icon: Activity },
    { id: "graph", label: "3D Graph", icon: Network },
] as const;

export default function VerificationPage() {
    const ctx = useDashboard();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const {
        repoUrl, setRepoUrl, repoId, pdfFile, pdfFileName, extractedText,
        isDragging, setIsDragging,
        extractedRepos, githubUsername, isExtracting, extractionError, isManualMode, setIsManualMode,
        selectedRepos, toggleRepoSelection, linkedinUrl, setLinkedinUrl,
        isIngesting, isAnalyzing, agentStatus, agentMessages, error, setError,
        handleFileUpload, handleIngestRepo, handleMultiRepoAnalyze, handleResetAll,
        analysisResult, prevScores,
        graphNodes, graphLinks, isLoadingGraph, graphMeta, graphHighlightIds, setGraphHighlightIds,
        graphSummary, setGraphSummary, isGraphFullscreen, setIsGraphFullscreen,
        handleNodeClick, handleShowInGraph, timelineData, repoId: currentRepoId,
        resultTab, handleTabChange,
        skillSearch, setSkillSearch, skillFilter, setSkillFilter, expandAll, setExpandAll,
        isSaving, saveSuccess, isSharing, shareCopied, handleSaveAnalysis, handleShareAnalysis, handleExportReport,
        multiRepoIds,
    } = ctx;

    // ── Drag & drop ───────────────────────────────────────────────────────────
    const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, [setIsDragging]);
    const handleDragLeave = useCallback(() => setIsDragging(false), [setIsDragging]);
    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault(); setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file?.type === "application/pdf") {
            const syntheticEvent = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
            await handleFileUpload(syntheticEvent);
        }
    }, [setIsDragging, handleFileUpload]);

    const canAnalyze = (selectedRepos.size > 0 || (isManualMode && repoUrl)) && !!pdfFile;
    const hasResults = (analysisResult?.verification_results?.length ?? 0) > 0;
    const authenticityScore = analysisResult?.authenticity_score ?? null;

    // ── Handle ?tab= URL param (e.g. from Projects → Show in Graph) ───────────
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const tab = params.get("tab");
        if (tab && ["skills", "radar", "activity", "graph"].includes(tab)) {
            handleTabChange(tab as "skills" | "radar" | "activity" | "graph");
        }
    // Run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="flex h-screen flex-col md:flex-row overflow-hidden">
            {/* ── LEFT PANEL ─────────────────────────────────────────────────── */}
            <aside className="w-full md:w-[340px] flex-shrink-0 bg-white border-b md:border-b-0 md:border-r border-slate-200 overflow-y-auto flex flex-col">
                {/* Header */}
                <div className="p-5 border-b border-slate-100">
                    <h1 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Microscope className="w-4 h-4 text-indigo-500" />
                        Skill Verification
                    </h1>
                    <p className="text-xs text-slate-500 mt-0.5">Upload resume + select repos to analyze</p>
                </div>

                <div className="p-4 flex flex-col gap-4 flex-1">
                    {/* ── PDF Upload zone ───────────────────────────────────────── */}
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">Resume PDF</label>
                        <div
                            onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={`relative border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all duration-300 ${isDragging ? "drag-active border-indigo-400 bg-indigo-50/50" : pdfFile ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30"}`}
                        >
                            <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} />
                            {pdfFile ? (
                                <div className="flex flex-col items-center gap-2">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                                        <Check className="w-5 h-5 text-emerald-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-emerald-700 truncate max-w-[200px]">
                                            {pdfFile.name}
                                        </p>
                                        <p className="text-[10px] text-slate-400">Click to replace</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-2">
                                    <Upload className="w-8 h-8 text-slate-300" />
                                    <div>
                                        <p className="text-sm font-medium text-slate-600">Drop PDF here</p>
                                        <p className="text-xs text-slate-400">or click to browse</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── GitHub auto-detection ──────────────────────────────────── */}
                    {pdfFile && (
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                    {githubUsername ? `@${githubUsername}'s repos` : "Repositories"}
                                </label>
                                <button
                                    onClick={() => setIsManualMode(!isManualMode)}
                                    className="text-[10px] text-indigo-500 hover:underline font-medium"
                                >
                                    {isManualMode ? "Auto-detect" : "Manual URL"}
                                </button>
                            </div>

                            {isExtracting && (
                                <div className="flex items-center gap-2 py-3 px-3 rounded-xl bg-slate-50 border border-slate-100">
                                    <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                                    <span className="text-xs text-slate-500">Detecting GitHub from resume…</span>
                                </div>
                            )}

                            {extractionError && !isManualMode && (
                                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700 mb-2">
                                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                    <span>{extractionError}</span>
                                </div>
                            )}

                            {/* Auto-detected repos list */}
                            {!isManualMode && extractedRepos.length > 0 && (
                                <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto pr-1">
                                    {extractedRepos.map(repo => {
                                        const selected = selectedRepos.has(repo.html_url);
                                        return (
                                            <button
                                                key={repo.html_url}
                                                onClick={() => toggleRepoSelection(repo.html_url)}
                                                className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all ${selected
                                                    ? "bg-indigo-50 border-indigo-300 shadow-sm"
                                                    : "bg-white border-slate-200 hover:border-indigo-200 hover:bg-slate-50"}`}
                                            >
                                                <div className={`w-4 h-4 mt-0.5 rounded flex-shrink-0 flex items-center justify-center border transition-all ${selected ? "bg-indigo-500 border-indigo-500" : "border-slate-300"}`}>
                                                    {selected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-semibold text-slate-800 truncate">{repo.name}</p>
                                                    {repo.language && <p className="text-[10px] text-slate-400">{repo.language}</p>}
                                                </div>
                                                {selected && <Github className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0 mt-0.5" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Manual URL */}
                            {isManualMode && (
                                <div className="flex flex-col gap-2">
                                    <div className="relative">
                                        <Github className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                        <input
                                            type="url"
                                            placeholder="https://github.com/user/repo"
                                            value={repoUrl}
                                            onChange={e => setRepoUrl(e.target.value)}
                                            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                        />
                                    </div>
                                    {repoId ? (
                                        <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 font-medium">
                                            <Wifi className="w-3 h-3" /> Ingested
                                        </div>
                                    ) : (
                                        <button
                                            onClick={handleIngestRepo}
                                            disabled={isIngesting || !repoUrl}
                                            className="flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors disabled:opacity-50"
                                        >
                                            {isIngesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <WifiOff className="w-3.5 h-3.5" />}
                                            {isIngesting ? "Ingesting…" : "Ingest Repository"}
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* LinkedIn URL */}
                            <div className="mt-3">
                                <input
                                    type="url"
                                    placeholder="LinkedIn URL (optional)"
                                    value={linkedinUrl}
                                    onChange={e => setLinkedinUrl(e.target.value)}
                                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 text-slate-600"
                                />
                            </div>
                        </div>
                    )}

                    {/* ── Error ────────────────────────────────────────────────── */}
                    {error && (
                        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                            <span>{error}</span>
                            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
                        </div>
                    )}

                    {/* ── Analyze CTA ───────────────────────────────────────────── */}
                    <div className="mt-auto flex flex-col gap-2">
                        <button
                            onClick={handleMultiRepoAnalyze}
                            disabled={!canAnalyze || isIngesting || isAnalyzing}
                            className="relative flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold text-white transition-all duration-200 hover:scale-[1.02] active:scale-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 overflow-hidden"
                            style={{
                                background: "linear-gradient(135deg, #6366f1, #7c3aed)",
                                boxShadow: canAnalyze ? "0 4px 20px rgba(99,102,241,0.4)" : "none",
                            }}
                        >
                            {(isIngesting || isAnalyzing) && (
                                <span className="absolute inset-0 animate-shimmer-dark opacity-20" />
                            )}
                            {isIngesting ? (
                                <><Loader2 className="w-4 h-4 animate-spin relative z-10" /><span className="relative z-10">Ingesting repos…</span></>
                            ) : isAnalyzing ? (
                                <><Loader2 className="w-4 h-4 animate-spin relative z-10" /><span className="relative z-10">Analyzing…</span></>
                            ) : (
                                <><Sparkles className="w-4 h-4 relative z-10" /><span className="relative z-10">Start Analyzing ({selectedRepos.size} repo{selectedRepos.size !== 1 ? "s" : ""})</span></>
                            )}
                        </button>

                        {hasResults && (
                            <button
                                onClick={handleResetAll}
                                className="flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 py-1.5 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors"
                            >
                                <RefreshCw className="w-3 h-3" /> Reset & start over
                            </button>
                        )}
                    </div>

                    {/* ── Agent messages (streaming) ───────────────────────────── */}
                    {(isAnalyzing || isIngesting) && agentMessages.length > 0 && (
                        <div className="mt-2 bg-slate-900 rounded-xl p-3 max-h-40 overflow-y-auto space-y-1">
                            {agentMessages.map((msg, i) => (
                                <p key={i} className={`text-[11px] font-mono leading-relaxed ${
                                    i === agentMessages.length - 1 ? "text-indigo-300" : "text-slate-400"
                                }`}>{msg}</p>
                            ))}
                            {agentStatus && (
                                <p className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    {agentStatus}
                                </p>
                            )}
                        </div>
                    )}

                    {/* ── Authenticity badge ─────────────────────────────────────── */}
                    {authenticityScore !== null && (
                        <div className={`flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-semibold ${authenticityScore >= 80 ? "bg-emerald-50 border-emerald-200 text-emerald-700" : authenticityScore >= 60 ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                            <span>Authenticity Score</span>
                            <span className="text-lg font-extrabold">{Math.round(authenticityScore)}%</span>
                        </div>
                    )}
                </div>

                {/* ── Action buttons (bottom of sidebar) ───────────────────────── */}
                {hasResults && (
                    <div className="border-t border-slate-100 p-4 flex flex-wrap gap-2">
                        <button onClick={handleExportReport} title="Export report"
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                            <Download className="w-3.5 h-3.5" />Export
                        </button>
                        <button onClick={handleSaveAnalysis} disabled={isSaving} title="Save analysis"
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50">
                            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saveSuccess ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <BarChart3 className="w-3.5 h-3.5" />}
                            {saveSuccess ? "Saved!" : "Save"}
                        </button>
                        <button onClick={handleShareAnalysis} disabled={isSharing} title="Share profile"
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white text-slate-600 hover:border-violet-300 hover:text-violet-600 hover:bg-violet-50 transition-colors disabled:opacity-50">
                            {isSharing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : shareCopied ? <Copy className="w-3.5 h-3.5 text-violet-500" /> : <Share2 className="w-3.5 h-3.5" />}
                            {shareCopied ? "Copied!" : "Share"}
                        </button>
                    </div>
                )}
            </aside>

            {/* ── RIGHT PANEL ────────────────────────────────────────────────── */}
            <main className="flex-1 flex flex-col overflow-hidden bg-slate-50">
                {/* Tab bar */}
                <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4">
                    <div className="flex items-center gap-0.5 overflow-x-auto py-2">
                        {RESULT_TABS.map(tab => {
                            const Icon = tab.icon;
                            const active = resultTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => handleTabChange(tab.id as typeof resultTab)}
                                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${active
                                        ? "bg-indigo-50 text-indigo-700"
                                        : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"}`}
                                >
                                    <Icon className="w-4 h-4" />
                                    {tab.label}
                                </button>
                            );
                        })}
                        {/* Fullscreen button — only shown on graph tab when graph is loaded */}
                        {resultTab === "graph" && graphNodes.length > 0 && (
                            <button
                                id="graph-fullscreen-btn"
                                onClick={() => setIsGraphFullscreen(true)}
                                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm whitespace-nowrap flex-shrink-0"
                            >
                                <Maximize2 className="w-3.5 h-3.5" />
                                Fullscreen
                            </button>
                        )}
                    </div>
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-y-auto">
                    {/* ── Skills Tab ─────────────────────────────────────────────── */}
                    {resultTab === "skills" && (
                        <div className="flex flex-col h-full">
                            {isAnalyzing ? (
                                <div className="flex flex-col gap-4 p-6">
                                    <div className="flex items-center gap-3">
                                        <div className="relative flex-shrink-0">
                                            <div className="absolute inset-0 bg-indigo-400/20 rounded-full blur-md animate-pulse" />
                                            <div className="w-10 h-10 rounded-full bg-white border border-indigo-100 shadow-sm flex items-center justify-center relative z-10">
                                                <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                                            </div>
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-slate-800 text-sm">AI Agent Analyzing</h3>
                                            <p className="text-xs text-slate-400">Verifying resume claims against code…</p>
                                        </div>
                                    </div>
                                    <div className="bg-slate-900 rounded-xl p-3 mt-2 max-h-52 overflow-y-auto space-y-1">
                                        {agentMessages.map((msg, i) => (
                                            <p key={i} className={`text-[11px] font-mono leading-relaxed ${
                                                i === agentMessages.length - 1 ? "text-indigo-300" : "text-slate-400"
                                            }`}>{msg}</p>
                                        ))}
                                        {agentStatus && (
                                            <p className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                                {agentStatus}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ) : analysisResult?.verification_results.length ? (
                                <>
                                    <VerificationSummaryBar
                                        summary={{ ...analysisResult.summary, not_assessed: analysisResult.summary.not_assessed ?? 0 }}
                                        onFilterChange={setSkillFilter}
                                        activeFilter={skillFilter}
                                    />
                                    {/* Filter toolbar */}
                                    <div className="flex-shrink-0 px-4 pt-3 pb-2 border-b border-slate-100 bg-slate-50/80 space-y-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <div className="relative flex-1 min-w-[140px]">
                                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                                                <input type="text" placeholder="Search skills…" value={skillSearch}
                                                    onChange={e => setSkillSearch(e.target.value)}
                                                    onClick={e => e.stopPropagation()}
                                                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder:text-slate-400" />
                                            </div>
                                            <div className="relative">
                                                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                                                <select value={skillFilter} onChange={e => setSkillFilter(e.target.value as typeof skillFilter)}
                                                    className="pl-7 pr-6 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 text-slate-600 appearance-none cursor-pointer">
                                                    <option value="All">All</option>
                                                    <option value="Verified">✅ Verified</option>
                                                    <option value="Partially Verified">⚠️ Partial</option>
                                                    <option value="Unverified">❌ Unverified</option>
                                                    <option value="Not Assessed">⧘ Not Assessed</option>
                                                </select>
                                            </div>
                                            <button
                                                onClick={e => { e.stopPropagation(); setExpandAll(v => v === true ? false : true); }}
                                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/50 transition-colors">
                                                <ChevronsUpDown className="w-3 h-3" />
                                                {expandAll ? "Collapse All" : "Expand All"}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Skill cards */}
                                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                        {(() => {
                                            const NOT_ASSESSED = new Set(["Not Code-Verifiable", "Repo Not Available"]);
                                            const filterFn = (r: VerificationResult) => {
                                                if (skillFilter === "Not Assessed") return NOT_ASSESSED.has(r.status);
                                                if (skillFilter === "All") return !NOT_ASSESSED.has(r.status);
                                                return r.status === skillFilter;
                                            };
                                            const order: Record<string, number> = { "Verified": 0, "Partially Verified": 1, "Unverified": 2, "Not Code-Verifiable": 3, "Repo Not Available": 3 };
                                            const filtered = [...analysisResult.verification_results]
                                                .filter(r => filterFn(r) && r.topic.toLowerCase().includes(skillSearch.toLowerCase()))
                                                .sort((a, b) => { const diff = (order[a.status] ?? 3) - (order[b.status] ?? 3); return diff !== 0 ? diff : b.score - a.score; });
                                            if (filtered.length === 0) return (
                                                <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
                                                    <Search className="w-8 h-8 text-slate-300" />
                                                    <p className="text-sm font-medium">No skills match your filter</p>
                                                    <button onClick={() => { setSkillSearch(""); setSkillFilter("All"); }} className="text-xs text-indigo-500 hover:underline">Clear filters</button>
                                                </div>
                                            );
                                            return filtered.map((result, idx) => (
                                                <SkillCard
                                                    key={result.claim_id} result={result} index={idx}
                                                    forceExpanded={expandAll}
                                                    repoIds={multiRepoIds.length > 0 ? multiRepoIds : (analysisResult.repo_id ? [analysisResult.repo_id] : [])}
                                                    onShowInGraph={handleShowInGraph}
                                                    scoreDelta={prevScores[result.topic] !== undefined ? result.score - prevScores[result.topic] : undefined}
                                                />
                                            ));
                                        })()}
                                    </div>
                                </>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-300 p-8">
                                    <div className="relative mb-4">
                                        <div className="absolute inset-0 animate-ping-slow rounded-full bg-slate-200" />
                                        <AlertCircle className="w-12 h-12 relative z-10 text-slate-300" />
                                    </div>
                                    <p className="font-medium text-slate-400">No results yet</p>
                                    <p className="text-sm mt-1 text-slate-400">Upload a resume and click Analyze to get started</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Radar Tab ──────────────────────────────────────────────── */}
                    {resultTab === "radar" && (
                        <div className="p-5 h-full">
                            {analysisResult?.verification_results.length ? (
                                <SkillRadar
                                    verifiedSkills={analysisResult.verification_results.map(r => ({
                                        topic: r.topic, score: r.score, status: r.status,
                                    }))}
                                />
                            ) : (
                                <div className="h-64 flex flex-col items-center justify-center text-slate-300">
                                    <Target className="w-12 h-12 mb-3 text-slate-200" />
                                    <p className="font-medium text-slate-400">Run an analysis first</p>
                                    <p className="text-sm text-slate-400 mt-1">Radar chart will appear here</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Activity Tab ───────────────────────────────────────────── */}
                    {resultTab === "activity" && (
                        <div className="p-5 space-y-5">
                            {currentRepoId ? (
                                <ContributionHeatmap repoId={currentRepoId} />
                            ) : (
                                <div className="bg-slate-50 rounded-xl border border-dashed border-slate-200 p-6 text-center">
                                    <p className="text-sm text-slate-400">Ingest a repository to see contribution heatmap</p>
                                </div>
                            )}
                            {Object.keys(timelineData).length > 0 && (
                                <SkillTimeline timeline={timelineData} />
                            )}
                        </div>
                    )}

                    {/* ── Graph Tab ──────────────────────────────────────────────── */}
                    {resultTab === "graph" && (
                        <div className="relative" style={{ minHeight: 500, height: "100%" }}>
                            <ErrorBoundary fallbackTitle="3D Graph failed to load">
                                {isIngesting ? (
                                    <div className="flex flex-col items-center justify-center h-full min-h-[400px] bg-slate-900">
                                        <PipelineStepsSkeleton currentStep={0} />
                                    </div>
                                ) : isLoadingGraph ? (
                                    <GraphSkeleton />
                                ) : graphNodes.length > 0 ? (
                                    <GraphVisualizer
                                        nodes={graphNodes} links={graphLinks}
                                        onNodeClick={handleNodeClick} graphMeta={graphMeta}
                                        highlightedNodeIds={graphHighlightIds}
                                        onHighlightReady={() => {/* funcNameToNodeId is auto-built in DashboardContext */}}
                                        graphSummary={graphSummary}
                                        onGraphSummaryChange={setGraphSummary}
                                    />
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center bg-slate-900 text-slate-400 min-h-[400px]">
                                        <div className="relative mb-4">
                                            <div className="absolute inset-0 animate-ping-slow rounded-full bg-slate-700" />
                                            <Network className="w-12 h-12 relative z-10" />
                                        </div>
                                        <p className="font-medium">No graph data</p>
                                        <p className="text-sm mt-1">Ingest a repository to see the knowledge graph</p>
                                    </div>
                                )}
                                {/* Fullscreen button removed from here — now lives in the tab bar */}
                            </ErrorBoundary>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
