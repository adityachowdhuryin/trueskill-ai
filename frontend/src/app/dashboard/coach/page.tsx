"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useDashboard, API_BASE_URL } from "@/contexts/DashboardContext";
import {
    GraduationCap, Sparkles, Loader2, FileSearch, FileDown,
    Target, Clock, BookOpen, ChevronRight, CheckCircle,
    Star, MessageSquare,
} from "lucide-react";
import SkillsGapHeatmap from "@/components/SkillsGapHeatmap";
import LearningRoadmap from "@/components/LearningRoadmap";
import JdUrlInput from "@/components/JdUrlInput";
import SalaryIntelligenceCard from "@/components/SalaryIntelligenceCard";
import MatchingJobsPanel from "@/components/MatchingJobsPanel";

const ATSScorePanel = dynamic(() => import("@/components/ATSScorePanel"), { ssr: false });
const MockInterview = dynamic(() => import("@/components/MockInterview"), { ssr: false });
const TailoredResume = dynamic(() => import("@/components/TailoredResume"), { ssr: false });
const ApplicationKit = dynamic(() => import("@/components/ApplicationKit"), { ssr: false });

export default function CoachPage() {
    const {
        analysisResult, pdfFile, githubUsername, extractedText,
        jobDescription, setJobDescription, isGeneratingPlan, coachError, setCoachError,
        bridgeProjects, gapSummary, activeBridgeTab, setActiveBridgeTab,
        showAllSteps, setShowAllSteps, numProjects, setNumProjects,
        coachFocused, setCoachFocused,
        heatmap, isGeneratingHeatmap, roadmap, isGeneratingRoadmap,
        hoursPerWeek, setHoursPerWeek,
        isExportingCoach, atsReport, isScoring, atsError,
        showMockInterview, setShowMockInterview,
        showTailoredResume, setShowTailoredResume,
        showApplicationKit, setShowApplicationKit,
        handleGenerateActionPlan, handleGenerateHeatmap, handleGenerateRoadmap,
        handleExportCoachReport, handleGetATSScore,
        setAssistantOpen, chatMessages,
    } = useDashboard();

    const verifiedSkills = analysisResult?.verification_results?.map(v => ({
        topic: v.topic, score: v.score, status: v.status,
    })) ?? [];

    const hasAnalysis = verifiedSkills.length > 0;

    return (
        <div className="max-w-6xl mx-auto px-6 py-8 space-y-6 animate-fade-in">
            {/* ── Header ────────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-gradient-to-br from-violet-100 to-fuchsia-100 rounded-xl border border-white shadow-inner">
                        <GraduationCap className="w-5 h-5 text-violet-600" />
                    </div>
                    <div>
                        <h1 className="text-xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-violet-700 to-fuchsia-700 tracking-tight">
                            Career Coach
                        </h1>
                        <p className="text-sm text-slate-500 font-medium">Get a personalized action plan to bridge skill gaps</p>
                    </div>
                </div>

                {bridgeProjects.length > 0 && (
                    <button
                        id="export-coach-report-btn"
                        onClick={handleExportCoachReport}
                        disabled={isExportingCoach}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all disabled:opacity-50"
                        style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.25)", color: "#7c3aed" }}
                    >
                        {isExportingCoach ? <><Loader2 className="w-4 h-4 animate-spin" />Exporting…</> : <><FileDown className="w-4 h-4" />Export Report</>}
                    </button>
                )}
            </div>

            {/* ── No analysis warning ────────────────────────────────────────── */}
            {!hasAnalysis && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3">
                    <GraduationCap className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-semibold text-amber-800">Skills not verified yet</p>
                        <p className="text-xs text-amber-700 mt-1">
                            Run a skills analysis first to get personalised coaching.{" "}
                            <Link href="/dashboard/verification" className="underline font-semibold">Go to Verification →</Link>
                        </p>
                    </div>
                </div>
            )}

            {/* ── Two-column grid ────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* ── Left: JD Input ─────────────────────────────────────────── */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col gap-4 shadow-sm">
                    <h2 className="text-sm font-bold text-slate-700">Target Job Description</h2>

                    <JdUrlInput
                        apiBase={API_BASE_URL}
                        disabled={isGeneratingPlan}
                        onFetched={text => { setJobDescription(text); setCoachError(null); }}
                    />

                    <div className="relative">
                        <textarea
                            id="job-description-input"
                            placeholder="Or paste the job description here..."
                            value={jobDescription}
                            onChange={e => setJobDescription(e.target.value)}
                            onFocus={() => setCoachFocused(true)}
                            onBlur={() => setCoachFocused(false)}
                            className={`w-full h-36 px-4 py-3 border rounded-xl text-sm focus:outline-none resize-none transition-all duration-300 ${coachFocused ? "border-violet-400 shadow-[0_0_0_3px_rgba(139,92,246,0.15)]" : "border-slate-300 hover:border-slate-400"}`}
                        />
                        {jobDescription && (
                            <div className="absolute bottom-3 right-3 text-[10px] text-slate-400 pointer-events-none">
                                {jobDescription.split(/\s+/).filter(Boolean).length} words
                            </div>
                        )}
                    </div>

                    {coachError && <p className="text-sm text-red-600">{coachError}</p>}
                    {atsError && <p className="text-sm text-red-600">{atsError}</p>}

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            id="generate-plan-btn"
                            onClick={() => handleGenerateActionPlan()}
                            disabled={isGeneratingPlan || !jobDescription.trim() || !hasAnalysis}
                            className="relative overflow-hidden px-6 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-violet-200"
                        >
                            {isGeneratingPlan && <span className="absolute inset-0 animate-shimmer-dark opacity-30" />}
                            {isGeneratingPlan ? (
                                <><Loader2 className="w-4 h-4 animate-spin relative z-10" /><span className="relative z-10">Generating…</span></>
                            ) : (
                                <><Sparkles className="w-4 h-4 relative z-10" /><span className="relative z-10">Generate Action Plan</span></>
                            )}
                        </button>

                        {/* Project count picker */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-500 font-medium">Projects:</span>
                            {[1, 2, 3, 4, 5].map(n => (
                                <button key={n} onClick={() => setNumProjects(n)}
                                    className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${numProjects === n ? "bg-violet-600 text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                                    {n}
                                </button>
                            ))}
                        </div>

                        <button
                            id="get-ats-score-btn"
                            onClick={handleGetATSScore}
                            disabled={isScoring || !jobDescription.trim() || !pdfFile}
                            title={!pdfFile ? "Upload a PDF resume in Verification first" : ""}
                            className="px-5 py-2.5 text-sm font-medium rounded-lg flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ background: isScoring ? "rgba(99,102,241,0.1)" : "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.35)", color: "#6366f1" }}
                        >
                            {isScoring ? <><Loader2 className="w-4 h-4 animate-spin" />Scoring…</> : <><FileSearch className="w-4 h-4" />Get ATS Score</>}
                        </button>
                    </div>

                    {/* More tools */}
                    {hasAnalysis && jobDescription && (
                        <div className="pt-3 border-t border-slate-100">
                            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-2.5">More Tools</p>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    id="mock-interview-btn"
                                    onClick={() => { setShowMockInterview(true); setShowTailoredResume(false); setShowApplicationKit(false); }}
                                    className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all hover:scale-105"
                                    style={{ background: showMockInterview ? "#7c3aed" : "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.3)", color: showMockInterview ? "white" : "#7c3aed" }}
                                >
                                    🎙 Mock Interview
                                </button>
                                <button
                                    id="tailor-resume-btn"
                                    onClick={() => { setShowTailoredResume(true); setShowMockInterview(false); setShowApplicationKit(false); }}
                                    disabled={!pdfFile}
                                    title={!pdfFile ? "Upload a PDF resume first" : ""}
                                    className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                                    style={{ background: showTailoredResume ? "#0f172a" : "rgba(15,23,42,0.06)", border: "1px solid rgba(15,23,42,0.2)", color: showTailoredResume ? "white" : "#0f172a" }}
                                >
                                    ✍️ Tailor Resume
                                </button>
                                <button
                                    id="application-kit-btn"
                                    onClick={() => { setShowApplicationKit(true); setShowMockInterview(false); setShowTailoredResume(false); }}
                                    className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all hover:scale-105"
                                    style={{ background: showApplicationKit ? "#1e293b" : "rgba(30,41,59,0.06)", border: "1px solid rgba(30,41,59,0.2)", color: showApplicationKit ? "white" : "#1e293b" }}
                                >
                                    📦 Application Kit
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Right: Bridge Projects ─────────────────────────────────── */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    {bridgeProjects.length > 0 ? (
                        <div className="space-y-3 h-full">
                            {gapSummary && (
                                <div className="px-4 py-3 rounded-xl text-xs text-slate-600 leading-relaxed" style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}>
                                    <span className="font-bold text-violet-700">Gap Analysis: </span>{gapSummary}
                                </div>
                            )}

                            {bridgeProjects.length > 1 && (
                                <div className="flex gap-1.5 flex-wrap">
                                    {bridgeProjects.map((p, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => { setActiveBridgeTab(idx); setShowAllSteps(false); }}
                                            className={`flex-1 min-w-[80px] py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-all truncate ${activeBridgeTab === idx ? "bg-violet-600 text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                                            title={p.gap_skill}
                                        >
                                            #{idx + 1} {p.gap_skill}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {(() => {
                                const proj = bridgeProjects[activeBridgeTab];
                                if (!proj) return null;
                                return (
                                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 overflow-y-auto max-h-[480px]">
                                        <div className="flex items-start justify-between mb-3">
                                            <div>
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className="px-2 py-1 bg-violet-100 text-violet-700 text-xs font-medium rounded">Bridge #{proj.rank ?? activeBridgeTab + 1}</span>
                                                    {(proj.estimated_score_gain ?? 0) > 0 && (
                                                        <span className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded border border-indigo-100">
                                                            +{proj.estimated_score_gain}% match boost
                                                        </span>
                                                    )}
                                                </div>
                                                <h3 className="text-base font-bold text-slate-900">{proj.project_title}</h3>
                                            </div>
                                            <span className={`px-2 py-1 text-xs font-medium rounded flex-shrink-0 ${proj.difficulty === "Beginner" ? "bg-green-100 text-green-700" : proj.difficulty === "Intermediate" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                                                {proj.difficulty}
                                            </span>
                                        </div>

                                        <p className="text-sm text-slate-600 mb-3">{proj.description}</p>

                                        {proj.why_this_gap && (
                                            <p className="text-xs text-slate-500 italic mb-3 px-3 py-2 rounded-lg" style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)" }}>
                                                💡 {proj.why_this_gap}
                                            </p>
                                        )}

                                        <div className="flex items-center gap-4 text-xs text-slate-500 mb-4">
                                            <div className="flex items-center gap-1"><Target className="w-3.5 h-3.5" /><span>Gap: <strong className="text-violet-600">{proj.gap_skill}</strong></span></div>
                                            <div className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /><span>{proj.estimated_time}</span></div>
                                        </div>

                                        <div className="flex flex-wrap gap-1.5 mb-4">
                                            {proj.tech_stack.map((tech, i) => (
                                                <span key={i} className="px-2.5 py-0.5 bg-violet-50 text-violet-700 text-xs font-medium rounded-full border border-violet-100 hover:bg-violet-100 transition-colors cursor-default">
                                                    {tech}
                                                </span>
                                            ))}
                                        </div>

                                        {proj.learning_outcomes?.length > 0 && (
                                            <div className="mb-4">
                                                <h4 className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1">
                                                    <Star className="w-3.5 h-3.5 text-amber-500" />Learning Outcomes
                                                </h4>
                                                <ul className="space-y-1">
                                                    {proj.learning_outcomes.map((lo, i) => (
                                                        <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                                                            <CheckCircle className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />{lo}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        <div className="border-t border-slate-100 pt-4">
                                            <h4 className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1">
                                                <BookOpen className="w-3.5 h-3.5" />Steps to Complete
                                            </h4>
                                            <ul className="space-y-1.5">
                                                {(showAllSteps ? proj.steps : proj.steps.slice(0, 4)).map((step, i) => (
                                                    <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                                                        <ChevronRight className="w-3 h-3 text-violet-500 mt-0.5 flex-shrink-0" />
                                                        <span>{step}</span>
                                                    </li>
                                                ))}
                                                {proj.steps.length > 4 && (
                                                    <li>
                                                        <button
                                                            onClick={() => setShowAllSteps(!showAllSteps)}
                                                            className="text-xs text-violet-500 hover:text-violet-700 ml-5 cursor-pointer transition-colors"
                                                        >
                                                            {showAllSteps ? "Show less" : `+${proj.steps.length - 4} more steps…`}
                                                        </button>
                                                    </li>
                                                )}
                                            </ul>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 py-16 gap-3">
                            <BookOpen className="w-10 h-10" />
                            <p className="font-semibold">No action plan yet</p>
                            <p className="text-sm text-center mt-1">
                                Paste a job description, choose the number of projects, and click Generate
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Salary & Matching Jobs ─────────────────────────────────────── */}
            {jobDescription && hasAnalysis && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <SalaryIntelligenceCard
                        apiBase={API_BASE_URL}
                        jobDescription={jobDescription}
                        verifiedSkills={verifiedSkills}
                    />
                    <MatchingJobsPanel
                        apiBase={API_BASE_URL}
                        verifiedSkills={verifiedSkills}
                        resumeText={extractedText ?? ""}
                        jobDescription={jobDescription}
                        onUseAsTarget={(_url, jdText) => {
                            if (jdText) {
                                setJobDescription(jdText);
                                setCoachError(null);
                                setTimeout(() => handleGenerateActionPlan(jdText), 100);
                            }
                        }}
                    />
                </div>
            )}

            {/* ── Skill Gap Heatmap ──────────────────────────────────────────── */}
            <SkillsGapHeatmap
                heatmap={heatmap}
                isLoading={isGeneratingHeatmap}
                onGenerate={handleGenerateHeatmap}
                atsAvailable={!!atsReport}
            />

            {/* ── Learning Roadmap ───────────────────────────────────────────── */}
            <LearningRoadmap
                roadmap={roadmap}
                isLoading={isGeneratingRoadmap}
                hoursPerWeek={hoursPerWeek}
                onHoursChange={setHoursPerWeek}
                onGenerate={handleGenerateRoadmap}
                bridgeProjectsAvailable={bridgeProjects.length > 0}
            />

            {/* ── Alex Chat CTA ──────────────────────────────────────────────── */}
            <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl border border-indigo-100 p-8 text-center">
                <div className="inline-flex p-3 bg-white rounded-2xl shadow-sm border border-indigo-100 mb-4">
                    <MessageSquare className="w-6 h-6 text-indigo-500" />
                </div>
                <p className="text-base font-bold text-slate-800 mb-2">Ask Alex, your AI assistant</p>
                <p className="text-sm text-slate-500 mb-5 max-w-md mx-auto leading-relaxed">
                    Alex knows your full session: verified skills, ATS score, project results, and graph data.
                    Ask anything about your results, gaps, or next steps.
                </p>
                <button
                    id="coach-open-alex-btn"
                    onClick={() => setAssistantOpen(true)}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105"
                    style={{ background: "linear-gradient(135deg, #6366f1, #7c3aed)", boxShadow: "0 4px 14px rgba(99,102,241,0.35)" }}
                >
                    <MessageSquare className="w-4 h-4" /> Open Alex
                    {chatMessages.length > 0 && (
                        <span className="bg-white/25 rounded-full px-2 py-0.5 text-[11px]">
                            {chatMessages.length} messages
                        </span>
                    )}
                </button>
            </div>

            {/* ── ATS Score Panel ─────────────────────────────────────────────── */}
            {atsReport && (
                <div className="border-t border-slate-100 pt-6">
                    <ATSScorePanel
                        report={atsReport}
                        candidateName={pdfFile?.name.replace(/\.pdf$/i, "") ?? "Candidate"}
                        apiBaseUrl={API_BASE_URL}
                    />
                </div>
            )}

            {/* ── Feature panels (full-screen modals) ─────────────────────────── */}
            {showMockInterview && hasAnalysis && (
                <div
                    className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={(e) => { if (e.target === e.currentTarget) setShowMockInterview(false); }}
                >
                    <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl">
                        <MockInterview
                            apiBase={API_BASE_URL}
                            verifiedSkills={verifiedSkills}
                            jobDescription={jobDescription}
                            gapSummary={gapSummary ?? ""}
                            onClose={() => setShowMockInterview(false)}
                        />
                    </div>
                </div>
            )}
            {showTailoredResume && hasAnalysis && pdfFile && (
                <div
                    className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={(e) => { if (e.target === e.currentTarget) setShowTailoredResume(false); }}
                >
                    <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl">
                        <TailoredResume
                            apiBase={API_BASE_URL}
                            resumeText={extractedText ?? ""}
                            verifiedSkills={verifiedSkills}
                            jobDescription={jobDescription}
                            onClose={() => setShowTailoredResume(false)}
                        />
                    </div>
                </div>
            )}
            {showApplicationKit && hasAnalysis && (
                <div
                    className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={(e) => { if (e.target === e.currentTarget) setShowApplicationKit(false); }}
                >
                    <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl">
                        <ApplicationKit
                            apiBase={API_BASE_URL}
                            candidateName={githubUsername ?? ""}
                            verifiedSkills={verifiedSkills}
                            jobDescription={jobDescription}
                            gapSummary={gapSummary ?? ""}
                            onClose={() => setShowApplicationKit(false)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
