"use client";

import { useState, useEffect, useRef } from "react";
import { Lock, Unlock, Eye, EyeOff, Shield } from "lucide-react";

const STORAGE_KEY = "ts_auth_unlocked";

export default function PasswordGate({ children }: { children: React.ReactNode }) {
    const [unlocked, setUnlocked] = useState<boolean | null>(null);
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState(false);
    const [shake, setShake] = useState(false);
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const saved = sessionStorage.getItem(STORAGE_KEY);
        setUnlocked(saved === "true");
    }, []);

    useEffect(() => {
        if (unlocked === false) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [unlocked]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password || loading) return;
        setLoading(true);
        setError(false);

        try {
            const res = await fetch("/api/auth/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password }),
            });

            if (res.ok) {
                const data = await res.json();
                if (data.ok) {
                    setSuccess(true);
                    sessionStorage.setItem(STORAGE_KEY, "true");
                    setTimeout(() => setUnlocked(true), 600);
                    return;
                }
            }

            // Wrong password (401) or any other non-ok response
            setError(true);
            setShake(true);
            setPassword("");
            setTimeout(() => setShake(false), 500);
            setTimeout(() => setError(false), 3000);
            inputRef.current?.focus();
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    if (unlocked === null) {
        return (
            <div className="min-h-screen flex items-center justify-center"
                style={{ background: "linear-gradient(135deg,#0f0c29,#302b63,#24243e)" }}>
                <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            </div>
        );
    }

    if (unlocked) return <>{children}</>;

    return (
        <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
            style={{ background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)" }}>

            {/* Animated background blobs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full opacity-20"
                    style={{ background: "radial-gradient(circle, #6366f1, transparent)", animation: "pulse 4s ease-in-out infinite" }} />
                <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full opacity-20"
                    style={{ background: "radial-gradient(circle, #7c3aed, transparent)", animation: "pulse 4s ease-in-out infinite 2s" }} />
            </div>

            {/* Card */}
            <div
                className={`relative z-10 w-full max-w-sm mx-4 ${shake ? "ts-shake" : ""}`}
                style={{
                    background: "rgba(255,255,255,0.05)",
                    backdropFilter: "blur(24px)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "24px",
                    padding: "40px 36px",
                    boxShadow: "0 32px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
                    transition: "all 0.15s",
                }}
            >
                {/* Icon */}
                <div className="flex justify-center mb-6">
                    <div className="relative">
                        <div className="absolute inset-0 rounded-full blur-xl opacity-60"
                            style={{ background: success ? "linear-gradient(135deg,#10b981,#059669)" : "linear-gradient(135deg,#6366f1,#7c3aed)" }} />
                        <div className="relative w-16 h-16 rounded-2xl flex items-center justify-center"
                            style={{
                                background: success ? "linear-gradient(135deg,#10b981,#059669)" : "linear-gradient(135deg,#6366f1,#7c3aed)",
                                boxShadow: success ? "0 8px 32px rgba(16,185,129,0.4)" : "0 8px 32px rgba(99,102,241,0.4)",
                                transition: "all 0.5s",
                            }}>
                            {success ? <Unlock className="w-7 h-7 text-white" /> : <Lock className="w-7 h-7 text-white" />}
                        </div>
                    </div>
                </div>

                {/* Title */}
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-black text-white tracking-tight mb-1">TrueSkill AI</h1>
                    <div className="flex items-center justify-center gap-1.5 text-indigo-300">
                        <Shield className="w-3 h-3" />
                        <p className="text-xs font-medium">Protected Access</p>
                    </div>
                    <p className="text-sm text-slate-400 mt-3 leading-relaxed">Enter the access password to continue</p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="relative">
                        <input
                            ref={inputRef}
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={e => { setPassword(e.target.value); setError(false); }}
                            placeholder="Enter password…"
                            autoComplete="current-password"
                            className="w-full px-4 py-3 pr-11 rounded-xl text-sm font-medium text-white placeholder-slate-500 outline-none"
                            style={{
                                background: "rgba(255,255,255,0.07)",
                                border: error ? "1.5px solid rgba(239,68,68,0.7)" : success ? "1.5px solid rgba(16,185,129,0.7)" : "1.5px solid rgba(255,255,255,0.12)",
                                boxShadow: error ? "0 0 0 3px rgba(239,68,68,0.15)" : success ? "0 0 0 3px rgba(16,185,129,0.15)" : "none",
                                transition: "all 0.2s",
                            }}
                        />
                        <button type="button" onClick={() => setShowPassword(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors" tabIndex={-1}>
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>

                    {error && (
                        <p className="text-xs text-red-400 font-medium text-center -mt-1" style={{ animation: "tsFadeIn 0.2s ease-out" }}>
                            Incorrect password. Please try again.
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={!password || success || loading}
                        className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        style={{
                            background: success ? "linear-gradient(135deg,#10b981,#059669)" : "linear-gradient(135deg,#6366f1,#7c3aed)",
                            boxShadow: success ? "0 4px 20px rgba(16,185,129,0.35)" : "0 4px 20px rgba(99,102,241,0.35)",
                            transition: "all 0.3s",
                        }}
                    >
                        {loading && (
                            <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        )}
                        {success ? "✓ Unlocked!" : loading ? "Verifying…" : "Unlock Access"}
                    </button>
                </form>

                <p className="text-center text-[11px] text-slate-600 mt-6">
                    TrueSkill AI — Automated Competency Verification
                </p>
            </div>

            <style>{`
                @keyframes tsShake {
                    0%,100%{transform:translateX(0)}
                    20%{transform:translateX(-8px)}
                    40%{transform:translateX(8px)}
                    60%{transform:translateX(-6px)}
                    80%{transform:translateX(6px)}
                }
                .ts-shake { animation: tsShake 0.5s ease-in-out; }
                @keyframes tsFadeIn {
                    from{opacity:0;transform:translateY(-4px)}
                    to{opacity:1;transform:translateY(0)}
                }
            `}</style>
        </div>
    );
}
