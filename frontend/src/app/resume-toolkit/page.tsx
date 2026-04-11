"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
    Upload, FileText, Loader2, ChevronRight, Search, MapPin,
    Briefcase, User, Mail, AlertCircle, CheckCircle, RefreshCw,
    Zap, Target, Send, ArrowLeft, ExternalLink, Info,
} from "lucide-react";
import JobCard, { type JobPosting } from "@/components/JobCard";
import ResumeOptimizer from "@/components/ResumeOptimizer";
import EmailComposer from "@/components/EmailComposer";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// =============================================================================
// Types
// =============================================================================

interface InferredProfile {
    role: string;
    location: string;
    skills_summary: string;
}

interface OptimizationResult {
    original_skills_section: string;
    optimized_skills_section: string;
    injected_keywords: string[];
    changes_summary: string;
    optimization_tip: string;
}

interface HiringManagerResult {
    name: string;
    email: string;
    title: string;
    confidence: string;
    source: string;
    linkedin_url: string;
    linkedin_search_url: string;
}

interface HiringManagerSearchResult {
    primary: HiringManagerResult;
    alternatives: HiringManagerResult[];
    search_suggestions: string[];
    email_patterns: string[];
    company_domain: string;
}

interface EmailDraft {
    subject: string;
    body: string;
    tone: string;
    word_count: number;
}

type Step = 1 | 2 | 3 | 4;

// =============================================================================
// Step Progress Bar
// =============================================================================

const STEPS = [
    { id: 1, icon: Search, label: "Find Jobs", shortLabel: "Jobs" },
    { id: 2, icon: Target, label: "ATS Optimizer", shortLabel: "Optimize" },
    { id: 3, icon: User, label: "Hiring Manager", shortLabel: "Manager" },
    { id: 4, icon: Mail, label: "Draft Email", shortLabel: "Email" },
];

function StepBar({ current, maxReached }: { current: Step; maxReached: Step }) {
    return (
        <div className="flex items-center gap-0 relative">
            {STEPS.map((step, i) => {
                const StepIcon = step.icon;
                const isActive = step.id === current;
                const isComplete = step.id < maxReached || (step.id < current);
                const isAccessible = step.id <= maxReached;

                return (
                    <div key={step.id} className="flex items-center">
                        <div
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-300 ${isAccessible ? "cursor-pointer hover:opacity-80" : "cursor-not-allowed opacity-40"}`}
                            style={{
                                background: isActive
                                    ? "linear-gradient(135deg, rgba(99,102,241,0.3) 0%, rgba(139,92,246,0.2) 100%)"
                                    : isComplete
                                        ? "rgba(16,185,129,0.1)"
                                        : "rgba(255,255,255,0.04)",
                                border: `1px solid ${isActive ? "rgba(99,102,241,0.5)" : isComplete ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.08)"}`,
                                color: isActive ? "#a5b4fc" : isComplete ? "#6ee7b7" : "#64748b",
                            }}
                        >
                            <div
                                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black"
                                style={{
                                    background: isActive
                                        ? "rgba(99,102,241,0.4)"
                                        : isComplete
                                            ? "rgba(16,185,129,0.3)"
                                            : "rgba(255,255,255,0.06)",
                                }}
                            >
                                {isComplete ? (
                                    <CheckCircle size={12} />
                                ) : (
                                    <StepIcon size={11} />
                                )}
                            </div>
                            <span className="hidden sm:block">{step.label}</span>
                            <span className="block sm:hidden">{step.shortLabel}</span>
                        </div>

                        {i < STEPS.length - 1 && (
                            <div
                                className="w-6 h-px mx-1 transition-all duration-500"
                                style={{
                                    background: step.id < current ? "rgba(16,185,129,0.4)" : "rgba(255,255,255,0.08)",
                                }}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// =============================================================================
// Confidence Badge
// =============================================================================

function ConfidenceBadge({ confidence }: { confidence: string }) {
    const styles: Record<string, { bg: string; border: string; color: string }> = {
        High:        { bg: "rgba(16,185,129,0.12)",  border: "rgba(16,185,129,0.35)",  color: "#6ee7b7" },
        Medium:      { bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.35)",  color: "#fcd34d" },
        Guessed:     { bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.35)",   color: "#fca5a5" },
        "Not Found": { bg: "rgba(100,116,139,0.12)", border: "rgba(100,116,139,0.25)", color: "#94a3b8" },
    };
    const style = styles[confidence] ?? styles["Not Found"];

    return (
        <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
            style={{ background: style.bg, border: `1px solid ${style.border}`, color: style.color }}
        >
            {confidence}
        </span>
    );
}

// =============================================================================
// Main Page
// =============================================================================

export default function ResumeToolkitPage() {
    const [currentStep, setCurrentStep] = useState<Step>(1);
    const [maxReached, setMaxReached] = useState<Step>(1);

    // Step 1 state
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [locationOverride, setLocationOverride] = useState("");
    const [isDragging, setIsDragging] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [profile, setProfile] = useState<InferredProfile | null>(null);
    const [jobs, setJobs] = useState<JobPosting[]>([]);
    const [searchError, setSearchError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Step 2 state
    const [selectedJob, setSelectedJob] = useState<JobPosting | null>(null);
    const [jobDescOverride, setJobDescOverride] = useState("");
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [optimization, setOptimization] = useState<OptimizationResult | null>(null);
    const [optimizeError, setOptimizeError] = useState<string | null>(null);
    const [atsScore, setAtsScore] = useState<number | null>(null);
    const [missingKeywords, setMissingKeywords] = useState<string[]>([]);

    // Step 3 state
    const [isSearchingManager, setIsSearchingManager] = useState(false);
    const [managerResult, setManagerResult] = useState<HiringManagerSearchResult | null>(null);
    const [managerError, setManagerError] = useState<string | null>(null);
    const [manualEmail, setManualEmail] = useState("");
    const [manualName, setManualName] = useState("");

    // Step 4 state
    const [isDraftingEmail, setIsDraftingEmail] = useState(false);
    const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);
    const [emailError, setEmailError] = useState<string | null>(null);

    const goToStep = (step: Step) => {
        if (step > maxReached) return;
        setCurrentStep(step);
    };

    const advanceToStep = (step: Step) => {
        setCurrentStep(step);
        if (step > maxReached) setMaxReached(step);
    };

    // ------- Step 1: Upload + Search Jobs -------

    // Helper: extract a readable string from a FastAPI error response
    const parseApiError = (errBody: unknown, fallback: string): string => {
        if (!errBody) return fallback;
        if (typeof errBody === "string") return errBody;
        if (typeof errBody === "object") {
            const e = errBody as Record<string, unknown>;
            if (typeof e.detail === "string") return e.detail;
            // FastAPI validation error: detail is an array of objects
            if (Array.isArray(e.detail)) {
                return e.detail.map((d: unknown) => {
                    if (typeof d === "object" && d !== null) {
                        const item = d as Record<string, unknown>;
                        return `${Array.isArray(item.loc) ? item.loc.join(" > ") : ""}: ${item.msg ?? ""}`;
                    }
                    return String(d);
                }).join(" | ");
            }
        }
        return fallback;
    };


    const handleFileUpload = useCallback(async (file: File) => {
        if (!file.name.endsWith(".pdf")) {
            setSearchError("Please upload a valid PDF file.");
            return;
        }
        setPdfFile(file);
        setSearchError(null);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFileUpload(file);
    }, [handleFileUpload]);

    const handleSearchJobs = async () => {
        if (!pdfFile) { setSearchError("Please upload your resume first."); return; }
        setIsSearching(true);
        setSearchError(null);
        setJobs([]);
        setProfile(null);

        try {
            const formData = new FormData();
            formData.append("pdf_file", pdfFile);
            if (locationOverride.trim()) formData.append("location_override", locationOverride.trim());

            const res = await fetch(`${API_BASE}/api/resume-toolkit/find-jobs`, {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(parseApiError(err, "Job search failed"));
            }

            const data = await res.json();
            setProfile(data.profile);
            setJobs(data.jobs ?? []);
        } catch (e) {
            setSearchError(e instanceof Error ? e.message : "Job search failed");
        } finally {
            setIsSearching(false);
        }
    };

    const handleSelectJob = (job: JobPosting) => {
        setSelectedJob(job);
        setJobDescOverride(job.description);
    };

    const handleProceedToStep2 = () => {
        if (!selectedJob) { setSearchError("Please select a job first."); return; }
        advanceToStep(2);
    };

    // ------- Step 2: ATS Optimizer -------

    const handleOptimize = async () => {
        if (!pdfFile || !selectedJob) return;
        setIsOptimizing(true);
        setOptimizeError(null);

        try {
            const jd = jobDescOverride || selectedJob.description || "";

            // Step 2a: Get ATS score (to fetch missing keywords) if not already done
            let keywords: string[] = missingKeywords;
            let score: number | null = atsScore;

            if (!keywords.length) {
                const atsForm = new FormData();
                atsForm.append("pdf_file", pdfFile);
                atsForm.append("job_description", jd);

                const atsRes = await fetch(`${API_BASE}/api/ats-score`, {
                    method: "POST",
                    body: atsForm,
                });
                if (atsRes.ok) {
                    const atsData = await atsRes.json();
                    score = atsData.ats_score ?? null;
                    keywords = atsData.top_missing_keywords ?? [];
                    setAtsScore(score);
                    setMissingKeywords(keywords);
                }
            }

            // Step 2b: Send PDF + JD to backend for optimization (text extracted server-side)
            const optimizeForm = new FormData();
            optimizeForm.append("pdf_file", pdfFile);
            optimizeForm.append("job_description", jd);
            optimizeForm.append("missing_keywords", JSON.stringify(keywords));

            const res = await fetch(`${API_BASE}/api/resume-toolkit/optimize-keywords`, {
                method: "POST",
                body: optimizeForm,
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(parseApiError(err, "Optimization failed"));
            }

            const data: OptimizationResult = await res.json();
            setOptimization(data);
        } catch (e) {
            setOptimizeError(e instanceof Error ? e.message : "Optimization failed");
        } finally {
            setIsOptimizing(false);
        }
    };

    const handleFindManager = async () => {
        if (!selectedJob) return;
        setIsSearchingManager(true);
        setManagerError(null);
        setManagerResult(null);

        try {
            const res = await fetch(`${API_BASE}/api/resume-toolkit/find-hiring-manager`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    company_name: selectedJob.company,
                    job_title: selectedJob.title,
                    company_domain: "",
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail ?? "Manager search failed");
            }

            const data: HiringManagerSearchResult = await res.json();
            setManagerResult(data);
        } catch (e) {
            setManagerError(e instanceof Error ? e.message : "Manager search failed");
        } finally {
            setIsSearchingManager(false);
        }
    };

    const handleProceedToStep4 = () => {
        advanceToStep(4);
    };

    // ------- Step 4: Draft Email -------

    const handleDraftEmail = async () => {
        if (!pdfFile || !selectedJob) return;
        setIsDraftingEmail(true);
        setEmailError(null);

        try {
            // Send PDF file to backend — text is extracted server-side
            const formData = new FormData();
            formData.append("pdf_file", pdfFile);
            formData.append("job_posting", JSON.stringify({
                title: selectedJob.title,
                company: selectedJob.company,
                location: selectedJob.location,
                description: jobDescOverride || selectedJob.description,
            }));
            const primary = managerResult?.primary;
            formData.append("hiring_manager", JSON.stringify(
                primary
                    ? {
                        name: manualName || primary.name,
                        email: manualEmail || primary.email,
                        title: primary.title,
                      }
                    : { name: manualName || "", email: manualEmail || "", title: "Hiring Manager" }
            ));

            const res = await fetch(`${API_BASE}/api/resume-toolkit/draft-email`, {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(parseApiError(err, "Email drafting failed"));
            }

            const data: EmailDraft = await res.json();
            setEmailDraft(data);
        } catch (e) {
            setEmailError(e instanceof Error ? e.message : "Email drafting failed");
        } finally {
            setIsDraftingEmail(false);
        }
    };

    // =============================================================================
    // Render
    // =============================================================================

    return (
        <div
            className="min-h-screen text-white"
            style={{ background: "linear-gradient(135deg, #050816 0%, #0a0f1e 50%, #050816 100%)" }}
        >
            {/* Ambient blobs */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
                <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full blur-3xl" style={{ background: "rgba(99,102,241,0.06)" }} />
                <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] rounded-full blur-3xl" style={{ background: "rgba(139,92,246,0.05)" }} />
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full blur-3xl" style={{ background: "rgba(16,185,129,0.03)" }} />
            </div>

            {/* Header */}
            <header
                className="sticky top-0 z-40 px-6 py-4"
                style={{
                    background: "rgba(5,8,22,0.85)",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    backdropFilter: "blur(20px)",
                }}
            >
                <div className="max-w-7xl mx-auto flex items-center gap-4 flex-wrap">
                    {/* Back link */}
                    <Link
                        href="/dashboard"
                        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors"
                    >
                        <ArrowLeft size={14} />
                        Dashboard
                    </Link>

                    <div className="w-px h-4 bg-white/10" />

                    {/* Title */}
                    <div className="flex items-center gap-3">
                        <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center"
                            style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)", boxShadow: "0 0 20px rgba(99,102,241,0.4)" }}
                        >
                            <Briefcase size={15} />
                        </div>
                        <div>
                            <h1 className="text-base font-extrabold tracking-tight">AI Resume Toolkit</h1>
                            <p className="text-[11px] text-slate-500">4-step job application intelligence</p>
                        </div>
                    </div>

                    {/* Step bar */}
                    <div className="ml-auto">
                        <StepBar current={currentStep} maxReached={maxReached} />
                    </div>
                </div>
            </header>

            <main className="relative z-10 max-w-7xl mx-auto px-6 py-8">

                {/* ============================================================ */}
                {/* STEP 1 — Upload Resume + Find Jobs                            */}
                {/* ============================================================ */}
                {currentStep === 1 && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="text-center mb-8">
                            <div
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm text-slate-400 mb-4"
                                style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}
                            >
                                <Search size={14} className="text-indigo-400" />
                                Step 1 of 4 — Upload Resume & Find Jobs
                            </div>
                            <h2 className="text-2xl font-black tracking-tight">
                                Find Jobs Matched to{" "}
                                <span
                                    className="bg-clip-text text-transparent"
                                    style={{ backgroundImage: "linear-gradient(90deg, #818cf8, #a78bfa)" }}
                                >
                                    Your Resume
                                </span>
                            </h2>
                            <p className="text-sm text-slate-500 mt-2">
                                Upload your PDF resume — we&apos;ll infer your ideal role and search across 140+ job boards
                            </p>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Left: Upload + controls */}
                            <div className="space-y-4">
                                {/* Drop zone */}
                                <div
                                    className={`relative rounded-2xl border-2 border-dashed flex flex-col items-center justify-center p-10 text-center transition-all duration-300 cursor-pointer min-h-[200px] ${isDragging ? "scale-[1.02]" : ""}`}
                                    style={{
                                        borderColor: isDragging ? "rgba(99,102,241,0.7)" : pdfFile ? "rgba(16,185,129,0.5)" : "rgba(255,255,255,0.1)",
                                        background: isDragging ? "rgba(99,102,241,0.08)" : pdfFile ? "rgba(16,185,129,0.05)" : "rgba(255,255,255,0.02)",
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
                                    {pdfFile ? (
                                        <>
                                            <CheckCircle size={36} className="text-emerald-400 mb-3" />
                                            <p className="font-bold text-emerald-300">{pdfFile.name}</p>
                                            <p className="text-xs text-slate-500 mt-1">{(pdfFile.size / 1024).toFixed(1)} KB — Click to replace</p>
                                        </>
                                    ) : (
                                        <>
                                            <Upload size={36} className="text-slate-500 mb-3" style={{ animation: "float 3s ease-in-out infinite" }} />
                                            <p className="font-semibold text-slate-300">{isDragging ? "Release to upload" : "Drop your resume PDF here"}</p>
                                            <p className="text-xs text-slate-500 mt-1">or click to browse — PDF only, max 10 MB</p>
                                        </>
                                    )}
                                </div>

                                {/* Location override */}
                                <div
                                    className="rounded-xl p-4 space-y-2"
                                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                                >
                                    <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                                        <MapPin size={12} className="text-indigo-400" />
                                        Location override (optional)
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. London, Remote, New York..."
                                        value={locationOverride}
                                        onChange={(e) => setLocationOverride(e.target.value)}
                                        className="w-full bg-transparent text-sm text-slate-200 placeholder:text-slate-600 outline-none border-b pb-1 transition-colors"
                                        style={{ borderColor: "rgba(255,255,255,0.1)" }}
                                    />
                                    <p className="text-[11px] text-slate-600">
                                        Leave blank to use the location detected from your resume
                                    </p>
                                </div>

                                {/* Inferred profile (shown after search) */}
                                {profile && (
                                    <div
                                        className="rounded-xl p-4 space-y-2"
                                        style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.2)" }}
                                    >
                                        <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 flex items-center gap-1.5 mb-2">
                                            <Zap size={12} />
                                            Detected from your resume
                                        </p>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <p className="text-[10px] text-slate-500">Target Role</p>
                                                <p className="text-sm font-bold text-slate-200">{profile.role}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-slate-500">Location</p>
                                                <p className="text-sm font-bold text-slate-200">{profile.location || "Not detected"}</p>
                                            </div>
                                        </div>
                                        {profile.skills_summary && (
                                            <div>
                                                <p className="text-[10px] text-slate-500 mb-1">Top Skills</p>
                                                <div className="flex flex-wrap gap-1">
                                                    {profile.skills_summary.split(",").map((s) => s.trim()).filter(Boolean).map((skill) => (
                                                        <span
                                                            key={skill}
                                                            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                                                            style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.25)" }}
                                                        >
                                                            {skill}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Error */}
                                {searchError && (
                                    <div
                                        className="rounded-xl px-4 py-3 flex items-start gap-2"
                                        style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
                                    >
                                        <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                                        <p className="text-xs text-red-300">{searchError}</p>
                                    </div>
                                )}

                                {/* Search button */}
                                <button
                                    onClick={handleSearchJobs}
                                    disabled={!pdfFile || isSearching}
                                    className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02]"
                                    style={{
                                        background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
                                        boxShadow: "0 8px 30px rgba(79,70,229,0.35)",
                                    }}
                                >
                                    {isSearching ? <><Loader2 size={16} className="animate-spin" />Searching Jobs...</> : <><Search size={16} />Find Matching Jobs</>}
                                </button>
                            </div>

                            {/* Right: Job cards grid */}
                            <div className="space-y-4">
                                {jobs.length > 0 ? (
                                    <>
                                        <div className="flex items-center justify-between">
                                            <p className="text-xs font-semibold text-slate-400">
                                                {jobs.length} jobs found — select one to continue
                                            </p>
                                            <button
                                                onClick={handleSearchJobs}
                                                className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
                                            >
                                                <RefreshCw size={11} /> Refresh
                                            </button>
                                        </div>
                                        <div
                                            className="space-y-3 overflow-y-auto pr-1"
                                            style={{ maxHeight: "calc(100vh - 380px)" }}
                                        >
                                            {jobs.map((job, i) => (
                                                <JobCard
                                                    key={`${job.company}-${job.title}-${i}`}
                                                    job={job}
                                                    onSelect={handleSelectJob}
                                                    isSelected={selectedJob?.apply_url === job.apply_url}
                                                    index={i}
                                                />
                                            ))}
                                        </div>

                                        {/* Proceed CTA */}
                                        {selectedJob && (
                                            <button
                                                onClick={handleProceedToStep2}
                                                className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-300 hover:scale-[1.01]"
                                                style={{
                                                    background: "linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(5,150,105,0.15) 100%)",
                                                    border: "1px solid rgba(16,185,129,0.4)",
                                                    color: "#6ee7b7",
                                                }}
                                            >
                                                Optimize for: <strong className="truncate">{selectedJob.title} @ {selectedJob.company}</strong>
                                                <ChevronRight size={16} />
                                            </button>
                                        )}
                                    </>
                                ) : isSearching ? (
                                    <div className="h-64 flex flex-col items-center justify-center gap-4">
                                        <div className="relative">
                                            <div className="absolute inset-0 rounded-full bg-indigo-400/20 blur-xl animate-pulse" />
                                            <div
                                                className="w-16 h-16 rounded-full flex items-center justify-center relative z-10"
                                                style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)" }}
                                            >
                                                <Search size={24} className="text-indigo-400 animate-pulse" />
                                            </div>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-slate-300 font-semibold">Searching Jooble...</p>
                                            <p className="text-xs text-slate-500 mt-1">Scanning 140+ job boards</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div
                                        className="h-64 flex flex-col items-center justify-center rounded-2xl border"
                                        style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}
                                    >
                                        <Briefcase size={36} className="text-slate-700 mb-3" />
                                        <p className="text-slate-500 font-medium text-sm">Job listings will appear here</p>
                                        <p className="text-xs text-slate-600 mt-1">Upload your resume and click Search</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ============================================================ */}
                {/* STEP 2 — ATS Optimizer                                        */}
                {/* ============================================================ */}
                {currentStep === 2 && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="text-center mb-8">
                            <div
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm text-slate-400 mb-4"
                                style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}
                            >
                                <Target size={14} className="text-violet-400" />
                                Step 2 of 4 — ATS Keyword Optimizer
                            </div>
                            <h2 className="text-2xl font-black tracking-tight">
                                Optimize Your Resume for{" "}
                                <span
                                    className="bg-clip-text text-transparent"
                                    style={{ backgroundImage: "linear-gradient(90deg, #a78bfa, #c084fc)" }}
                                >
                                    ATS Systems
                                </span>
                            </h2>
                            <p className="text-sm text-slate-500 mt-2">
                                We&apos;ll rewrite your Skills section to naturally inject the keywords ATS filters look for
                            </p>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Left: Job desc + controls */}
                            <div className="space-y-4">
                                {/* Selected job info */}
                                {selectedJob && (
                                    <div
                                        className="rounded-xl p-4"
                                        style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}
                                    >
                                        <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest mb-2">Selected Job</p>
                                        <p className="font-bold text-slate-200 text-sm">{selectedJob.title}</p>
                                        <p className="text-xs text-slate-400">{selectedJob.company} · {selectedJob.location}</p>
                                    </div>
                                )}

                                {/* JD override textarea */}
                                <div>
                                    <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 mb-2">
                                        <FileText size={12} className="text-violet-400" />
                                        Job description (paste full JD for best results)
                                    </label>
                                    <textarea
                                        value={jobDescOverride}
                                        onChange={(e) => setJobDescOverride(e.target.value)}
                                        placeholder="Paste the full job description here or use the snippet from the job card..."
                                        className="w-full text-xs text-slate-300 resize-none rounded-xl p-3 outline-none transition-all"
                                        style={{
                                            background: "rgba(255,255,255,0.03)",
                                            border: "1px solid rgba(255,255,255,0.08)",
                                            minHeight: "160px",
                                        }}
                                    />
                                </div>

                                {/* ATS score badge (if fetched) */}
                                {atsScore !== null && (
                                    <div
                                        className="flex items-center gap-3 rounded-xl px-4 py-3"
                                        style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}
                                    >
                                        <div
                                            className="w-10 h-10 rounded-full flex items-center justify-center font-black text-sm"
                                            style={{ background: "rgba(245,158,11,0.2)", color: "#fcd34d" }}
                                        >
                                            {atsScore}
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-amber-300">Current ATS Score</p>
                                            <p className="text-[11px] text-slate-400">
                                                {missingKeywords.length > 0
                                                    ? `${missingKeywords.length} keywords missing`
                                                    : "Optimization will extract missing keywords"}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Disclaimer */}
                                <div
                                    className="rounded-xl px-4 py-3 flex items-start gap-2"
                                    style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)" }}
                                >
                                    <Info size={13} className="text-indigo-400 mt-0.5 flex-shrink-0" />
                                    <p className="text-[11px] text-slate-400 leading-relaxed">
                                        The optimizer rewrites your Skills &amp; Summary sections only — it never fabricates experience.
                                        Copy the optimized block and paste it into your resume document.
                                    </p>
                                </div>

                                {optimizeError && (
                                    <div className="rounded-xl px-4 py-3 flex items-start gap-2" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                                        <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                                        <p className="text-xs text-red-300">{optimizeError}</p>
                                    </div>
                                )}

                                <button
                                    onClick={handleOptimize}
                                    disabled={isOptimizing || !selectedJob}
                                    className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-300 disabled:opacity-50 hover:scale-[1.02]"
                                    style={{
                                        background: "linear-gradient(135deg, #7c3aed 0%, #9333ea 100%)",
                                        boxShadow: "0 8px 30px rgba(124,58,237,0.35)",
                                    }}
                                >
                                    {isOptimizing ? <><Loader2 size={16} className="animate-spin" />Optimizing...</> : <><Zap size={16} />Optimize My Resume</>}
                                </button>

                                {optimization && (
                                    <button
                                        onClick={() => advanceToStep(3)}
                                        className="w-full py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-300"
                                        style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "#6ee7b7" }}
                                    >
                                        Find Hiring Manager <ChevronRight size={16} />
                                    </button>
                                )}
                            </div>

                            {/* Right: Optimizer results */}
                            <div>
                                {isOptimizing ? (
                                    <div className="h-64 flex flex-col items-center justify-center gap-4">
                                        <div className="relative">
                                            <div className="absolute inset-0 rounded-full bg-violet-400/20 blur-xl animate-pulse" />
                                            <div className="w-16 h-16 rounded-full flex items-center justify-center relative z-10" style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)" }}>
                                                <Zap size={24} className="text-violet-400 animate-pulse" />
                                            </div>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-slate-300 font-semibold">Analyzing keywords...</p>
                                            <p className="text-xs text-slate-500 mt-1">Fetching ATS score and rewriting resume sections</p>
                                        </div>
                                    </div>
                                ) : optimization ? (
                                    <ResumeOptimizer result={optimization} />
                                ) : (
                                    <div className="h-64 flex flex-col items-center justify-center rounded-2xl border" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}>
                                        <Target size={36} className="text-slate-700 mb-3" />
                                        <p className="text-slate-500 font-medium text-sm">Optimization results will appear here</p>
                                        <p className="text-xs text-slate-600 mt-1">Click the button to start</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ============================================================ */}
                {/* STEP 3 — Find Hiring Manager                                  */}
                {/* ============================================================ */}
                {currentStep === 3 && (
                    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
                        <div className="text-center mb-8">
                            <div
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm text-slate-400 mb-4"
                                style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}
                            >
                                <User size={14} className="text-emerald-400" />
                                Step 3 of 4 — Find Hiring Manager
                            </div>
                            <h2 className="text-2xl font-black tracking-tight">
                                Find the{" "}
                                <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(90deg, #34d399, #6ee7b7)" }}>
                                    Right Contact
                                </span>
                            </h2>
                            <p className="text-sm text-slate-500 mt-2">
                                Searching Apollo.io for hiring managers and recruiters at {selectedJob?.company}
                            </p>
                        </div>

                        {/* Selected job reminder */}
                        {selectedJob && (
                            <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg flex items-center justify-center font-black text-sm" style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}>
                                        {selectedJob.company[0]?.toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-200">{selectedJob.title}</p>
                                        <p className="text-xs text-slate-400">{selectedJob.company} · {selectedJob.location}</p>
                                    </div>
                                    <a href={selectedJob.apply_url} target="_blank" rel="noopener noreferrer" className="ml-auto flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors">
                                        <ExternalLink size={11} /> Apply Link
                                    </a>
                                </div>
                            </div>
                        )}

                        {/* Hiring manager result */}
                        {managerResult ? (
                            <div className="space-y-4">
                                {/* Primary Contact */}
                                <div
                                    className="rounded-2xl p-5 space-y-3"
                                    style={{ background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.2)" }}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="w-12 h-12 rounded-full flex items-center justify-center font-black text-base"
                                                style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.3), rgba(5,150,105,0.2))", border: "2px solid rgba(16,185,129,0.3)" }}
                                            >
                                                {managerResult.primary.name ? managerResult.primary.name[0]?.toUpperCase() : <User size={20} className="text-emerald-400" />}
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-200">{managerResult.primary.name || "Hiring Team"}</p>
                                                <p className="text-xs text-slate-400">{managerResult.primary.title || selectedJob?.company}</p>
                                            </div>
                                        </div>
                                        <ConfidenceBadge confidence={managerResult.primary.confidence} />
                                    </div>

                                    {managerResult.primary.email && (
                                        <div className="flex items-center gap-3 rounded-xl px-4 py-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                                            <Mail size={14} className="text-indigo-400 flex-shrink-0" />
                                            <span className="font-mono text-sm text-slate-200 flex-1">{managerResult.primary.email}</span>
                                            <button
                                                onClick={() => navigator.clipboard.writeText(managerResult!.primary.email)}
                                                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-all"
                                                style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#a5b4fc" }}
                                            >
                                                Copy
                                            </button>
                                        </div>
                                    )}

                                    <div className="flex items-center gap-3 flex-wrap">
                                        {managerResult.primary.linkedin_url && (
                                            <a href={managerResult.primary.linkedin_url} target="_blank" rel="noopener noreferrer"
                                                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors">
                                                <ExternalLink size={11} /> LinkedIn Profile
                                            </a>
                                        )}
                                        {managerResult.primary.linkedin_search_url && (
                                            <a href={managerResult.primary.linkedin_search_url} target="_blank" rel="noopener noreferrer"
                                                className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-200 transition-colors">
                                                <ExternalLink size={11} /> Search on LinkedIn
                                            </a>
                                        )}
                                    </div>

                                    {managerResult.primary.confidence === "Guessed" && (
                                        <div className="rounded-xl px-3 py-2.5 flex items-start gap-2" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
                                            <AlertCircle size={12} className="text-red-400 mt-0.5 flex-shrink-0" />
                                            <p className="text-[11px] text-slate-400">
                                                Pattern-based guess ({managerResult.primary.source}). Verify before sending.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Alternative Contacts */}
                                {managerResult.alternatives.length > 0 && (
                                    <div>
                                        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">Also Consider</p>
                                        <div className="space-y-2">
                                            {managerResult.alternatives.map((alt, i) => (
                                                <div key={i} className="flex items-center gap-3 rounded-xl px-4 py-2.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                                                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 flex-shrink-0">
                                                        {alt.name ? alt.name[0].toUpperCase() : "?"}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-semibold text-slate-200">{alt.name || "Unknown"}</p>
                                                        <p className="text-[10px] text-slate-500 truncate">{alt.email || alt.title}</p>
                                                    </div>
                                                    <ConfidenceBadge confidence={alt.confidence} />
                                                    {alt.email && (
                                                        <button onClick={() => navigator.clipboard.writeText(alt.email)}
                                                            className="text-[10px] px-2 py-0.5 rounded font-semibold"
                                                            style={{ background: "rgba(99,102,241,0.12)", color: "#a5b4fc" }}
                                                        >Copy</button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Search Suggestions */}
                                {managerResult.search_suggestions.length > 0 && (
                                    <div>
                                        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1.5">
                                            <Search size={10} /> Search Suggestions
                                        </p>
                                        <div className="space-y-1.5">
                                            {managerResult.search_suggestions.map((s, i) => (
                                                <a key={i}
                                                    href={`https://www.google.com/search?q=${encodeURIComponent(s)}`}
                                                    target="_blank" rel="noopener noreferrer"
                                                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-300 hover:text-slate-100 transition-all"
                                                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                                                >
                                                    <ExternalLink size={10} className="text-slate-500 flex-shrink-0" />
                                                    {s}
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Email Patterns */}
                                {managerResult.email_patterns.length > 0 && (
                                    <div>
                                        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">Common Email Patterns at {selectedJob?.company}</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {managerResult.email_patterns.map((ep, i) => (
                                                <button key={i} onClick={() => navigator.clipboard.writeText(ep)}
                                                    className="text-[11px] font-mono px-2.5 py-1 rounded-lg transition-all hover:scale-105"
                                                    style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", color: "#a5b4fc" }}
                                                    title="Click to copy"
                                                >
                                                    {ep}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Manual override */}
                                <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Override Contact Details</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            type="text"
                                            placeholder="Manager name (optional)"
                                            value={manualName}
                                            onChange={e => setManualName(e.target.value)}
                                            className="px-3 py-2 rounded-lg text-xs bg-transparent border text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                                            style={{ borderColor: "rgba(255,255,255,0.1)" }}
                                        />
                                        <input
                                            type="email"
                                            placeholder="Verified email (optional)"
                                            value={manualEmail}
                                            onChange={e => setManualEmail(e.target.value)}
                                            className="px-3 py-2 rounded-lg text-xs bg-transparent border text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                                            style={{ borderColor: "rgba(255,255,255,0.1)" }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : isSearchingManager ? (
                            <div className="h-48 flex flex-col items-center justify-center gap-4">
                                <div className="relative">
                                    <div className="absolute inset-0 rounded-full bg-emerald-400/20 blur-xl animate-pulse" />
                                    <div className="w-16 h-16 rounded-full flex items-center justify-center relative z-10" style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)" }}>
                                        <User size={24} className="text-emerald-400 animate-pulse" />
                                    </div>
                                </div>
                                <div className="text-center">
                                    <p className="text-slate-300 font-semibold">Searching for contacts...</p>
                                    <p className="text-xs text-slate-500 mt-1">Finding hiring managers at {selectedJob?.company}</p>
                                </div>
                            </div>
                        ) : null}

                        {managerError && (
                            <div className="rounded-xl px-4 py-3 flex items-start gap-2" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                                <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                                <p className="text-xs text-red-300">{managerError}</p>
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={handleFindManager}
                                disabled={isSearchingManager || !selectedJob}
                                className="flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-300 disabled:opacity-50 hover:scale-[1.01]"
                                style={{
                                    background: "linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(5,150,105,0.15) 100%)",
                                    border: "1px solid rgba(16,185,129,0.4)",
                                    color: "#6ee7b7",
                                }}
                            >
                                {isSearchingManager ? <><Loader2 size={16} className="animate-spin" /> Searching...</> : <><User size={16} /> Find Hiring Manager</>}
                            </button>

                            <button
                                onClick={handleProceedToStep4}
                                className="py-3 px-6 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-300 hover:scale-[1.01]"
                                style={{
                                    background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
                                    boxShadow: "0 8px 30px rgba(79,70,229,0.3)",
                                }}
                            >
                                Draft Email <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                )}

                {/* ============================================================ */}
                {/* STEP 4 — Draft Outreach Email                                 */}
                {/* ============================================================ */}
                {currentStep === 4 && (
                    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
                        <div className="text-center mb-8">
                            <div
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm text-slate-400 mb-4"
                                style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}
                            >
                                <Send size={14} className="text-blue-400" />
                                Step 4 of 4 — Draft Personalized Email
                            </div>
                            <h2 className="text-2xl font-black tracking-tight">
                                Your{" "}
                                <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(90deg, #60a5fa, #818cf8)" }}>
                                    Outreach Email
                                </span>
                            </h2>
                            <p className="text-sm text-slate-500 mt-2">
                                AI-drafted, personalized for {selectedJob?.title} at {selectedJob?.company}
                            </p>
                        </div>

                        {/* Context summary */}
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { label: "Job", value: `${selectedJob?.title} @ ${selectedJob?.company}`, icon: Briefcase },
                                { label: "Contact", value: manualName || managerResult?.primary.name || "Hiring Team", icon: User },
                                { label: "Email", value: manualEmail || managerResult?.primary.email || "hiring@company.com", icon: Mail },
                            ].map(({ label, value, icon: Icon }) => (
                                <div key={label} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold flex items-center gap-1 mb-1">
                                        <Icon size={10} /> {label}
                                    </p>
                                    <p className="text-xs text-slate-200 font-medium truncate">{value}</p>
                                </div>
                            ))}
                        </div>

                        {emailError && (
                            <div className="rounded-xl px-4 py-3 flex items-start gap-2" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                                <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                                <p className="text-xs text-red-300">{emailError}</p>
                            </div>
                        )}

                        {emailDraft ? (
                            <>
                                <EmailComposer
                                    draft={emailDraft}
                                    recipientEmail={manualEmail || managerResult?.primary.email}
                                    onBodyChange={(body) => setEmailDraft((d) => d ? { ...d, body } : d)}
                                    onSubjectChange={(subject) => setEmailDraft((d) => d ? { ...d, subject } : d)}
                                />
                                <button
                                    onClick={handleDraftEmail}
                                    disabled={isDraftingEmail}
                                    className="flex items-center gap-2 mx-auto text-xs font-semibold px-4 py-2 rounded-lg transition-all"
                                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", color: "#64748b" }}
                                >
                                    <RefreshCw size={12} className={isDraftingEmail ? "animate-spin" : ""} />
                                    {isDraftingEmail ? "Regenerating..." : "Regenerate Email"}
                                </button>
                            </>
                        ) : (
                            <div className="text-center py-8">
                                <button
                                    onClick={handleDraftEmail}
                                    disabled={isDraftingEmail || !selectedJob}
                                    className="inline-flex py-3 px-8 rounded-xl font-bold text-sm items-center gap-2 transition-all duration-300 disabled:opacity-50 hover:scale-[1.02]"
                                    style={{
                                        background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
                                        boxShadow: "0 8px 30px rgba(59,130,246,0.35)",
                                    }}
                                >
                                    {isDraftingEmail ? <><Loader2 size={16} className="animate-spin" />Drafting email...</> : <><Send size={16} />Draft My Email</>}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Navigation helper */}
                {currentStep > 1 && (
                    <div className="mt-8 flex items-center justify-center">
                        <button
                            onClick={() => goToStep((currentStep - 1) as Step)}
                            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                        >
                            <ArrowLeft size={13} />
                            Back to Step {currentStep - 1}
                        </button>
                    </div>
                )}
            </main>
        </div>
    );
}
