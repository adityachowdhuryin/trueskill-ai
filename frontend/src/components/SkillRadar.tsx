"use client";

import { useState, useEffect } from "react";
import {
    Radar, RadarChart, PolarGrid, PolarAngleAxis,
    ResponsiveContainer, Tooltip, Legend
} from "recharts";
import { Target, TrendingUp, ChevronDown } from "lucide-react";

interface SkillRadarProps {
    verifiedSkills: Array<{ topic: string; score: number; status: string }>;
    /** Optional pre-loaded benchmark. If omitted, shows role selector. */
    benchmarkScores?: Record<string, number>;
    benchmarkLabel?: string;
}

const ROLE_OPTIONS = [
    { slug: "software-engineer",        label: "Software Engineer" },
    { slug: "senior-software-engineer", label: "Senior Software Engineer" },
    { slug: "backend-engineer",         label: "Backend Engineer" },
    { slug: "frontend-engineer",        label: "Frontend Engineer" },
    { slug: "fullstack-engineer",       label: "Full-Stack Engineer" },
    { slug: "data-scientist",           label: "Data Scientist" },
    { slug: "ml-engineer",              label: "ML Engineer" },
    { slug: "data-engineer",            label: "Data Engineer" },
    { slug: "devops-engineer",          label: "DevOps Engineer" },
    { slug: "nlp-engineer",             label: "NLP Engineer" },
];

// Recharts tooltip
function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div
            className="rounded-xl border border-white/10 px-4 py-3 text-sm shadow-2xl"
            style={{ background: "rgba(15,23,42,0.92)", backdropFilter: "blur(12px)" }}
        >
            <p className="font-bold text-white mb-1.5">{label}</p>
            {payload.map((entry: any) => (
                <p key={entry.name} style={{ color: entry.color }} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: entry.color }} />
                    {entry.name}: <strong>{entry.value}</strong>
                </p>
            ))}
        </div>
    );
}

export default function SkillRadar({ verifiedSkills, benchmarkScores, benchmarkLabel }: SkillRadarProps) {
    const [selectedRole, setSelectedRole] = useState(ROLE_OPTIONS[0].slug);
    const [benchmark, setBenchmark] = useState<Record<string, number>>(benchmarkScores ?? {});
    const [benchLabel, setBenchLabel] = useState(benchmarkLabel ?? ROLE_OPTIONS[0].label);
    const [loading, setLoading] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);

    // Build candidate score map from verified skills (normalised to topic title case)
    const candidateMap: Record<string, number> = {};
    for (const skill of verifiedSkills) {
        candidateMap[skill.topic] = skill.score;
    }

    // Pick the top 8 topics that are either in candidate or benchmark
    const allTopics = Array.from(new Set([
        ...Object.keys(candidateMap),
        ...Object.keys(benchmark),
    ])).slice(0, 8);

    const chartData = allTopics.map((topic) => ({
        topic: topic.length > 16 ? topic.slice(0, 14) + "…" : topic,
        fullTopic: topic,
        Candidate: candidateMap[topic] ?? 0,
        Benchmark: benchmark[topic] ?? 0,
    }));

    // Fetch benchmark when role changes
    const fetchBenchmark = async (slug: string, label: string) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/benchmarks/${slug}`);
            if (res.ok) {
                const data = await res.json();
                setBenchmark(data.scores ?? {});
                setBenchLabel(label);
            }
        } catch {
            // silent — keep previous benchmark
        } finally {
            setLoading(false);
        }
    };

    // Load default benchmark on mount if not provided externally
    useEffect(() => {
        if (!benchmarkScores) {
            fetchBenchmark(selectedRole, ROLE_OPTIONS[0].label);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleRoleSelect = (slug: string, label: string) => {
        setSelectedRole(slug);
        setBenchLabel(label);
        setDropdownOpen(false);
        fetchBenchmark(slug, label);
    };

    if (verifiedSkills.length === 0) return null;

    return (
        <div
            className="rounded-2xl border border-white/8 p-6"
            style={{
                background: "rgba(255,255,255,0.03)",
                backdropFilter: "blur(12px)",
            }}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                <div className="flex items-center gap-2.5">
                    <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
                    >
                        <Target className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h3 className="font-bold text-white">Skill Radar</h3>
                        <p className="text-xs text-slate-400">Your verified skills vs industry benchmark</p>
                    </div>
                </div>

                {/* Role selector dropdown */}
                <div className="relative">
                    <button
                        id="radar-role-selector"
                        onClick={() => setDropdownOpen(!dropdownOpen)}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-slate-300 border border-white/10 hover:border-violet-500/40 hover:text-white transition-all duration-200"
                        style={{ background: "rgba(255,255,255,0.04)" }}
                        disabled={loading}
                    >
                        {loading
                            ? <span className="animate-pulse">Loading…</span>
                            : <span className="flex items-center gap-1.5">
                                <TrendingUp className="w-3.5 h-3.5 text-violet-400" />
                                {benchLabel}
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
                            </span>
                        }
                    </button>

                    {dropdownOpen && (
                        <div
                            className="absolute right-0 top-full mt-1 w-56 rounded-xl border border-white/10 shadow-2xl z-50 overflow-hidden"
                            style={{ background: "rgba(15,23,42,0.97)", backdropFilter: "blur(20px)" }}
                        >
                            {ROLE_OPTIONS.map((role) => (
                                <button
                                    key={role.slug}
                                    id={`radar-role-${role.slug}`}
                                    onClick={() => handleRoleSelect(role.slug, role.label)}
                                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-violet-500/10 hover:text-violet-300 transition-colors ${selectedRole === role.slug ? "text-violet-400 bg-violet-500/10" : "text-slate-300"}`}
                                >
                                    {role.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Chart */}
            <div style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={chartData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                        <PolarGrid
                            stroke="rgba(255,255,255,0.06)"
                            gridType="polygon"
                        />
                        <PolarAngleAxis
                            dataKey="topic"
                            tick={{
                                fill: "#94a3b8",
                                fontSize: 11,
                                fontWeight: 500,
                            }}
                        />
                        <Radar
                            name="Your Skills"
                            dataKey="Candidate"
                            stroke="#6366f1"
                            fill="#6366f1"
                            fillOpacity={0.25}
                            strokeWidth={2}
                        />
                        <Radar
                            name={benchLabel}
                            dataKey="Benchmark"
                            stroke="#f59e0b"
                            fill="#f59e0b"
                            fillOpacity={0.12}
                            strokeWidth={1.5}
                            strokeDasharray="5 3"
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend
                            wrapperStyle={{ fontSize: 12, color: "#94a3b8", paddingTop: 12 }}
                            formatter={(value) => (
                                <span style={{ color: value === "Your Skills" ? "#818cf8" : "#fbbf24" }}>{value}</span>
                            )}
                        />
                    </RadarChart>
                </ResponsiveContainer>
            </div>

            {/* Gap summary chips */}
            {Object.keys(benchmark).length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                    {chartData
                        .filter(d => d.Benchmark - d.Candidate > 15)
                        .sort((a, b) => (b.Benchmark - b.Candidate) - (a.Benchmark - a.Candidate))
                        .slice(0, 4)
                        .map(d => (
                            <span
                                key={d.fullTopic}
                                className="px-2.5 py-1 rounded-full text-xs font-medium border"
                                style={{
                                    background: "rgba(245,158,11,0.08)",
                                    borderColor: "rgba(245,158,11,0.2)",
                                    color: "#fbbf24",
                                }}
                            >
                                ↑ {d.fullTopic} gap: +{d.Benchmark - d.Candidate}pts
                            </span>
                        ))
                    }
                </div>
            )}
        </div>
    );
}
