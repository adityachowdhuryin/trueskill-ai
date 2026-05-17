"use client";

import { useState } from "react";
import { Copy, Check, AlertTriangle, FileText, Loader2, ChevronRight } from "lucide-react";

interface TailoredBullet {
    original: string;
    tailored: string;
    keywords_added: string[];
    overclaim_warning: string | null;
}

interface TailoredResumeResult {
    tailored_bullets: TailoredBullet[];
    summary_rewrite: string;
    skills_section: string;
    overclaim_count: number;
    jd_keyword_coverage_pct: number;
}

interface Props {
    resumeText: string;
    verifiedSkills: object[];
    jobDescription: string;
    apiBase: string;
    onClose: () => void;
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };
    return (
        <button onClick={copy} style={{
            background: "none", border: "none", cursor: "pointer", color: copied ? "#16a34a" : "#94a3b8",
            display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 6px",
            transition: "color 0.2s",
        }}>
            {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
        </button>
    );
}

export default function TailoredResume({ resumeText, verifiedSkills, jobDescription, apiBase, onClose }: Props) {
    const [loading, setLoading] = useState(false);
    const [result, setResult]   = useState<TailoredResumeResult | null>(null);
    const [error, setError]     = useState<string | null>(null);
    const [tab, setTab]         = useState<"bullets" | "summary" | "skills">("bullets");

    const generate = async () => {
        if (!resumeText || !jobDescription) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${apiBase}/api/coach/tailor-resume`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    resume_text: resumeText,
                    verified_skills: verifiedSkills,
                    job_description: jobDescription,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Tailoring failed");
            setResult(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to tailor resume");
        } finally {
            setLoading(false);
        }
    };

    const TABS = [
        { key: "bullets", label: "Bullets" },
        { key: "summary", label: "Summary" },
        { key: "skills",  label: "Skills Section" },
    ] as const;

    return (
        <div style={{ background: "white", borderRadius: 16, border: "1px solid #e2e8f0", overflow: "hidden" }}>
            {/* Header */}
            <div style={{ background: "linear-gradient(135deg, #0f172a, #1e293b)", padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <FileText size={18} color="#a78bfa" />
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: "white" }}>One-Click Resume Tailoring</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>Rewrites bullets to match the JD · flags overclaims · stays truthful</div>
                    </div>
                </div>
                <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, color: "#94a3b8", padding: "4px 10px", cursor: "pointer", fontSize: 12 }}>✕</button>
            </div>

            <div style={{ padding: 24 }}>
                {!result ? (
                    <>
                        <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6, marginBottom: 20 }}>
                            Your resume bullets will be rewritten to naturally match the JD&apos;s language and keywords.
                            Bullets that claim <strong>Unverified</strong> skills will be flagged — not silently modified.
                        </p>
                        {error && (
                            <div style={{ marginBottom: 16, padding: "10px 14px", background: "#fee2e2", borderRadius: 8, fontSize: 13, color: "#dc2626" }}>
                                {error}
                            </div>
                        )}
                        <button
                            onClick={generate}
                            disabled={loading || !resumeText || !jobDescription}
                            style={{
                                width: "100%", padding: 12, borderRadius: 12, border: "none",
                                background: loading ? "#a78bfa" : "linear-gradient(135deg, #7c3aed, #6366f1)",
                                color: "white", fontSize: 14, fontWeight: 700,
                                cursor: loading || !resumeText || !jobDescription ? "not-allowed" : "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                            }}
                        >
                            {loading ? (
                                <><Loader2 size={16} className="animate-spin" /> Tailoring resume...</>
                            ) : (
                                <><FileText size={16} /> Tailor My Resume</>
                            )}
                        </button>
                        {(!resumeText || !jobDescription) && (
                            <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 8, textAlign: "center" }}>
                                {!resumeText ? "Upload a PDF first." : "Add a job description first."}
                            </p>
                        )}
                    </>
                ) : (
                    <>
                        {/* Stats bar */}
                        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                            <div style={{ flex: 1, padding: "10px 14px", background: "#ede9fe", borderRadius: 10, textAlign: "center" }}>
                                <div style={{ fontSize: 20, fontWeight: 800, color: "#7c3aed" }}>{result.jd_keyword_coverage_pct}%</div>
                                <div style={{ fontSize: 10, color: "#6d28d9", fontWeight: 600, marginTop: 2 }}>JD Keyword Coverage</div>
                            </div>
                            <div style={{ flex: 1, padding: "10px 14px", background: result.overclaim_count > 0 ? "#fef3c7" : "#dcfce7", borderRadius: 10, textAlign: "center" }}>
                                <div style={{ fontSize: 20, fontWeight: 800, color: result.overclaim_count > 0 ? "#d97706" : "#16a34a" }}>
                                    {result.overclaim_count}
                                </div>
                                <div style={{ fontSize: 10, color: result.overclaim_count > 0 ? "#b45309" : "#15803d", fontWeight: 600, marginTop: 2 }}>Overclaims Flagged</div>
                            </div>
                            <div style={{ flex: 1, padding: "10px 14px", background: "#f0fdf4", borderRadius: 10, textAlign: "center" }}>
                                <div style={{ fontSize: 20, fontWeight: 800, color: "#16a34a" }}>{result.tailored_bullets.length}</div>
                                <div style={{ fontSize: 10, color: "#15803d", fontWeight: 600, marginTop: 2 }}>Bullets Tailored</div>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "#f1f5f9", borderRadius: 10, padding: 4 }}>
                            {TABS.map(t => (
                                <button key={t.key} onClick={() => setTab(t.key)}
                                    style={{
                                        flex: 1, padding: "7px 12px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 600,
                                        background: tab === t.key ? "white" : "transparent",
                                        color: tab === t.key ? "#7c3aed" : "#64748b",
                                        cursor: "pointer",
                                        boxShadow: tab === t.key ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                                        transition: "all 0.2s",
                                    }}>{t.label}</button>
                            ))}
                        </div>

                        {/* Bullets tab */}
                        {tab === "bullets" && (
                            <div style={{ maxHeight: 380, overflowY: "auto" }}>
                                {result.tailored_bullets.map((b, i) => (
                                    <div key={i} style={{
                                        marginBottom: 12, borderRadius: 10, border: `1px solid ${b.overclaim_warning ? "#fcd34d" : "#e2e8f0"}`,
                                        background: b.overclaim_warning ? "#fffbeb" : "white", overflow: "hidden",
                                    }}>
                                        {/* Original */}
                                        <div style={{ padding: "8px 12px", borderBottom: "1px solid #f1f5f9" }}>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", marginBottom: 3, textTransform: "uppercase" }}>Original</div>
                                            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{b.original}</div>
                                        </div>
                                        {/* Tailored */}
                                        <div style={{ padding: "8px 12px" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 3 }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase" }}>Tailored</div>
                                                <CopyButton text={b.tailored} />
                                            </div>
                                            <div style={{ fontSize: 12, color: "#1e293b", lineHeight: 1.5, fontWeight: 500 }}>{b.tailored}</div>
                                            {b.keywords_added.length > 0 && (
                                                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                                                    {b.keywords_added.map(kw => (
                                                        <span key={kw} style={{ padding: "1px 7px", background: "#ede9fe", color: "#5b21b6", borderRadius: 20, fontSize: 10, fontWeight: 600 }}>
                                                            +{kw}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            {b.overclaim_warning && (
                                                <div style={{ display: "flex", gap: 6, marginTop: 6, padding: "6px 8px", background: "#fef3c7", borderRadius: 6 }}>
                                                    <AlertTriangle size={12} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
                                                    <span style={{ fontSize: 11, color: "#92400e" }}>{b.overclaim_warning}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Summary tab */}
                        {tab === "summary" && (
                            <div>
                                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
                                    <CopyButton text={result.summary_rewrite} />
                                </div>
                                <div style={{ padding: 16, background: "#f8fafc", borderRadius: 10, fontSize: 13, lineHeight: 1.7, color: "#1e293b", border: "1px solid #e2e8f0" }}>
                                    {result.summary_rewrite}
                                </div>
                            </div>
                        )}

                        {/* Skills section tab */}
                        {tab === "skills" && (
                            <div>
                                <p style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>JD-optimized skills section. Add directly to your resume.</p>
                                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
                                    <CopyButton text={result.skills_section} />
                                </div>
                                <div style={{ padding: 14, background: "#f8fafc", borderRadius: 10, fontSize: 13, color: "#1e293b", border: "1px solid #e2e8f0", lineHeight: 1.8 }}>
                                    {result.skills_section}
                                </div>
                            </div>
                        )}

                        <button
                            onClick={() => { setResult(null); setError(null); }}
                            style={{
                                marginTop: 16, width: "100%", padding: "9px", borderRadius: 10,
                                border: "1.5px solid #e2e8f0", background: "white",
                                color: "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer",
                            }}
                        >
                            Regenerate
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
