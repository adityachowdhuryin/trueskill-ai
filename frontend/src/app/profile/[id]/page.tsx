"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import VerifiedBadge from "@/components/VerifiedBadge";
import { ShieldCheck, ExternalLink, AlertCircle } from "lucide-react";

interface SkillEntry {
    topic: string;
    score: number;
    status: "Verified" | "Partially Verified" | "Unverified";
}

interface ProfileData {
    id: string;
    candidate_name: string;
    overall_score: number;
    skills: SkillEntry[];
    repo_names: string[];
    created_at: string;
    share_token: string;
    results: Record<string, any>;
}

export default function PublicProfilePage() {
    const params = useParams();
    const token = params?.id as string;

    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        if (!token) return;
        fetch(`/api/profile/${token}`)
            .then(r => {
                if (r.status === 404) { setNotFound(true); setLoading(false); return null; }
                if (!r.ok) throw new Error("Server error");
                return r.json();
            })
            .then(data => {
                if (data) { setProfile(data); setLoading(false); }
            })
            .catch(() => { setNotFound(true); setLoading(false); });
    }, [token]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-slate-400 text-sm">Loading verified profile…</p>
                </div>
            </div>
        );
    }

    if (notFound || !profile) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
                <div className="text-center max-w-sm">
                    <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-5">
                        <AlertCircle className="w-8 h-8 text-red-400" />
                    </div>
                    <h1 className="text-xl font-bold text-white mb-2">Profile Not Found</h1>
                    <p className="text-slate-400 text-sm mb-6">
                        This profile link is invalid, expired, or the analysis has been made private.
                    </p>
                    <Link
                        href="/"
                        className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
                        style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}
                    >
                        Go to TrueSkill AI →
                    </Link>
                </div>
            </div>
        );
    }

    // Build skills array from results or skills field
    let skills: SkillEntry[] = profile.skills ?? [];
    if (!skills.length && profile.results?.verification_results) {
        skills = profile.results.verification_results.map((r: any) => ({
            topic: r.topic,
            score: r.score,
            status: r.status,
        }));
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">

            {/* Ambient glows */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden>
                <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-indigo-600/6 rounded-full blur-3xl" />
                <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-violet-600/6 rounded-full blur-3xl" />
            </div>

            {/* Nav */}
            <nav className="relative z-10 flex items-center justify-between max-w-3xl mx-auto px-6 py-5">
                <div className="flex items-center gap-2.5">
                    <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shadow-lg"
                        style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)", boxShadow: "0 0 16px rgba(99,102,241,0.4)" }}
                    >
                        TS
                    </div>
                    <span className="font-bold text-lg tracking-tight">TrueSkill AI</span>
                </div>
                <Link
                    href="/dashboard"
                    className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
                >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Verify your own skills
                </Link>
            </nav>

            {/* Hero */}
            <div className="relative z-10 max-w-3xl mx-auto px-6 pt-4 pb-6">
                <div
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold mb-6"
                    style={{
                        background: "rgba(99,102,241,0.08)",
                        borderColor: "rgba(99,102,241,0.2)",
                        color: "#818cf8",
                    }}
                >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Verified Developer Profile — TrueSkill AI
                </div>

                <VerifiedBadge
                    candidateName={profile.candidate_name}
                    overallScore={profile.overall_score ?? 0}
                    skills={skills}
                    createdAt={profile.created_at}
                    shareToken={token}
                />

                {/* Repo context */}
                {profile.repo_names?.length > 0 && (
                    <div className="mt-5 p-4 rounded-xl border border-white/8" style={{ background: "rgba(255,255,255,0.02)" }}>
                        <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider mb-2">Analysed Repositories</p>
                        <div className="flex flex-wrap gap-2">
                            {profile.repo_names.map((r: string) => (
                                <span key={r} className="px-2.5 py-1 rounded-lg border border-white/8 text-xs text-slate-300 font-mono">
                                    {r}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* CTA */}
                <div className="mt-8 text-center">
                    <p className="text-sm text-slate-500 mb-4">
                        Want your own verified skills profile?
                    </p>
                    <Link
                        href="/dashboard"
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all hover:scale-105"
                        style={{
                            background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
                            boxShadow: "0 8px 24px rgba(79,70,229,0.35)",
                        }}
                    >
                        <ShieldCheck className="w-4 h-4" />
                        Verify My Skills →
                    </Link>
                </div>
            </div>
        </div>
    );
}
