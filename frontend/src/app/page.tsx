"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Particle data for the animated starfield
const PARTICLES = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 2 + 1,
    opacity: Math.random() * 0.4 + 0.1,
    duration: Math.random() * 8 + 4,
    delay: Math.random() * 4,
}));

const FEATURES = [
    {
        icon: "🔍",
        color: "from-blue-500/20 to-blue-600/20",
        iconBg: "bg-blue-500/20",
        iconGlow: "rgba(59,130,246,0.3)",
        title: "Ingestion Engine",
        desc: "Clones GitHub repos, parses code via tree-sitter, and builds a Neo4j Knowledge Graph of files, classes, functions, and imports.",
        accent: "border-blue-500/30",
    },
    {
        icon: "🧠",
        color: "from-violet-500/20 to-violet-600/20",
        iconBg: "bg-violet-500/20",
        iconGlow: "rgba(139,92,246,0.3)",
        title: "Council of Agents",
        desc: "A LangGraph-powered Parser → Auditor → Grader pipeline that extracts claims, queries the graph, and scores each with evidence.",
        accent: "border-violet-500/30",
    },
    {
        icon: "🎯",
        color: "from-emerald-500/20 to-emerald-600/20",
        iconBg: "bg-emerald-500/20",
        iconGlow: "rgba(16,185,129,0.3)",
        title: "Career Coach",
        desc: "Compares verified skills against job descriptions and generates personalized \"Bridge Projects\" to close skill gaps.",
        accent: "border-emerald-500/30",
    },
];

const TECH_STACK = ["Next.js 14", "FastAPI", "Neo4j", "LangGraph", "Gemini 2.5", "tree-sitter"];

export default function Home() {
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white overflow-hidden">

            {/* ── Animated Particle Starfield ── */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
                {PARTICLES.map((p) => (
                    <div
                        key={p.id}
                        className="absolute rounded-full bg-white"
                        style={{
                            left: `${p.x}%`,
                            top: `${p.y}%`,
                            width: p.size,
                            height: p.size,
                            opacity: p.opacity,
                            animation: `float ${p.duration}s ease-in-out infinite`,
                            animationDelay: `${p.delay}s`,
                        }}
                    />
                ))}
                {/* Ambient glow blobs */}
                <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-blue-600/8 rounded-full blur-3xl" />
                <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-violet-600/8 rounded-full blur-3xl" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-emerald-600/4 rounded-full blur-3xl" />
            </div>

            {/* ── Navigation ── */}
            <nav
                className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between max-w-7xl mx-auto px-6 py-5 transition-all duration-300"
                style={scrolled ? {
                    backdropFilter: "blur(20px)",
                    background: "rgba(15,23,42,0.7)",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                    padding: "12px 24px",
                } : undefined}
            >
                {/* Logo */}
                <div className="flex items-center gap-3">
                    <div
                        className="w-9 h-9 bg-gradient-to-br from-blue-500 to-violet-600 rounded-xl flex items-center justify-center font-black text-sm shadow-lg"
                        style={{ boxShadow: "0 0 20px rgba(99,102,241,0.5)" }}
                    >
                        TS
                    </div>
                    <span className="text-xl font-bold tracking-tight">TrueSkill AI</span>
                </div>

                <Link
                    href="/dashboard"
                    className="group relative px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 overflow-hidden"
                    style={{
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.12)",
                    }}
                >
                    <span className="relative z-10 flex items-center gap-1.5">
                        Open Dashboard
                        <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
                    </span>
                    {/* Hover fill */}
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-violet-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </Link>
            </nav>

            {/* ── Hero Section ── */}
            <main className="relative z-10 max-w-5xl mx-auto px-6 pt-36 pb-32 text-center">

                {/* Animated live badge */}
                <div
                    className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm text-sm text-slate-300 mb-10 animate-slide-up"
                    style={{ animationDelay: "0ms" }}
                >
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping-slow absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    MSc Thesis Project — GraphRAG Competency Verification
                </div>

                {/* Animated headline */}
                <h1
                    className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-tight mb-8 animate-slide-up"
                    style={{ animationDelay: "80ms" }}
                >
                    Verify Resume Claims
                    <br />
                    <span
                        className="bg-gradient-to-r from-blue-400 via-violet-400 to-emerald-400 bg-clip-text text-transparent animate-gradient-text"
                        style={{ backgroundSize: "200% 200%" }}
                    >
                        Against Real Code
                    </span>
                </h1>

                {/* Subtitle */}
                <p
                    className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed animate-slide-up"
                    style={{ animationDelay: "160ms" }}
                >
                    A multi-agent system that cross-references PDF resume claims with actual GitHub repository analysis using{" "}
                    <strong className="text-slate-200">GraphRAG</strong>,{" "}
                    <strong className="text-slate-200">cyclomatic complexity</strong>, and{" "}
                    <strong className="text-slate-200">coding stylometry</strong>.
                </p>

                {/* CTAs */}
                <div
                    className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-24 animate-slide-up"
                    style={{ animationDelay: "240ms" }}
                >
                    <Link
                        href="/dashboard"
                        className="group relative w-full sm:w-auto px-8 py-3.5 rounded-xl text-sm font-bold overflow-hidden transition-all duration-300 hover:scale-105"
                        style={{
                            background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
                            boxShadow: "0 8px 30px rgba(79,70,229,0.4)",
                        }}
                    >
                        <span className="relative z-10">Get Started →</span>
                        <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors duration-300" />
                    </Link>

                    <a
                        href="https://github.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group w-full sm:w-auto px-8 py-3.5 rounded-xl text-sm font-semibold transition-all duration-300 hover:scale-105"
                        style={{
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.1)",
                        }}
                    >
                        <span className="text-slate-300 group-hover:text-white transition-colors">View Source Code</span>
                    </a>
                </div>

                {/* Feature Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-left">
                    {FEATURES.map((f, i) => (
                        <div
                            key={f.title}
                            className={`group relative p-6 rounded-2xl border ${f.accent} backdrop-blur-sm cursor-default animate-slide-up transition-all duration-300 hover:-translate-y-1`}
                            style={{
                                animationDelay: `${320 + i * 100}ms`,
                                background: "rgba(255,255,255,0.03)",
                            }}
                        >
                            {/* Hover glow */}
                            <div
                                className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                                style={{ background: `radial-gradient(circle at 50% 0%, ${f.iconGlow} 0%, transparent 70%)` }}
                            />

                            {/* Icon */}
                            <div
                                className={`relative z-10 w-11 h-11 ${f.iconBg} rounded-xl flex items-center justify-center mb-4 text-xl transition-transform duration-300 group-hover:scale-110`}
                                style={{ boxShadow: `0 0 20px ${f.iconGlow}` }}
                            >
                                {f.icon}
                            </div>

                            <h3 className="relative z-10 font-bold text-lg mb-2 text-white">{f.title}</h3>
                            <p className="relative z-10 text-sm text-slate-400 leading-relaxed">{f.desc}</p>
                        </div>
                    ))}
                </div>
            </main>

            {/* ── Tech Stack Footer ── */}
            <footer className="relative z-10 border-t border-white/6 py-8">
                <div className="max-w-5xl mx-auto px-6 flex flex-wrap items-center justify-center gap-3 text-sm text-slate-500">
                    <span className="text-slate-600 mr-2 text-xs font-medium uppercase tracking-widest">Built with</span>
                    {TECH_STACK.map((tech, i) => (
                        <span
                            key={tech}
                            className="group px-3 py-1.5 rounded-full border border-white/6 bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/12 hover:text-slate-300 hover:-translate-y-0.5 transition-all duration-200 cursor-default animate-fade-in"
                            style={{ animationDelay: `${600 + i * 60}ms` }}
                        >
                            {tech}
                        </span>
                    ))}
                </div>
            </footer>
        </div>
    );
}
