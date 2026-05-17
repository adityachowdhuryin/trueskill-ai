"use client";

import { useState, useEffect } from "react";
import { Briefcase, ExternalLink, ChevronRight, Loader2, MapPin, DollarSign, Calendar } from "lucide-react";

interface JobPosting {
    title: string;
    company: string;
    location: string;
    description: string;
    apply_url: string;
    posted_date: string;
    salary: string;
}

interface Props {
    verifiedSkills: object[];
    resumeText: string;
    apiBase: string;
    onUseAsTarget: (url: string, description?: string) => void;
    jobDescription: string;
}

function JobSkeleton() {
    return (
        <div style={{ border: "1px solid #f1f5f9", borderRadius: 10, padding: 14, marginBottom: 10, background: "#fafafa" }}>
            {[80, 55, 100, 40].map((w, i) => (
                <div key={i} style={{
                    height: i === 0 ? 14 : 11, width: `${w}%`, background: "#e2e8f0",
                    borderRadius: 6, marginBottom: 8,
                    animation: "pulse 1.5s ease-in-out infinite",
                }} />
            ))}
        </div>
    );
}

export default function MatchingJobsPanel({ verifiedSkills, resumeText, apiBase, onUseAsTarget, jobDescription }: Props) {
    const [jobs, setJobs]             = useState<JobPosting[]>([]);
    const [loading, setLoading]       = useState(false);
    const [error, setError]           = useState<string | null>(null);
    const [fetchingIdx, setFetchingIdx] = useState<number | null>(null);
    const [expanded, setExpanded]     = useState(true);

    const fetchJobs = async () => {
        if (!resumeText) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${apiBase}/api/job-finder/search`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ resume_text: resumeText }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Job search failed");
            setJobs(data.jobs ?? []);
        } catch {
            // Silently fall back — job board is a nice-to-have
            setError("Could not load matching jobs.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (resumeText && verifiedSkills.length > 0) {
            fetchJobs();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);  // Only on mount

    const handleUseAsTarget = async (job: JobPosting, idx: number) => {
        setFetchingIdx(idx);
        try {
            // Try fetching the JD from the job URL
            const res = await fetch(`${apiBase}/api/coach/fetch-jd`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: job.apply_url }),
            });
            if (res.ok) {
                const data = await res.json();
                onUseAsTarget(job.apply_url, data.text);
            } else {
                // Fall back to using the description snippet
                onUseAsTarget(job.apply_url, job.description);
            }
        } catch {
            onUseAsTarget(job.apply_url, job.description);
        } finally {
            setFetchingIdx(null);
        }
    };

    if (!resumeText) return null;

    return (
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
            {/* Header */}
            <div
                onClick={() => setExpanded(!expanded)}
                style={{
                    padding: "12px 16px", display: "flex", justifyContent: "space-between",
                    alignItems: "center", cursor: "pointer", background: "#fafafa",
                    borderBottom: expanded ? "1px solid #f1f5f9" : "none",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Briefcase size={15} color="#7c3aed" />
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>Matching Jobs</span>
                    {jobs.length > 0 && (
                        <span style={{ padding: "1px 8px", background: "#ede9fe", color: "#7c3aed", borderRadius: 20, fontSize: 10, fontWeight: 700 }}>
                            {jobs.length}
                        </span>
                    )}
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>— click "Use as Target JD" to auto-populate</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {loading && <Loader2 size={13} color="#7c3aed" className="animate-spin" />}
                    {!loading && (
                        <button
                            onClick={e => { e.stopPropagation(); fetchJobs(); }}
                            style={{ background: "none", border: "none", fontSize: 11, color: "#7c3aed", cursor: "pointer", textDecoration: "underline" }}
                        >
                            Refresh
                        </button>
                    )}
                    <span style={{ color: "#94a3b8", fontSize: 16 }}>{expanded ? "▲" : "▼"}</span>
                </div>
            </div>

            {expanded && (
                <div style={{ padding: 12, maxHeight: 480, overflowY: "auto" }}>
                    {loading && [1, 2, 3].map(i => <JobSkeleton key={i} />)}

                    {error && !loading && (
                        <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: "12px 0" }}>
                            {error}
                        </div>
                    )}

                    {!loading && jobs.length === 0 && !error && (
                        <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: "12px 0" }}>
                            No matching jobs found. Make sure you have a PDF uploaded.
                        </div>
                    )}

                    {jobs.map((job, idx) => (
                        <div key={idx} style={{
                            border: "1px solid #f1f5f9", borderRadius: 10, padding: 14,
                            marginBottom: 10, background: "white", transition: "box-shadow 0.2s",
                        }}
                            onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(124,58,237,0.08)")}
                            onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
                        >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 2 }}>{job.title}</div>
                                    <div style={{ fontSize: 12, color: "#7c3aed", fontWeight: 600, marginBottom: 6 }}>{job.company}</div>

                                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
                                        {job.location && (
                                            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#64748b" }}>
                                                <MapPin size={10} /> {job.location}
                                            </span>
                                        )}
                                        {job.salary && (
                                            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#64748b" }}>
                                                <DollarSign size={10} /> {job.salary}
                                            </span>
                                        )}
                                        {job.posted_date && (
                                            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#94a3b8" }}>
                                                <Calendar size={10} /> {job.posted_date}
                                            </span>
                                        )}
                                    </div>

                                    {job.description && (
                                        <p style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5, margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                                            {job.description}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                                {/* Use as Target JD */}
                                <button
                                    onClick={() => handleUseAsTarget(job, idx)}
                                    disabled={fetchingIdx === idx || !!jobDescription}
                                    title={jobDescription ? "Clear current JD first to use a different one" : ""}
                                    style={{
                                        flex: 1, padding: "7px 10px", borderRadius: 8, border: "none",
                                        background: fetchingIdx === idx ? "#a78bfa" : "linear-gradient(135deg, #7c3aed, #6366f1)",
                                        color: "white", fontSize: 11, fontWeight: 700,
                                        cursor: fetchingIdx === idx || !!jobDescription ? "not-allowed" : "pointer",
                                        opacity: !!jobDescription ? 0.6 : 1,
                                        display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                                        transition: "all 0.2s",
                                    }}
                                >
                                    {fetchingIdx === idx ? (
                                        <><Loader2 size={11} className="animate-spin" /> Loading JD...</>
                                    ) : (
                                        <>Use as Target JD <ChevronRight size={11} /></>
                                    )}
                                </button>

                                {/* Apply link */}
                                <a
                                    href={job.apply_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        padding: "7px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0",
                                        color: "#374151", fontSize: 11, fontWeight: 600, textDecoration: "none",
                                        display: "flex", alignItems: "center", gap: 4,
                                        transition: "all 0.2s",
                                    }}
                                >
                                    Apply <ExternalLink size={10} />
                                </a>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
