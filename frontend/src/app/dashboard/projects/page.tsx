"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDashboard } from "@/contexts/DashboardContext";
import {
    FolderGit2, Sparkles, Loader2, Search, Filter, ChevronsUpDown,
    AlertCircle,
} from "lucide-react";
import ProjectSummaryBar from "@/components/ProjectSummaryBar";
import type { IngestedRepo } from "@/components/ProjectCard";
import type { IngestedRepoRecord } from "@/types/dashboard";

const ProjectCard = dynamic(() => import("@/components/ProjectCard"), { ssr: false });

const VERIFY_STEPS = [
    "Parsing project blocks from resume…",
    "Matching projects to ingested repos…",
    "Running tech stack coverage checks…",
    "Assessing architectural claims…",
    "Computing final scores…",
];

export default function ProjectsPage() {
    const router = useRouter();
    const {
        analysisResult, pdfFile,
        isAnalyzingProjects, projectResults, setProjectResults,
        projectSummary, setProjectSummary,
        projectError, setProjectError,
        projectSearch, setProjectSearch,
        projectFilter, setProjectFilter,
        projectExpandAll, setProjectExpandAll,
        reVerifyingProject, verifyStep,
        ingestedRepoMap, multiRepoIds,
        handleVerifyProjects, handleSingleReVerify,
        setGraphHighlightIds,
    } = useDashboard();

    // Navigate to Verification page with graph tab open, highlighting the requested nodes
    const handleShowInGraph = (nodeIds: string[]) => {
        setGraphHighlightIds(nodeIds);
        router.push("/dashboard/verification?tab=graph");
    };

    const buildIngestedRepos = (): IngestedRepo[] => {
        const relevantIds = new Set(multiRepoIds.length > 0 ? multiRepoIds : []);
        return (
            ingestedRepoMap.length > 0
                ? ingestedRepoMap.filter((r: IngestedRepoRecord) => relevantIds.size === 0 || relevantIds.has(r.repo_id))
                : multiRepoIds.map(rid => ({ repo_id: rid, repo_name: rid.slice(0, 12), github_url: "", owner: "", ingested_at: "" }))
        ).map((r: IngestedRepoRecord) => ({ id: r.repo_id, name: r.repo_name }));
    };

    const resetProjects = () => {
        setProjectResults(null); setProjectSummary(null);
        setProjectError(null); setProjectFilter("All"); setProjectSearch("");
    };

    return (
        <div className="max-w-4xl mx-auto px-6 py-8 animate-fade-in">
            {/* ── Header ────────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                        <FolderGit2 className="w-5 h-5 text-violet-500" />
                        Project Verification
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        AI cross-references your project claims against ingested repos
                    </p>
                </div>
            </div>

            {/* ── No analysis yet ────────────────────────────────────────────── */}
            {!analysisResult && !isAnalyzingProjects && !projectResults && (
                <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
                    <div className="relative">
                        <div className="absolute inset-0 animate-ping-slow rounded-full bg-slate-200" />
                        <FolderGit2 className="w-14 h-14 relative z-10 text-slate-300" />
                    </div>
                    <p className="font-semibold text-slate-500 text-base">No analysis yet</p>
                    <p className="text-sm text-slate-400 max-w-xs leading-relaxed">
                        Run a Skills analysis first, then come back here to verify your project claims.
                    </p>
                    <Link
                        href="/dashboard/verification"
                        className="mt-2 px-6 py-2.5 text-sm font-semibold text-white rounded-xl hover:scale-105 transition-transform"
                        style={{ background: "linear-gradient(135deg,#6366f1,#7c3aed)", boxShadow: "0 4px 14px rgba(99,102,241,0.3)" }}
                    >
                        Go to Verification
                    </Link>
                </div>
            )}

            {/* ── Ready to verify ────────────────────────────────────────────── */}
            {analysisResult && !isAnalyzingProjects && !projectResults && (
                <div className="bg-white rounded-2xl border border-slate-200 p-10 flex flex-col items-center gap-5 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg">
                        <FolderGit2 className="w-8 h-8 text-white" />
                    </div>
                    <div className="max-w-sm">
                        <h3 className="font-bold text-slate-800 text-lg">Verify Your Projects</h3>
                        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                            TrueSkill will parse each project block from your resume, match it to an ingested repo,
                            and check tech stack coverage + architectural claims.
                        </p>
                    </div>
                    {projectError && (
                        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs max-w-sm w-full">
                            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            {projectError}
                        </div>
                    )}
                    {!pdfFile && (
                        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs max-w-sm w-full">
                            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            Please upload your resume PDF in the{" "}
                            <Link href="/dashboard/verification" className="underline font-semibold">Verification</Link> page first.
                        </div>
                    )}
                    <button
                        id="verify-projects-btn"
                        onClick={handleVerifyProjects}
                        disabled={!pdfFile}
                        className="flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-bold text-white shadow-lg transition-all duration-200 hover:scale-105 active:scale-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ background: "linear-gradient(135deg,#6366f1,#7c3aed)", boxShadow: "0 4px 16px rgba(99,102,241,0.35)" }}
                    >
                        <Sparkles className="w-4 h-4" />
                        Verify Projects
                    </button>
                </div>
            )}

            {/* ── Loading ────────────────────────────────────────────────────── */}
            {isAnalyzingProjects && (
                <div className="flex flex-col gap-4 bg-white rounded-2xl border border-slate-200 p-6">
                    <div className="flex items-center gap-3">
                        <div className="relative flex-shrink-0">
                            <div className="absolute inset-0 bg-violet-400/20 rounded-full blur-md animate-pulse" />
                            <div className="w-10 h-10 rounded-full bg-white border border-violet-100 shadow-sm flex items-center justify-center relative z-10">
                                <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
                            </div>
                        </div>
                        <div>
                            <h3 className="font-semibold text-slate-800 text-sm">Verifying Projects</h3>
                            <p className="text-xs text-slate-400 transition-all duration-500">{VERIFY_STEPS[verifyStep]}</p>
                        </div>
                    </div>
                    {[0, 1, 2].map(i => (
                        <div key={i} className="h-24 rounded-2xl bg-slate-100 animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
                    ))}
                </div>
            )}

            {/* ── Results ────────────────────────────────────────────────────── */}
            {projectResults && projectResults.length > 0 && (() => {
                const ingestedRepos = buildIngestedRepos();
                const search = projectSearch.toLowerCase();
                const filtered = projectResults.filter(p => {
                    const matchesSearch = !search || p.name.toLowerCase().includes(search) || p.tech_stack.some(t => t.toLowerCase().includes(search));
                    const matchesFilter = projectFilter === "All" || p.status === projectFilter;
                    return matchesSearch && matchesFilter;
                });

                return (
                    <div className="flex flex-col gap-4">
                        {projectSummary && (
                            <ProjectSummaryBar
                                summary={projectSummary}
                                onFilterChange={f => setProjectFilter(f as typeof projectFilter)}
                                activeFilter={projectFilter}
                            />
                        )}

                        {/* Toolbar */}
                        <div className="flex-shrink-0 px-4 pt-3 pb-2 bg-white rounded-2xl border border-slate-200 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                                <div className="relative flex-1 min-w-[140px]">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                                    <input type="text" placeholder="Search projects or tech…"
                                        value={projectSearch} onChange={e => setProjectSearch(e.target.value)}
                                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder:text-slate-400" />
                                </div>
                                <div className="relative">
                                    <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                                    <select value={projectFilter} onChange={e => setProjectFilter(e.target.value as typeof projectFilter)}
                                        className="pl-7 pr-6 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 text-slate-600 appearance-none cursor-pointer">
                                        <option value="All">All</option>
                                        <option value="Verified">✅ Verified</option>
                                        <option value="Partially Verified">⚠️ Partial</option>
                                        <option value="Unverified">❌ Unverified</option>
                                        <option value="Repo Not Ingested">🕐 Not Ingested</option>
                                    </select>
                                </div>
                                <button
                                    onClick={() => setProjectExpandAll(v => v === true ? false : true)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/50 transition-colors">
                                    <ChevronsUpDown className="w-3 h-3" />
                                    {projectExpandAll ? "Collapse All" : "Expand All"}
                                </button>
                                <button onClick={resetProjects} className="text-[11px] text-indigo-500 hover:underline px-1">
                                    Re-verify
                                </button>
                            </div>
                            <p className="text-[11px] text-slate-400">
                                {filtered.length} of {projectResults.length} project{projectResults.length !== 1 ? "s" : ""} shown
                            </p>
                        </div>

                        {/* Project cards */}
                        <div className="space-y-3">
                            {filtered.length > 0 ? filtered.map((proj, idx) => (
                                <ProjectCard
                                    key={proj.project_id}
                                    result={proj}
                                    index={idx}
                                    forceExpanded={projectExpandAll}
                                    onShowInGraph={handleShowInGraph}
                                    ingestedRepos={ingestedRepos}
                                    onReVerify={handleSingleReVerify}
                                    isReVerifying={reVerifyingProject === proj.project_id}
                                    repoIds={multiRepoIds}
                                />
                            )) : (
                                <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400 bg-white rounded-2xl border border-slate-200">
                                    <Search className="w-8 h-8 text-slate-300" />
                                    <p className="text-sm font-medium">No projects match your filter</p>
                                    <button onClick={() => { setProjectSearch(""); setProjectFilter("All"); }} className="text-xs text-indigo-500 hover:underline">Clear filters</button>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })()}

            {/* ── No projects found ──────────────────────────────────────────── */}
            {projectResults && projectResults.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3 bg-white rounded-2xl border border-slate-200">
                    <FolderGit2 className="w-10 h-10 text-slate-300" />
                    <p className="font-medium text-slate-500">No projects detected</p>
                    <p className="text-sm text-center max-w-xs text-slate-400">
                        The AI couldn&apos;t find any project blocks in your resume. Make sure projects are listed with a name, tech stack, and bullet points.
                    </p>
                    <button onClick={resetProjects} className="text-xs text-indigo-500 hover:underline mt-1">Try again</button>
                </div>
            )}
        </div>
    );
}
