"use client";

import { useState } from "react";
import { DollarSign, Loader2, TrendingUp, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

interface SalaryIntelligence {
    currency: string;
    low: number;
    mid: number;
    high: number;
    confidence: string;
    seniority_detected: string;
    location_detected: string;
    negotiation_points: string[];
    disclaimer: string;
}

interface Props {
    verifiedSkills: object[];
    jobDescription: string;
    apiBase: string;
}

function fmt(n: number, currency: string) {
    if (n >= 1000) {
        return `${currency === "USD" ? "$" : ""}${Math.round(n / 1000)}k`;
    }
    return `${currency === "USD" ? "$" : ""}${n.toLocaleString()}`;
}

const CONFIDENCE_STYLES: Record<string, { color: string; bg: string }> = {
    High:   { color: "#16a34a", bg: "#dcfce7" },
    Medium: { color: "#d97706", bg: "#fef3c7" },
    Low:    { color: "#dc2626", bg: "#fee2e2" },
};

export default function SalaryIntelligenceCard({ verifiedSkills, jobDescription, apiBase }: Props) {
    const [loading, setLoading]     = useState(false);
    const [data, setData]           = useState<SalaryIntelligence | null>(null);
    const [error, setError]         = useState<string | null>(null);
    const [expanded, setExpanded]   = useState(true);

    const fetch = async () => {
        if (!jobDescription) return;
        setLoading(true);
        setError(null);
        try {
            const res = await globalThis.fetch(`${apiBase}/api/coach/salary-intelligence`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    job_description: jobDescription,
                    verified_skills: verifiedSkills,
                }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.detail || "Failed");
            setData(json);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to estimate salary");
        } finally {
            setLoading(false);
        }
    };

    const confStyle = data ? (CONFIDENCE_STYLES[data.confidence] ?? CONFIDENCE_STYLES.Medium) : null;

    if (!data && !loading) {
        return (
            <div style={{
                border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden",
                background: "linear-gradient(135deg, #f8fafc, white)",
            }}>
                <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <DollarSign size={16} color="#7c3aed" />
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>Salary Intelligence</span>
                    </div>
                    <button
                        onClick={fetch}
                        disabled={!jobDescription}
                        style={{
                            padding: "6px 14px", borderRadius: 8, border: "none",
                            background: !jobDescription ? "#e2e8f0" : "linear-gradient(135deg, #7c3aed, #6366f1)",
                            color: !jobDescription ? "#94a3b8" : "white",
                            fontSize: 12, fontWeight: 600, cursor: !jobDescription ? "not-allowed" : "pointer",
                        }}
                    >
                        Estimate Range
                    </button>
                </div>
                {error && <div style={{ padding: "0 16px 12px", fontSize: 12, color: "#dc2626" }}>{error}</div>}
            </div>
        );
    }

    if (loading) {
        return (
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                <Loader2 size={16} color="#7c3aed" className="animate-spin" />
                <span style={{ fontSize: 13, color: "#64748b" }}>Estimating salary range...</span>
            </div>
        );
    }

    if (!data) return null;

    // Range bar: low=0%, mid proportional, high=100%
    const range = data.high - data.low;
    const midPct = range > 0 ? ((data.mid - data.low) / range) * 100 : 50;

    return (
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
            {/* Header row */}
            <div
                onClick={() => setExpanded(!expanded)}
                style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", background: "#fafafa", borderBottom: expanded ? "1px solid #f1f5f9" : "none" }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <DollarSign size={15} color="#7c3aed" />
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>Salary Intelligence</span>
                    {confStyle && (
                        <span style={{ padding: "1px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: confStyle.bg, color: confStyle.color }}>
                            {data.confidence} confidence
                        </span>
                    )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: "#7c3aed" }}>
                        {fmt(data.low, data.currency)} – {fmt(data.high, data.currency)}
                    </span>
                    {expanded ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
                </div>
            </div>

            {expanded && (
                <div style={{ padding: 16 }}>
                    {/* Range visual */}
                    <div style={{ marginBottom: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b", marginBottom: 6, fontWeight: 600 }}>
                            <span>Low · {fmt(data.low, data.currency)}</span>
                            <span style={{ color: "#7c3aed" }}>Mid · {fmt(data.mid, data.currency)}</span>
                            <span>High · {fmt(data.high, data.currency)}</span>
                        </div>
                        <div style={{ position: "relative", height: 10, background: "#f1f5f9", borderRadius: 20 }}>
                            <div style={{
                                position: "absolute", left: 0, top: 0, height: "100%",
                                width: "100%",
                                background: "linear-gradient(90deg, #c4b5fd, #7c3aed, #4338ca)",
                                borderRadius: 20,
                                opacity: 0.3,
                            }} />
                            {/* Mid marker */}
                            <div style={{
                                position: "absolute", left: `${midPct}%`, top: -3,
                                width: 16, height: 16, background: "#7c3aed",
                                borderRadius: "50%", border: "2px solid white",
                                transform: "translateX(-50%)",
                                boxShadow: "0 2px 6px rgba(124,58,237,0.4)",
                            }} />
                        </div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
                            {data.seniority_detected} · {data.location_detected || "Remote"}
                        </div>
                    </div>

                    {/* Negotiation points */}
                    {data.negotiation_points.length > 0 && (
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                                <TrendingUp size={12} /> Negotiation Talking Points
                            </div>
                            {data.negotiation_points.map((pt, i) => (
                                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 12, color: "#1e293b", lineHeight: 1.5 }}>
                                    <span style={{ color: "#7c3aed", fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                                    <span>{pt}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Disclaimer + external link */}
                    <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <p style={{ fontSize: 10, color: "#94a3b8", margin: 0, flex: 1 }}>{data.disclaimer}</p>
                        <a
                            href="https://www.levels.fyi/"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#7c3aed", textDecoration: "none", flexShrink: 0, marginLeft: 12 }}
                        >
                            Verify on Levels.fyi <ExternalLink size={11} />
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
}
