"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import {
    LayoutDashboard, Microscope, FolderGit2, GraduationCap,
    FileText, GitCompare, ChevronLeft, ChevronRight,
    CheckCircle2, Sparkles, ScanSearch, Home, Info, Cpu, X,
} from "lucide-react";
import { useDashboard } from "@/contexts/DashboardContext";

const MAIN_LINKS = [
    {
        href: "/dashboard",
        exact: true,
        icon: LayoutDashboard,
        label: "Overview",
        desc: "Your dashboard hub",
    },
    {
        href: "/dashboard/verification",
        exact: false,
        icon: Microscope,
        label: "Verification",
        desc: "Skills & code analysis",
        statusKey: "skills" as const,
    },
    {
        href: "/dashboard/projects",
        exact: false,
        icon: FolderGit2,
        label: "Projects",
        desc: "Project verification",
        statusKey: "projects" as const,
    },
    {
        href: "/dashboard/coach",
        exact: false,
        icon: GraduationCap,
        label: "Career Coach",
        desc: "Action plans & JD match",
        statusKey: "coach" as const,
    },
    {
        href: "/dashboard/ats",
        exact: false,
        icon: ScanSearch,
        label: "ATS Scorer",
        desc: "Score resume vs JD",
    },
];

const SECONDARY_LINKS = [
    { href: "/resume-toolkit", icon: FileText, label: "Resume Toolkit" },
    { href: "/compare", icon: GitCompare, label: "Compare" },
];

export default function DashboardSidebar() {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const { analysisResult, projectResults, bridgeProjects, githubUsername } = useDashboard();
    const [showSysInfo, setShowSysInfo] = useState(false);
    const [sysInfo, setSysInfo] = useState<{ providers: Array<{ name: string; model: string; key_hint: string }> } | null>(null);
    const [loadingSysInfo, setLoadingSysInfo] = useState(false);

    const toggleSysInfo = useCallback(async () => {
        if (showSysInfo) { setShowSysInfo(false); return; }
        setShowSysInfo(true);
        if (sysInfo) return;
        setLoadingSysInfo(true);
        try {
            const apiBase = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
            const res = await fetch(`${apiBase}/api/system-info`);
            if (res.ok) setSysInfo(await res.json());
        } catch { /* silent */ } finally { setLoadingSysInfo(false); }
    }, [showSysInfo, sysInfo]);

    // Persist collapsed state
    useEffect(() => {
        const saved = localStorage.getItem("sidebar_collapsed");
        if (saved === "true") setCollapsed(true);
    }, []);
    const toggleCollapsed = () => {
        setCollapsed(v => {
            localStorage.setItem("sidebar_collapsed", String(!v));
            return !v;
        });
    };

    const statusMap = {
        skills: (analysisResult?.verification_results?.length ?? 0) > 0,
        projects: (projectResults?.length ?? 0) > 0,
        coach: bridgeProjects.length > 0,
    };

    const isActive = (href: string, exact: boolean) => {
        if (exact) return pathname === href;
        return pathname.startsWith(href);
    };

    return (
        <>
            {/* ── Desktop Sidebar ───────────────────────────────────────────────── */}
            <aside
                className="hidden md:flex flex-col h-screen sticky top-0 bg-white border-r border-slate-200/80 transition-all duration-300 ease-in-out select-none z-40 flex-shrink-0"
                style={{ width: collapsed ? 64 : 240 }}
            >
                {/* Logo — click to go home */}
                <div className="flex items-center px-4 h-16 border-b border-slate-100 overflow-hidden">
                    <Link href="/" className="flex items-center gap-0 group" title="Back to home">
                        <div
                            className="w-9 h-9 flex-shrink-0 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center font-black text-sm text-white shadow-md group-hover:scale-105 transition-transform"
                            style={{ boxShadow: "0 0 16px rgba(99,102,241,0.4)" }}
                        >
                            TS
                        </div>
                        {!collapsed && (
                            <span className="ml-3 text-base font-bold text-slate-900 whitespace-nowrap tracking-tight group-hover:text-indigo-600 transition-colors">
                                TrueSkill AI
                            </span>
                        )}
                    </Link>
                </div>

                {/* Nav items */}
                <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 flex flex-col gap-0.5">
                    {/* Primary links */}
                    {MAIN_LINKS.map(link => {
                        const Icon = link.icon;
                        const active = isActive(link.href, link.exact ?? false);
                        const hasData = link.statusKey ? statusMap[link.statusKey] : false;

                        return (
                            <div key={link.href} className="relative group">
                                <Link
                                    href={link.href}
                                    className={`flex items-center gap-3 px-2.5 py-2 rounded-xl transition-all duration-200 ${active
                                        ? "bg-indigo-50 text-indigo-700"
                                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                                        }`}
                                >
                                    <div className="relative flex-shrink-0">
                                        <Icon className="w-5 h-5" strokeWidth={active ? 2.2 : 1.7} />
                                        {hasData && (
                                            <span
                                                className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-white"
                                                style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
                                            />
                                        )}
                                    </div>

                                    {!collapsed && (
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                                <span className={`text-sm font-${active ? "semibold" : "medium"} truncate`}>
                                                    {link.label}
                                                </span>
                                                {hasData && (
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                                                )}
                                            </div>
                                            <p className="text-[10px] text-slate-400 truncate mt-0 leading-tight">
                                                {link.desc}
                                            </p>
                                        </div>
                                    )}

                                    {/* Active left bar */}
                                    {active && (
                                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-indigo-500" />
                                    )}
                                </Link>

                                {/* Collapsed tooltip */}
                                {collapsed && (
                                    <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-900 text-white text-xs rounded-lg whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-lg">
                                        {link.label}
                                        <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900" />
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Divider */}
                    <div className="my-2 border-t border-slate-100 mx-1" />

                    {/* Secondary links */}
                    {SECONDARY_LINKS.map(link => {
                        const Icon = link.icon;
                        const active = pathname.startsWith(link.href);
                        return (
                            <div key={link.href} className="relative group">
                                <Link
                                    href={link.href}
                                    className={`flex items-center gap-3 px-2.5 py-2 rounded-xl transition-all duration-200 ${active
                                        ? "bg-indigo-50 text-indigo-700"
                                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                        }`}
                                >
                                    <Icon className="w-5 h-5 flex-shrink-0" strokeWidth={1.7} />
                                    {!collapsed && (
                                        <span className="text-sm font-medium truncate">{link.label}</span>
                                    )}
                                    {active && (
                                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-indigo-500" />
                                    )}
                                </Link>
                                {collapsed && (
                                    <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-900 text-white text-xs rounded-lg whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-lg">
                                        {link.label}
                                        <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900" />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </nav>

                {/* Bottom: user badge + info button + collapse toggle */}
                <div className="border-t border-slate-100 p-3 flex flex-col gap-2">
                    {/* GitHub user badge */}
                    {githubUsername && !collapsed && (
                        <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-slate-50">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={`https://github.com/${githubUsername}.png?size=28`}
                                alt={githubUsername}
                                className="w-6 h-6 rounded-full ring-1 ring-slate-200 flex-shrink-0"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${githubUsername}&size=28&background=6366f1&color=fff`;
                                }}
                            />
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-slate-700 truncate">@{githubUsername}</p>
                                <p className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                                    <Sparkles className="w-2.5 h-2.5" /> GitHub connected
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Info + Collapse row */}
                    <div className="flex items-center gap-1.5">
                        {/* System info button */}
                        <div className="relative">
                            <button
                                onClick={toggleSysInfo}
                                title="View AI configuration"
                                className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors"
                            >
                                <Info className="w-3.5 h-3.5" />
                            </button>

                            {/* Popover */}
                            {showSysInfo && (
                                <div className="absolute bottom-10 left-0 z-50 w-72 bg-white border border-slate-200 rounded-2xl shadow-2xl p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                            <Cpu className="w-3.5 h-3.5 text-indigo-500" /> AI Configuration
                                        </p>
                                        <button onClick={() => setShowSysInfo(false)} className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-600">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    {loadingSysInfo ? (
                                        <p className="text-[11px] text-slate-400">Loading…</p>
                                    ) : sysInfo?.providers && sysInfo.providers.length > 0 ? (
                                        <div className="flex flex-col gap-0">
                                            {sysInfo.providers.map((p, i) => (
                                                <div key={i} className="flex items-start gap-2.5 py-2 border-t border-slate-50 first:border-0">
                                                    <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${i === 0 ? "bg-emerald-500" : "bg-slate-300"}`} />
                                                    <div>
                                                        <p className="text-[11px] font-semibold text-slate-700">{p.name}</p>
                                                        <p className="text-[10px] font-mono text-indigo-600">{p.model}</p>
                                                        <p className="text-[10px] text-slate-400">Key: {p.key_hint}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-[11px] text-slate-400">No providers configured.</p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Collapse toggle */}
                        <button
                            onClick={toggleCollapsed}
                            className="flex-1 flex items-center justify-center h-8 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors duration-200 group"
                            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        >
                            {collapsed
                                ? <ChevronRight className="w-4 h-4 group-hover:text-indigo-600 transition-colors" />
                                : <ChevronLeft className="w-4 h-4 group-hover:text-indigo-600 transition-colors" />
                            }
                            {!collapsed && <span className="ml-1.5 text-xs font-medium">Collapse</span>}
                        </button>
                    </div>
                </div>
            </aside>

            {/* ── Mobile Bottom Nav ─────────────────────────────────────────────── */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-t border-slate-200 px-2 py-1.5 flex items-center justify-around safe-area-inset-bottom">
                {/* Home link */}
                <Link href="/" className="relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-slate-400 hover:text-slate-700 transition-all">
                    <Home className="w-5 h-5" strokeWidth={1.7} />
                    <span className="text-[9px] font-medium">Home</span>
                </Link>
                {MAIN_LINKS.map(link => {
                    const Icon = link.icon;
                    const active = isActive(link.href, link.exact ?? false);
                    const hasData = link.statusKey ? statusMap[link.statusKey] : false;
                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${active ? "text-indigo-600" : "text-slate-500"}`}
                        >
                            <div className="relative">
                                <Icon className="w-5 h-5" strokeWidth={active ? 2.2 : 1.7} />
                                {hasData && (
                                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                )}
                            </div>
                            <span className={`text-[9px] font-${active ? "semibold" : "medium"} truncate`}>
                                {link.label.split(" ")[0]}
                            </span>
                            {active && (
                                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-indigo-500" />
                            )}
                        </Link>
                    );
                })}
                {SECONDARY_LINKS.map(link => {
                    const Icon = link.icon;
                    const active = pathname.startsWith(link.href);
                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${active ? "text-indigo-600" : "text-slate-500"}`}
                        >
                            <Icon className="w-5 h-5" strokeWidth={1.7} />
                            <span className="text-[9px] font-medium">{link.label.split(" ")[0]}</span>
                            {active && (
                                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-indigo-500" />
                            )}
                        </Link>
                    );
                })}
            </nav>
        </>
    );
}
