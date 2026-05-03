"use client";

import { useState } from "react";
import { TableProperties, Loader2, ChevronUp, ChevronDown, Sparkles } from "lucide-react";

export interface HeatmapRow {
    skill: string;
    category: string;
    verified_score: number;
    ats_found: boolean;
    gap_severity: "None" | "Minor" | "Moderate" | "Critical";
    recommendation: string;
}

export interface SkillsHeatmap {
    rows: HeatmapRow[];
    overall_match_pct: number;
    critical_count: number;
    moderate_count: number;
}

interface Props {
    heatmap: SkillsHeatmap | null;
    isLoading: boolean;
    onGenerate: () => void;
    atsAvailable: boolean;
}

const SEV_CONFIG: Record<string, { bg: string; text: string; border: string; dot: string }> = {
    Critical: { bg: "rgba(239,68,68,0.08)", text: "#dc2626", border: "rgba(239,68,68,0.3)", dot: "#ef4444" },
    Moderate: { bg: "rgba(245,158,11,0.08)", text: "#b45309", border: "rgba(245,158,11,0.3)", dot: "#f59e0b" },
    Minor:    { bg: "rgba(59,130,246,0.08)", text: "#1d4ed8", border: "rgba(59,130,246,0.3)", dot: "#3b82f6" },
    None:     { bg: "rgba(34,197,94,0.08)",  text: "#15803d", border: "rgba(34,197,94,0.3)",  dot: "#22c55e" },
};

function ScoreBar({ score }: { score: number }) {
    const color = score >= 70 ? "#22c55e" : score >= 40 ? "#f59e0b" : score >= 1 ? "#ef4444" : "#cbd5e1";
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 90 }}>
            <div style={{ flex: 1, background: "#e2e8f0", borderRadius: 4, height: 6, overflow: "hidden" }}>
                <div style={{ width: `${score}%`, background: color, height: 6, borderRadius: 4, transition: "width 0.6s ease" }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 28, textAlign: "right" }}>{score}%</span>
        </div>
    );
}

function SeverityBadge({ severity }: { severity: string }) {
    const cfg = SEV_CONFIG[severity] ?? SEV_CONFIG["None"];
    return (
        <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}`,
        }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
            {severity}
        </span>
    );
}

type SortKey = "gap_severity" | "verified_score" | "skill" | "category";
const SEV_ORDER: Record<string, number> = { Critical: 0, Moderate: 1, Minor: 2, None: 3 };

export default function SkillsGapHeatmap({ heatmap, isLoading, onGenerate, atsAvailable }: Props) {
    const [sortKey, setSortKey] = useState<SortKey>("gap_severity");
    const [sortAsc, setSortAsc] = useState(true);
    const [expanded, setExpanded] = useState(true);

    const rows = heatmap?.rows ?? [];
    const sorted = [...rows].sort((a, b) => {
        let cmp = 0;
        if (sortKey === "gap_severity") cmp = (SEV_ORDER[a.gap_severity] ?? 4) - (SEV_ORDER[b.gap_severity] ?? 4);
        else if (sortKey === "verified_score") cmp = a.verified_score - b.verified_score;
        else if (sortKey === "skill") cmp = a.skill.localeCompare(b.skill);
        else if (sortKey === "category") cmp = a.category.localeCompare(b.category);
        return sortAsc ? cmp : -cmp;
    });

    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortAsc(a => !a);
        else { setSortKey(key); setSortAsc(true); }
    };

    const SortIcon = ({ k }: { k: SortKey }) => (
        <span style={{ marginLeft: 3, opacity: sortKey === k ? 1 : 0.3, fontSize: 10 }}>
            {sortKey === k ? (sortAsc ? "▲" : "▼") : "⇅"}
        </span>
    );

    return (
        <div style={{ background: "white", borderRadius: 16, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,0.04)" }}>
            {/* Header */}
            <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", cursor: "pointer", background: "rgba(124,58,237,0.03)", borderBottom: expanded ? "1px solid #f1f5f9" : "none" }}
                onClick={() => setExpanded(e => !e)}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ padding: "6px", background: "rgba(124,58,237,0.1)", borderRadius: 8 }}>
                        <TableProperties size={14} style={{ color: "#7c3aed" }} />
                    </div>
                    <div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>JD Skills Gap Heatmap</span>
                        {heatmap && (
                            <span style={{ marginLeft: 8, fontSize: 11, color: "#64748b" }}>
                                {rows.length} requirements · {heatmap.critical_count} critical
                            </span>
                        )}
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {!heatmap && !isLoading && (
                        <button
                            id="generate-heatmap-btn"
                            onClick={e => { e.stopPropagation(); onGenerate(); }}
                            style={{
                                display: "flex", alignItems: "center", gap: 6, padding: "6px 14px",
                                background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "white",
                                border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600,
                                cursor: "pointer", boxShadow: "0 2px 8px rgba(124,58,237,0.3)",
                            }}
                        >
                            <Sparkles size={12} />
                            Generate Heatmap
                            {atsAvailable && (
                                <span style={{ background: "rgba(255,255,255,0.2)", borderRadius: 6, padding: "1px 5px", fontSize: 10 }}>
                                    uses ATS data
                                </span>
                            )}
                        </button>
                    )}
                    {isLoading && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#7c3aed" }}>
                            <Loader2 size={14} className="animate-spin" />
                            Analysing JD…
                        </div>
                    )}
                    {expanded ? <ChevronUp size={16} style={{ color: "#94a3b8" }} /> : <ChevronDown size={16} style={{ color: "#94a3b8" }} />}
                </div>
            </div>

            {expanded && (
                <div style={{ padding: "16px 20px" }}>
                    {/* Summary pills */}
                    {heatmap && (
                        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                            <div style={{ padding: "8px 14px", background: "rgba(124,58,237,0.08)", borderRadius: 10, textAlign: "center", border: "1px solid rgba(124,58,237,0.15)" }}>
                                <div style={{ fontSize: 22, fontWeight: 800, color: "#7c3aed" }}>{heatmap.overall_match_pct}%</div>
                                <div style={{ fontSize: 10, color: "#6d28d9", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Code Match</div>
                            </div>
                            <div style={{ padding: "8px 14px", background: "rgba(239,68,68,0.07)", borderRadius: 10, textAlign: "center", border: "1px solid rgba(239,68,68,0.15)" }}>
                                <div style={{ fontSize: 22, fontWeight: 800, color: "#dc2626" }}>{heatmap.critical_count}</div>
                                <div style={{ fontSize: 10, color: "#b91c1c", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Critical</div>
                            </div>
                            <div style={{ padding: "8px 14px", background: "rgba(245,158,11,0.07)", borderRadius: 10, textAlign: "center", border: "1px solid rgba(245,158,11,0.15)" }}>
                                <div style={{ fontSize: 22, fontWeight: 800, color: "#d97706" }}>{heatmap.moderate_count}</div>
                                <div style={{ fontSize: 10, color: "#b45309", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Moderate</div>
                            </div>
                            <div style={{ padding: "8px 14px", background: "rgba(34,197,94,0.07)", borderRadius: 10, textAlign: "center", border: "1px solid rgba(34,197,94,0.15)" }}>
                                <div style={{ fontSize: 22, fontWeight: 800, color: "#15803d" }}>
                                    {rows.filter(r => r.gap_severity === "None").length}
                                </div>
                                <div style={{ fontSize: 10, color: "#166534", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Covered</div>
                            </div>
                            <button
                                onClick={onGenerate}
                                disabled={isLoading}
                                style={{
                                    marginLeft: "auto", display: "flex", alignItems: "center", gap: 5,
                                    padding: "6px 12px", background: "rgba(124,58,237,0.08)", color: "#7c3aed",
                                    border: "1px solid rgba(124,58,237,0.2)", borderRadius: 8, fontSize: 11,
                                    fontWeight: 600, cursor: "pointer",
                                }}
                            >
                                <Loader2 size={11} style={{ display: isLoading ? "block" : "none" }} className="animate-spin" />
                                Refresh
                            </button>
                        </div>
                    )}

                    {/* Loading skeleton */}
                    {isLoading && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {[...Array(5)].map((_, i) => (
                                <div key={i} style={{ height: 44, background: "#f1f5f9", borderRadius: 8, animation: "pulse 1.5s ease-in-out infinite", animationDelay: `${i * 100}ms` }} />
                            ))}
                        </div>
                    )}

                    {/* Empty state */}
                    {!heatmap && !isLoading && (
                        <div style={{ textAlign: "center", padding: "28px 0", color: "#94a3b8" }}>
                            <TableProperties size={32} style={{ margin: "0 auto 10px", opacity: 0.4 }} />
                            <p style={{ fontSize: 13, fontWeight: 500 }}>No heatmap yet</p>
                            <p style={{ fontSize: 12, marginTop: 4 }}>
                                {atsAvailable
                                    ? "Click Generate Heatmap — your ATS data will be reused for the Resume column."
                                    : "Generate an action plan first, then click Generate Heatmap."}
                            </p>
                        </div>
                    )}

                    {/* Table */}
                    {!isLoading && sorted.length > 0 && (
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                <thead>
                                    <tr style={{ background: "#f8fafc" }}>
                                        {(["skill", "category", "gap_severity", "verified_score"] as SortKey[]).map(key => (
                                            <th
                                                key={key}
                                                onClick={() => handleSort(key)}
                                                style={{
                                                    padding: "9px 12px", textAlign: "left", fontSize: 10,
                                                    color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em",
                                                    fontWeight: 700, cursor: "pointer", userSelect: "none",
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                {key === "gap_severity" ? "Gap" : key === "verified_score" ? "Code Score" : key.charAt(0).toUpperCase() + key.slice(1)}
                                                <SortIcon k={key} />
                                            </th>
                                        ))}
                                        <th style={{ padding: "9px 12px", textAlign: "center", fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, whiteSpace: "nowrap" }}>
                                            In Resume
                                        </th>
                                        <th style={{ padding: "9px 12px", textAlign: "left", fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>
                                            Tip
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sorted.map((row, i) => (
                                        <tr
                                            key={i}
                                            style={{ borderBottom: "1px solid #f1f5f9", transition: "background 0.15s" }}
                                            onMouseEnter={e => (e.currentTarget.style.background = "#fafafa")}
                                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                        >
                                            <td style={{ padding: "10px 12px", fontWeight: 600, color: "#1e293b" }}>{row.skill}</td>
                                            <td style={{ padding: "10px 12px", color: "#64748b" }}>
                                                <span style={{ padding: "2px 7px", background: "#f1f5f9", borderRadius: 6, fontSize: 11 }}>{row.category}</span>
                                            </td>
                                            <td style={{ padding: "10px 12px" }}>
                                                <SeverityBadge severity={row.gap_severity} />
                                            </td>
                                            <td style={{ padding: "10px 12px" }}>
                                                <ScoreBar score={row.verified_score} />
                                            </td>
                                            <td style={{ padding: "10px 12px", textAlign: "center" }}>
                                                <span style={{ fontSize: 15, fontWeight: 700, color: row.ats_found ? "#22c55e" : "#ef4444" }}>
                                                    {row.ats_found ? "✓" : "✗"}
                                                </span>
                                            </td>
                                            <td style={{ padding: "10px 12px", color: "#475569", maxWidth: 260 }}>
                                                <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.recommendation}>
                                                    {row.recommendation}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
