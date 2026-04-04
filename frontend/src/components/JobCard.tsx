"use client";

import { MapPin, Building2, Calendar, DollarSign, ExternalLink, Sparkles } from "lucide-react";

export interface JobPosting {
    title: string;
    company: string;
    location: string;
    description: string;
    apply_url: string;
    posted_date: string;
    salary: string;
}

interface JobCardProps {
    job: JobPosting;
    onSelect: (job: JobPosting) => void;
    isSelected?: boolean;
    index?: number;
}

function CompanyAvatar({ name }: { name: string }) {
    const initials = name
        .split(/[\s&,]+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("");

    // Hash company name to pick a consistent gradient
    const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const gradients = [
        "from-blue-500 to-indigo-600",
        "from-violet-500 to-purple-600",
        "from-emerald-500 to-teal-600",
        "from-rose-500 to-pink-600",
        "from-amber-500 to-orange-600",
        "from-cyan-500 to-sky-600",
        "from-fuchsia-500 to-pink-600",
    ];
    const gradient = gradients[hash % gradients.length];

    return (
        <div
            className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-black text-sm flex-shrink-0 shadow-lg`}
        >
            {initials || <Building2 size={16} />}
        </div>
    );
}

export default function JobCard({ job, onSelect, isSelected = false, index = 0 }: JobCardProps) {
    return (
        <div
            className="group relative rounded-2xl border transition-all duration-300 cursor-pointer hover:-translate-y-0.5 overflow-hidden"
            style={{
                background: isSelected
                    ? "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 100%)"
                    : "rgba(255,255,255,0.04)",
                borderColor: isSelected ? "rgba(99,102,241,0.6)" : "rgba(255,255,255,0.08)",
                boxShadow: isSelected ? "0 0 0 1px rgba(99,102,241,0.3), 0 4px 20px rgba(99,102,241,0.15)" : "none",
                animationDelay: `${index * 60}ms`,
            }}
            onClick={() => onSelect(job)}
        >
            {/* Selected glow */}
            {isSelected && (
                <div
                    className="absolute inset-0 rounded-2xl pointer-events-none"
                    style={{ background: "radial-gradient(circle at 0% 0%, rgba(99,102,241,0.1) 0%, transparent 60%)" }}
                />
            )}

            <div className="p-4 relative z-10">
                {/* Header */}
                <div className="flex items-start gap-3 mb-3">
                    <CompanyAvatar name={job.company} />
                    <div className="flex-1 min-w-0">
                        <h3
                            className="font-bold text-sm leading-tight mb-0.5 truncate transition-colors duration-200"
                            style={{ color: isSelected ? "#a5b4fc" : "#f1f5f9" }}
                        >
                            {job.title}
                        </h3>
                        <p className="text-xs text-slate-400 font-medium truncate">{job.company}</p>
                    </div>
                    {isSelected && (
                        <div
                            className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                            style={{ background: "rgba(99,102,241,0.3)", border: "1px solid rgba(99,102,241,0.6)" }}
                        >
                            <div className="w-2 h-2 rounded-full bg-indigo-400" />
                        </div>
                    )}
                </div>

                {/* Description snippet */}
                <p
                    className="text-xs leading-relaxed mb-3 line-clamp-3"
                    style={{ color: "rgba(148,163,184,0.9)" }}
                >
                    {job.description || "No description available."}
                </p>

                {/* Meta row */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                    {job.location && (
                        <span
                            className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                            style={{ background: "rgba(16,185,129,0.1)", color: "#6ee7b7", border: "1px solid rgba(16,185,129,0.2)" }}
                        >
                            <MapPin size={9} />
                            {job.location}
                        </span>
                    )}
                    {job.salary && (
                        <span
                            className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                            style={{ background: "rgba(245,158,11,0.1)", color: "#fcd34d", border: "1px solid rgba(245,158,11,0.2)" }}
                        >
                            <DollarSign size={9} />
                            {job.salary}
                        </span>
                    )}
                    {job.posted_date && (
                        <span
                            className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                            style={{ background: "rgba(148,163,184,0.08)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.15)" }}
                        >
                            <Calendar size={9} />
                            {job.posted_date}
                        </span>
                    )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={(e) => { e.stopPropagation(); onSelect(job); }}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
                        style={{
                            background: isSelected ? "rgba(99,102,241,0.3)" : "rgba(99,102,241,0.15)",
                            border: "1px solid rgba(99,102,241,0.4)",
                            color: "#a5b4fc",
                        }}
                    >
                        <Sparkles size={11} />
                        {isSelected ? "Selected ✓" : "Use This Job"}
                    </button>
                    <a
                        href={job.apply_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all duration-200 hover:opacity-80"
                        style={{
                            background: "rgba(255,255,255,0.05)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            color: "#64748b",
                        }}
                    >
                        <ExternalLink size={10} />
                        Apply
                    </a>
                </div>
            </div>
        </div>
    );
}
