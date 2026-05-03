"use client";

import { useState, useEffect } from "react";
import { Map, Loader2, CheckSquare, Square, ChevronUp, ChevronDown, Sparkles } from "lucide-react";

export interface RoadmapWeek {
    week: number;
    focus_skill: string;
    tasks: string[];
    milestone: string;
    hours_required: number;
}

export interface Roadmap {
    weeks: RoadmapWeek[];
    total_weeks: number;
    total_hours: number;
    readiness_date: string;
}

interface Props {
    roadmap: Roadmap | null;
    isLoading: boolean;
    hoursPerWeek: number;
    onHoursChange: (h: number) => void;
    onGenerate: () => void;
    bridgeProjectsAvailable: boolean;
}

const HOURS_OPTIONS = [5, 10, 20, 40];

const WEEK_COLORS = [
    { border: "#7c3aed", bg: "rgba(124,58,237,0.04)", header: "#7c3aed" },
    { border: "#2563eb", bg: "rgba(37,99,235,0.04)", header: "#2563eb" },
    { border: "#059669", bg: "rgba(5,150,105,0.04)", header: "#059669" },
    { border: "#d97706", bg: "rgba(217,119,6,0.04)",  header: "#d97706" },
    { border: "#db2777", bg: "rgba(219,39,119,0.04)", header: "#db2777" },
];

export default function LearningRoadmap({ roadmap, isLoading, hoursPerWeek, onHoursChange, onGenerate, bridgeProjectsAvailable }: Props) {
    const [expanded, setExpanded] = useState(true);
    // Persist checkbox state in localStorage: key = "roadmap_checks"
    const [checked, setChecked] = useState<Record<string, boolean>>({});

    useEffect(() => {
        try {
            const saved = localStorage.getItem("trueskill_roadmap_checks");
            if (saved) setChecked(JSON.parse(saved));
        } catch { /* ignore */ }
    }, []);

    const toggleCheck = (weekIdx: number, taskIdx: number) => {
        const key = `${weekIdx}_${taskIdx}`;
        setChecked(prev => {
            const next = { ...prev, [key]: !prev[key] };
            try { localStorage.setItem("trueskill_roadmap_checks", JSON.stringify(next)); } catch { /* ignore */ }
            return next;
        });
    };

    const totalTasks = roadmap?.weeks.reduce((s, w) => s + w.tasks.length, 0) ?? 0;
    const completedTasks = Object.values(checked).filter(Boolean).length;

    return (
        <div style={{ background: "white", borderRadius: 16, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,0.04)" }}>
            {/* Header */}
            <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", cursor: "pointer", background: "rgba(5,150,105,0.03)", borderBottom: expanded ? "1px solid #f1f5f9" : "none" }}
                onClick={() => setExpanded(e => !e)}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ padding: "6px", background: "rgba(5,150,105,0.1)", borderRadius: 8 }}>
                        <Map size={14} style={{ color: "#059669" }} />
                    </div>
                    <div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>Learning Roadmap</span>
                        {roadmap && (
                            <span style={{ marginLeft: 8, fontSize: 11, color: "#64748b" }}>
                                {roadmap.total_weeks} weeks · {roadmap.readiness_date}
                                {totalTasks > 0 && ` · ${completedTasks}/${totalTasks} tasks done`}
                            </span>
                        )}
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {/* Progress bar */}
                    {totalTasks > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ width: 60, height: 5, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
                                <div style={{ width: `${(completedTasks / totalTasks) * 100}%`, height: 5, background: "#059669", borderRadius: 4, transition: "width 0.4s" }} />
                            </div>
                            <span style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>{Math.round((completedTasks / totalTasks) * 100)}%</span>
                        </div>
                    )}
                    {expanded ? <ChevronUp size={16} style={{ color: "#94a3b8" }} /> : <ChevronDown size={16} style={{ color: "#94a3b8" }} />}
                </div>
            </div>

            {expanded && (
                <div style={{ padding: "16px 20px" }}>
                    {/* Controls row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Hours/week:</span>
                            {HOURS_OPTIONS.map(h => (
                                <button
                                    key={h}
                                    onClick={e => { e.stopPropagation(); onHoursChange(h); }}
                                    style={{
                                        padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                                        border: "1px solid",
                                        borderColor: hoursPerWeek === h ? "#059669" : "#e2e8f0",
                                        background: hoursPerWeek === h ? "#059669" : "white",
                                        color: hoursPerWeek === h ? "white" : "#64748b",
                                        cursor: "pointer", transition: "all 0.15s",
                                    }}
                                >
                                    {h}h
                                </button>
                            ))}
                        </div>
                        <button
                            id="generate-roadmap-btn"
                            onClick={e => { e.stopPropagation(); onGenerate(); }}
                            disabled={isLoading || !bridgeProjectsAvailable}
                            style={{
                                display: "flex", alignItems: "center", gap: 6,
                                padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                                background: bridgeProjectsAvailable ? "linear-gradient(135deg,#059669,#10b981)" : "#e2e8f0",
                                color: bridgeProjectsAvailable ? "white" : "#94a3b8",
                                border: "none", cursor: bridgeProjectsAvailable ? "pointer" : "not-allowed",
                                boxShadow: bridgeProjectsAvailable ? "0 2px 8px rgba(5,150,105,0.3)" : "none",
                                opacity: isLoading ? 0.7 : 1,
                            }}
                        >
                            {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                            {isLoading ? "Generating…" : roadmap ? "Regenerate" : "Generate Roadmap"}
                        </button>
                        {!bridgeProjectsAvailable && (
                            <span style={{ fontSize: 11, color: "#94a3b8" }}>Generate an action plan first</span>
                        )}
                    </div>

                    {/* Loading skeleton */}
                    {isLoading && (
                        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
                            {[...Array(4)].map((_, i) => (
                                <div key={i} style={{ minWidth: 200, height: 180, background: "#f1f5f9", borderRadius: 12, animation: "pulse 1.5s ease-in-out infinite", animationDelay: `${i * 120}ms`, flexShrink: 0 }} />
                            ))}
                        </div>
                    )}

                    {/* Empty state */}
                    {!roadmap && !isLoading && (
                        <div style={{ textAlign: "center", padding: "28px 0", color: "#94a3b8" }}>
                            <Map size={32} style={{ margin: "0 auto 10px", opacity: 0.4 }} />
                            <p style={{ fontSize: 13, fontWeight: 500 }}>No roadmap yet</p>
                            <p style={{ fontSize: 12, marginTop: 4 }}>Set your available hours and click Generate Roadmap.</p>
                        </div>
                    )}

                    {/* Roadmap timeline */}
                    {!isLoading && roadmap && (
                        <>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, fontSize: 12, color: "#64748b" }}>
                                <span>📅 {roadmap.total_weeks} weeks</span>
                                <span>·</span>
                                <span>⏱ {roadmap.total_hours} total hours</span>
                                <span>·</span>
                                <span style={{ color: "#059669", fontWeight: 600 }}>Ready {roadmap.readiness_date}</span>
                            </div>
                            <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 12 }}>
                                {roadmap.weeks.map((week, wi) => {
                                    const color = WEEK_COLORS[wi % WEEK_COLORS.length];
                                    const weekCompleted = week.tasks.every((_, ti) => checked[`${wi}_${ti}`]);
                                    return (
                                        <div
                                            key={wi}
                                            style={{
                                                minWidth: 220, background: color.bg, borderRadius: 12,
                                                border: `1px solid ${color.border}33`, flexShrink: 0,
                                                padding: 16, position: "relative", overflow: "hidden",
                                                boxShadow: weekCompleted ? `0 0 0 2px ${color.border}` : "none",
                                                transition: "box-shadow 0.3s",
                                            }}
                                        >
                                            {weekCompleted && (
                                                <div style={{ position: "absolute", top: 8, right: 8, background: color.border, borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                    <span style={{ fontSize: 10, color: "white" }}>✓</span>
                                                </div>
                                            )}
                                            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: color.header, marginBottom: 4 }}>
                                                Week {week.week}
                                            </div>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 12, lineHeight: 1.3 }}>
                                                {week.focus_skill}
                                            </div>
                                            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                                                {week.tasks.map((task, ti) => {
                                                    const isChecked = !!checked[`${wi}_${ti}`];
                                                    return (
                                                        <label key={ti} style={{ display: "flex", alignItems: "flex-start", gap: 7, cursor: "pointer" }}>
                                                            <button
                                                                onClick={e => { e.stopPropagation(); toggleCheck(wi, ti); }}
                                                                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", flexShrink: 0, marginTop: 1 }}
                                                            >
                                                                {isChecked
                                                                    ? <CheckSquare size={14} style={{ color: color.border }} />
                                                                    : <Square size={14} style={{ color: "#94a3b8" }} />
                                                                }
                                                            </button>
                                                            <span style={{ fontSize: 11, color: isChecked ? "#94a3b8" : "#475569", textDecoration: isChecked ? "line-through" : "none", lineHeight: 1.4 }}>
                                                                {task}
                                                            </span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                            {/* Milestone */}
                                            <div style={{ background: "white", borderRadius: 8, padding: "7px 10px", fontSize: 11, color: "#1e293b", border: `1px solid ${color.border}44` }}>
                                                <span style={{ fontSize: 10, fontWeight: 700, color: color.header, display: "block", marginBottom: 2 }}>MILESTONE</span>
                                                {week.milestone}
                                            </div>
                                            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 8 }}>~{week.hours_required}h this week</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
