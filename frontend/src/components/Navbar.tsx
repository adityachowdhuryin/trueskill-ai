"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
    { href: "/", label: "Home" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/compare", label: "Compare" },
];

export default function Navbar() {
    const [scrolled, setScrolled] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const pathname = usePathname();

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 60);
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    // Close mobile menu on route change
    useEffect(() => { setMenuOpen(false); }, [pathname]);

    const isDark = pathname === "/";

    return (
        <nav
            aria-label="Main navigation"
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
                scrolled
                    ? isDark
                        ? "py-3 shadow-lg border-b border-white/6"
                        : "py-3 shadow-md border-b border-slate-200/60"
                    : "py-5"
            } ${
                scrolled
                    ? isDark
                        ? "bg-slate-950/80 backdrop-blur-xl"
                        : "bg-white/80 backdrop-blur-xl"
                    : "bg-transparent"
            }`}
        >
            <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-3 group" aria-label="TrueSkill AI home">
                    <div
                        className="w-9 h-9 bg-gradient-to-br from-blue-500 to-violet-600 rounded-xl flex items-center justify-center font-black text-sm text-white shadow-lg transition-all duration-300 group-hover:scale-110"
                        style={{ boxShadow: "0 0 20px rgba(99,102,241,0.45)" }}
                    >
                        TS
                    </div>
                    <span className={`text-xl font-bold tracking-tight transition-colors duration-300 ${
                        isDark ? "text-white" : "text-slate-900"
                    }`}>
                        TrueSkill AI
                    </span>
                </Link>

                {/* Desktop nav links */}
                <div className="hidden sm:flex items-center gap-1">
                    {NAV_LINKS.map((link) => {
                        const active = pathname === link.href;
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`relative px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                                    active
                                        ? isDark
                                            ? "text-white bg-white/10"
                                            : "text-indigo-700 bg-indigo-50"
                                        : isDark
                                        ? "text-slate-400 hover:text-white hover:bg-white/8"
                                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                                }`}
                            >
                                {link.label}
                                {active && (
                                    <span
                                        className="absolute bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-indigo-500"
                                        style={{ animation: "fade-in 0.2s ease both" }}
                                    />
                                )}
                            </Link>
                        );
                    })}

                    <Link
                        href="/dashboard"
                        className="ml-3 group relative px-5 py-2 rounded-xl text-sm font-semibold text-white overflow-hidden transition-all duration-300 hover:scale-105"
                        style={{
                            background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
                            boxShadow: "0 4px 18px rgba(99,102,241,0.35)",
                        }}
                    >
                        <span className="relative z-10">Open App →</span>
                        <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors duration-300" />
                    </Link>
                </div>

                {/* Hamburger (mobile) */}
                <button
                    className={`sm:hidden flex flex-col items-center justify-center w-9 h-9 gap-1.5 rounded-lg transition-colors ${
                        isDark ? "hover:bg-white/10" : "hover:bg-slate-100"
                    }`}
                    onClick={() => setMenuOpen((o) => !o)}
                    aria-label="Toggle menu"
                    aria-expanded={menuOpen}
                >
                    <span
                        className={`block w-5 h-0.5 rounded-full transition-all duration-300 ${
                            menuOpen
                                ? "rotate-45 translate-y-2 bg-indigo-500"
                                : isDark
                                ? "bg-white"
                                : "bg-slate-700"
                        }`}
                    />
                    <span
                        className={`block w-5 h-0.5 rounded-full transition-all duration-300 ${
                            menuOpen ? "opacity-0" : isDark ? "bg-white" : "bg-slate-700"
                        }`}
                    />
                    <span
                        className={`block w-5 h-0.5 rounded-full transition-all duration-300 ${
                            menuOpen
                                ? "-rotate-45 -translate-y-2 bg-indigo-500"
                                : isDark
                                ? "bg-white"
                                : "bg-slate-700"
                        }`}
                    />
                </button>
            </div>

            {/* Mobile drawer */}
            <div
                className={`sm:hidden overflow-hidden transition-all duration-300 ${
                    menuOpen ? "max-h-60 opacity-100" : "max-h-0 opacity-0"
                } ${isDark ? "bg-slate-950/95 backdrop-blur-xl" : "bg-white/95 backdrop-blur-xl"}`}
            >
                <div className="max-w-7xl mx-auto px-6 py-3 flex flex-col gap-1">
                    {NAV_LINKS.map((link) => {
                        const active = pathname === link.href;
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                                    active
                                        ? "bg-indigo-600 text-white"
                                        : isDark
                                        ? "text-slate-300 hover:bg-white/10 hover:text-white"
                                        : "text-slate-700 hover:bg-slate-100"
                                }`}
                            >
                                {link.label}
                            </Link>
                        );
                    })}
                </div>
            </div>
        </nav>
    );
}
