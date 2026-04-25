"use client";

import { CheckCircle, AlertCircle, XCircle, ShieldCheck, ExternalLink } from "lucide-react";

interface SkillEntry {
    topic: string;
    score: number;
    status: "Verified" | "Partially Verified" | "Unverified";
}

interface VerifiedBadgeProps {
    candidateName: string;
    overallScore: number;
    skills: SkillEntry[];
    createdAt: string;
    shareToken?: string;
    compact?: boolean;   // small inline badge vs full card
}

const STATUS_COLORS: Record<string, string> = {
    "Verified":           "#10b981",
    "Partially Verified": "#f59e0b",
    "Unverified":         "#ef4444",
};

function scoreGrade(score: number): { label: string; color: string } {
    if (score >= 80) return { label: "Excellent", color: "#10b981" };
    if (score >= 65) return { label: "Strong",    color: "#6366f1" };
    if (score >= 50) return { label: "Moderate",  color: "#f59e0b" };
    return               { label: "Needs Work",   color: "#ef4444" };
}

export default function VerifiedBadge({
    candidateName,
    overallScore,
    skills,
    createdAt,
    shareToken,
    compact = false,
}: VerifiedBadgeProps) {
    const grade = scoreGrade(overallScore);
    const verifiedCount  = skills.filter(s => s.status === "Verified").length;
    const topSkills = [...skills].sort((a, b) => b.score - a.score).slice(0, 6);
    const dateStr = new Date(createdAt).toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
    });

    if (compact) {
        return (
            <div
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-semibold"
                style={{
                    background: "rgba(99,102,241,0.1)",
                    borderColor: "rgba(99,102,241,0.3)",
                    color: "#818cf8",
                }}
            >
                <ShieldCheck className="w-4 h-4" />
                TrueSkill Verified — {Math.round(overallScore)}%
            </div>
        );
    }

    return (
        <div
            className="relative rounded-2xl border overflow-hidden"
            style={{
                background: "linear-gradient(135deg, rgba(15,23,42,0.98) 0%, rgba(30,27,75,0.98) 100%)",
                borderColor: "rgba(99,102,241,0.3)",
                boxShadow: "0 0 60px rgba(99,102,241,0.15), 0 0 120px rgba(139,92,246,0.08)",
            }}
        >
            {/* Glow orb */}
            <div
                className="absolute -top-20 -right-20 w-64 h-64 rounded-full blur-3xl pointer-events-none"
                style={{ background: "rgba(99,102,241,0.12)" }}
            />

            {/* Header */}
            <div className="relative z-10 px-8 pt-8 pb-6 border-b border-white/8">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <ShieldCheck className="w-5 h-5 text-indigo-400" />
                            <span className="text-xs font-semibold text-indigo-400 uppercase tracking-widest">
                                TrueSkill AI · Verified Profile
                            </span>
                        </div>
                        <h1 className="text-3xl font-black text-white tracking-tight mt-1">
                            {candidateName}
                        </h1>
                        <p className="text-sm text-slate-400 mt-1">Verified on {dateStr}</p>
                    </div>

                    {/* Overall score ring */}
                    <div className="flex-shrink-0 text-center">
                        <div
                            className="w-20 h-20 rounded-full flex flex-col items-center justify-center border-4"
                            style={{
                                borderColor: grade.color,
                                boxShadow: `0 0 24px ${grade.color}44`,
                                background: `${grade.color}11`,
                            }}
                        >
                            <span className="text-2xl font-black" style={{ color: grade.color }}>
                                {Math.round(overallScore)}
                            </span>
                            <span className="text-[9px] text-slate-400 uppercase tracking-wide">/ 100</span>
                        </div>
                        <p className="text-xs font-bold mt-1.5" style={{ color: grade.color }}>
                            {grade.label}
                        </p>
                    </div>
                </div>

                {/* Summary chips */}
                <div className="flex flex-wrap gap-2 mt-4">
                    <Chip label={`${verifiedCount} skills verified`} color="#10b981" />
                    <Chip label={`${skills.length} claims checked`} color="#6366f1" />
                </div>
            </div>

            {/* Skills grid */}
            <div className="relative z-10 px-8 py-6">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
                    Verified Skills
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {topSkills.map((skill) => {
                        const Icon = skill.status === "Verified"
                            ? CheckCircle
                            : skill.status === "Partially Verified"
                            ? AlertCircle : XCircle;
                        const color = STATUS_COLORS[skill.status];
                        return (
                            <div
                                key={skill.topic}
                                className="flex items-center gap-3 p-3 rounded-xl border"
                                style={{
                                    background: `${color}08`,
                                    borderColor: `${color}22`,
                                }}
                            >
                                <Icon className="w-4 h-4 flex-shrink-0" style={{ color }} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-semibold text-white truncate">{skill.topic}</span>
                                        <span className="text-xs font-bold flex-shrink-0" style={{ color }}>
                                            {skill.score}%
                                        </span>
                                    </div>
                                    {/* Progress bar */}
                                    <div className="mt-1.5 h-1 rounded-full bg-white/8 overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-700"
                                            style={{ width: `${skill.score}%`, background: color }}
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Footer */}
            <div className="relative z-10 px-8 py-4 border-t border-white/6">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="text-xs text-slate-500">
                        Verified by cross-referencing resume claims with GitHub repository code analysis
                        using GraphRAG + Cyclomatic Complexity analysis.
                    </p>
                    {shareToken && (
                        <a
                            href={`/profile/${shareToken}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                            <ExternalLink className="w-3 h-3" />
                            View public profile
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
}

function Chip({ label, color }: { label: string; color: string }) {
    return (
        <span
            className="px-2.5 py-1 rounded-full text-xs font-medium border"
            style={{
                background: `${color}12`,
                borderColor: `${color}30`,
                color,
            }}
        >
            {label}
        </span>
    );
}
