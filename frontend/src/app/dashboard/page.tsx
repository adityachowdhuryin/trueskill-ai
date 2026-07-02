"use client";

import Link from "next/link";
import { useDashboard } from "@/contexts/DashboardContext";
import {
    Microscope, FolderGit2, GraduationCap, ChevronRight,
    Upload, GitBranch, Sparkles, CheckCircle2, Clock,
    TrendingUp, AlertTriangle, XCircle, BarChart3, Star,
} from "lucide-react";

function StatCard({ label, value, color, icon: Icon }: {
    label: string; value: number | string; color: string;
    icon: React.ElementType;
}) {
    return (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
                <Icon className="w-5 h-5 text-white" />
            </div>
            <div>
                <p className="text-2xl font-extrabold text-slate-900 leading-none">{value}</p>
                <p className="text-xs text-slate-500 font-medium mt-0.5">{label}</p>
            </div>
        </div>
    );
}

function QuickActionCard({ href, icon: Icon, title, desc, gradient, badge }: {
    href: string; icon: React.ElementType; title: string; desc: string;
    gradient: string; badge?: string;
}) {
    return (
        <Link href={href} className="group relative bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-lg hover:border-indigo-200 transition-all duration-200 hover:-translate-y-0.5 flex flex-col gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm ${gradient}`}>
                <Icon className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-slate-800 text-sm">{title}</h3>
                    {badge && (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full">{badge}</span>
                    )}
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
            </div>
            <div className="flex items-center text-xs font-semibold text-indigo-600 group-hover:gap-2 transition-all">
                <span>Open</span>
                <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
            </div>
        </Link>
    );
}

const ONBOARDING_STEPS = [
    { step: 1, icon: Upload, label: "Upload Resume", desc: "Drop your PDF resume to auto-detect GitHub", href: "/dashboard/verification" },
    { step: 2, icon: GitBranch, label: "Select Repositories", desc: "Choose your GitHub repos to cross-reference", href: "/dashboard/verification" },
    { step: 3, icon: Microscope, label: "Verify Skills", desc: "AI agents scan your code and verify every claim", href: "/dashboard/verification" },
    { step: 4, icon: GraduationCap, label: "Get Coached", desc: "Bridge skill gaps with personalized action plans", href: "/dashboard/coach" },
];

export default function OverviewPage() {
    const { analysisResult, projectResults, bridgeProjects, pdfFileName, githubUsername, atsReport } = useDashboard();

    const hasAnalysis = (analysisResult?.verification_results?.length ?? 0) > 0;
    const summary = analysisResult?.summary;
    const avgScore = summary?.average_score ?? 0;
    const authenticityScore = analysisResult?.authenticity_score ?? null;

    return (
        <div className="max-w-5xl mx-auto px-6 py-8 space-y-8 animate-fade-in">
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                        {githubUsername ? `Hey, @${githubUsername} 👋` : "Welcome to TrueSkill AI"}
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        {hasAnalysis
                            ? "Your latest analysis is ready. Explore the sections below."
                            : "Upload your resume to get started with AI-powered skill verification."}
                    </p>
                </div>

                {/* Session restore badge */}
                {pdfFileName && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-700 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="max-w-[180px] truncate">{pdfFileName}</span>
                    </div>
                )}
            </div>

            {/* ── Stats Row (only when analysis exists) ──────────────────────── */}
            {hasAnalysis && summary && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    <StatCard
                        label="Verified"
                        value={summary.verified}
                        color="bg-gradient-to-br from-emerald-400 to-emerald-600"
                        icon={CheckCircle2}
                    />
                    <StatCard
                        label="Partial"
                        value={summary.partially_verified}
                        color="bg-gradient-to-br from-amber-400 to-amber-600"
                        icon={AlertTriangle}
                    />
                    <StatCard
                        label="Unverified"
                        value={summary.unverified}
                        color="bg-gradient-to-br from-red-400 to-red-600"
                        icon={XCircle}
                    />
                    <StatCard
                        label="Avg Score"
                        value={`${Math.round(avgScore)}%`}
                        color="bg-gradient-to-br from-indigo-400 to-indigo-600"
                        icon={BarChart3}
                    />
                    {authenticityScore !== null && (
                        <StatCard
                            label="Authenticity"
                            value={`${Math.round(authenticityScore)}%`}
                            color="bg-gradient-to-br from-violet-400 to-violet-600"
                            icon={Star}
                        />
                    )}
                </div>
            )}

            {/* ── Onboarding flow (no analysis yet) ──────────────────────────── */}
            {!hasAnalysis && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6">
                    <h2 className="text-base font-bold text-slate-800 mb-5 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-500" />
                        Get started in 4 steps
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {ONBOARDING_STEPS.map(s => {
                            const Icon = s.icon;
                            return (
                                <Link key={s.step} href={s.href}
                                    className="group flex flex-col gap-3 p-4 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/50 transition-all"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-[11px] font-black flex items-center justify-center flex-shrink-0">
                                            {s.step}
                                        </span>
                                        <Icon className="w-4 h-4 text-indigo-500" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-slate-800">{s.label}</p>
                                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{s.desc}</p>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                    <Link
                        href="/dashboard/verification"
                        className="mt-5 inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white rounded-xl hover:scale-105 transition-transform"
                        style={{ background: "linear-gradient(135deg,#6366f1,#7c3aed)", boxShadow: "0 4px 14px rgba(99,102,241,0.3)" }}
                    >
                        <Upload className="w-4 h-4" />
                        Start Verification
                    </Link>
                </div>
            )}

            {/* ── Quick-action cards ──────────────────────────────────────────── */}
            <div>
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Quick access</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <QuickActionCard
                        href="/dashboard/verification"
                        icon={Microscope}
                        title="Skill Verification"
                        desc="Upload your resume, select repos, and let AI verify every skill claim against your actual code."
                        gradient="bg-gradient-to-br from-indigo-400 to-indigo-600"
                        badge={hasAnalysis ? "Done" : undefined}
                    />
                    <QuickActionCard
                        href="/dashboard/projects"
                        icon={FolderGit2}
                        title="Project Verification"
                        desc="Check each project claim — tech stack coverage, architecture, and bullet point truthfulness."
                        gradient="bg-gradient-to-br from-violet-400 to-violet-600"
                        badge={(projectResults?.length ?? 0) > 0 ? "Done" : undefined}
                    />
                    <QuickActionCard
                        href="/dashboard/coach"
                        icon={GraduationCap}
                        title="Career Coach"
                        desc="Get personalized bridge projects, ATS scoring, skill heatmap, and a week-by-week learning roadmap."
                        gradient="bg-gradient-to-br from-fuchsia-400 to-violet-600"
                        badge={bridgeProjects.length > 0 ? "Ready" : undefined}
                    />
                </div>
            </div>

            {/* ── Session summary (when analysis is done) ─────────────────────── */}
            {hasAnalysis && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white border border-slate-200 rounded-2xl p-5">
                        <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wide mb-3">
                            <Microscope className="w-3.5 h-3.5" />
                            Skills
                        </div>
                        <p className="text-slate-700 text-sm">
                            <span className="font-bold text-indigo-600 text-lg">{summary?.total_claims ?? 0}</span> skills verified
                            across <span className="font-semibold">{analysisResult?.errors?.length === 0 ? "all" : "some"}</span> repos
                        </p>
                        <Link href="/dashboard/verification" className="mt-3 text-xs text-indigo-600 font-semibold hover:underline flex items-center gap-1">
                            View results <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-2xl p-5">
                        <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wide mb-3">
                            <FolderGit2 className="w-3.5 h-3.5" />
                            Projects
                        </div>
                        {(projectResults?.length ?? 0) > 0 ? (
                            <p className="text-slate-700 text-sm">
                                <span className="font-bold text-violet-600 text-lg">{projectResults!.length}</span> projects verified
                            </p>
                        ) : (
                            <p className="text-xs text-slate-500 leading-relaxed">Run project verification to check your portfolio claims.</p>
                        )}
                        <Link href="/dashboard/projects" className="mt-3 text-xs text-indigo-600 font-semibold hover:underline flex items-center gap-1">
                            {(projectResults?.length ?? 0) > 0 ? "View projects" : "Verify now"} <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-2xl p-5">
                        <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wide mb-3">
                            <TrendingUp className="w-3.5 h-3.5" />
                            Coach
                        </div>
                        {bridgeProjects.length > 0 ? (
                            <p className="text-slate-700 text-sm">
                                <span className="font-bold text-fuchsia-600 text-lg">{bridgeProjects.length}</span> bridge project{bridgeProjects.length > 1 ? "s" : ""} generated
                                {atsReport && <span className="block text-xs text-slate-500 mt-0.5">ATS score: <span className="font-bold text-indigo-600">{atsReport.ats_score}%</span></span>}
                            </p>
                        ) : (
                            <p className="text-xs text-slate-500 leading-relaxed">Paste a job description in Career Coach to get your action plan.</p>
                        )}
                        <Link href="/dashboard/coach" className="mt-3 text-xs text-indigo-600 font-semibold hover:underline flex items-center gap-1">
                            {bridgeProjects.length > 0 ? "View plan" : "Get coached"} <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                    </div>
                </div>
            )}

            {/* ── Loading state indicator ──────────────────────────────────────── */}
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <Clock className="w-3 h-3" />
                <span>Session auto-saved. Data persists across navigations.</span>
            </div>
        </div>
    );
}
