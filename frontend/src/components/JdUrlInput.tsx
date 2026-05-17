"use client";

import { useState, useRef } from "react";
import { Link2, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";

interface JdUrlInputProps {
    onFetched: (text: string, sourceSite: string, wordCount: number) => void;
    apiBase: string;
    disabled?: boolean;
}

const SITE_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
    greenhouse: { label: "Greenhouse", color: "#22c55e", emoji: "🌿" },
    lever:      { label: "Lever",      color: "#6366f1", emoji: "⚡" },
    indeed:     { label: "Indeed",     color: "#2563eb", emoji: "🔵" },
    ashby:      { label: "Ashby",      color: "#7c3aed", emoji: "✦" },
    workday:    { label: "Workday",    color: "#0ea5e9", emoji: "💼" },
    linkedin:   { label: "LinkedIn",   color: "#0077b5", emoji: "💼" },
    generic:    { label: "Job Board",  color: "#64748b", emoji: "🔗" },
};

export default function JdUrlInput({ onFetched, apiBase, disabled }: JdUrlInputProps) {
    const [url, setUrl]           = useState("");
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState<string | null>(null);
    const [success, setSuccess]   = useState<{ site: string; words: number } | null>(null);
    const inputRef                = useRef<HTMLInputElement>(null);

    const handleFetch = async () => {
        if (!url.trim() || loading) return;
        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await fetch(`${apiBase}/api/coach/fetch-jd`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: url.trim() }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.detail || "Failed to fetch job description.");
                return;
            }
            setSuccess({ site: data.source_site, words: data.word_count });
            onFetched(data.text, data.source_site, data.word_count);
        } catch {
            setError("Network error. Please check your connection and try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") handleFetch();
    };

    const clear = () => {
        setUrl("");
        setError(null);
        setSuccess(null);
        inputRef.current?.focus();
    };

    const siteInfo = success ? (SITE_LABELS[success.site] ?? SITE_LABELS.generic) : null;

    return (
        <div style={{ marginBottom: 12 }}>
            {/* Label */}
            <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <Link2 size={13} />
                Import from URL
                <span style={{ fontSize: 11, fontWeight: 400, color: "#94a3b8" }}>
                    — Greenhouse, Lever, Indeed, Ashby, Workday
                </span>
            </div>

            {/* Input row */}
            <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1, position: "relative" }}>
                    <input
                        ref={inputRef}
                        type="url"
                        placeholder="https://boards.greenhouse.io/... or jobs.lever.co/..."
                        value={url}
                        onChange={e => { setUrl(e.target.value); setError(null); setSuccess(null); }}
                        onKeyDown={handleKeyDown}
                        disabled={disabled || loading}
                        style={{
                            width: "100%",
                            padding: "9px 36px 9px 12px",
                            borderRadius: 10,
                            border: `1.5px solid ${error ? "#fca5a5" : success ? "#86efac" : "#e2e8f0"}`,
                            fontSize: 13,
                            outline: "none",
                            background: disabled ? "#f8fafc" : "white",
                            color: "#1e293b",
                            transition: "border-color 0.2s",
                            boxSizing: "border-box",
                        }}
                    />
                    {url && (
                        <button
                            onClick={clear}
                            style={{
                                position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                                background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 2,
                            }}
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                <button
                    onClick={handleFetch}
                    disabled={!url.trim() || loading || disabled}
                    style={{
                        padding: "9px 18px",
                        borderRadius: 10,
                        border: "none",
                        background: loading ? "#a78bfa" : "linear-gradient(135deg, #7c3aed, #6366f1)",
                        color: "white",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: (!url.trim() || loading || disabled) ? "not-allowed" : "pointer",
                        opacity: (!url.trim() || disabled) ? 0.55 : 1,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        whiteSpace: "nowrap",
                        transition: "all 0.2s",
                        flexShrink: 0,
                    }}
                >
                    {loading ? (
                        <><Loader2 size={14} className="animate-spin" /> Fetching...</>
                    ) : (
                        <><Link2 size={14} /> Fetch JD</>
                    )}
                </button>
            </div>

            {/* Success badge */}
            {success && siteInfo && (
                <div style={{
                    display: "flex", alignItems: "center", gap: 6, marginTop: 7,
                    fontSize: 12, color: "#16a34a",
                }}>
                    <CheckCircle2 size={13} />
                    <span>
                        Fetched <strong>{success.words} words</strong> from{" "}
                        <span style={{ color: siteInfo.color, fontWeight: 700 }}>
                            {siteInfo.emoji} {siteInfo.label}
                        </span>
                        {" "}— JD loaded below.
                    </span>
                </div>
            )}

            {/* Error message */}
            {error && (
                <div style={{
                    display: "flex", alignItems: "flex-start", gap: 6, marginTop: 7,
                    fontSize: 12, color: "#dc2626", lineHeight: 1.5,
                }}>
                    <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>{error}</span>
                </div>
            )}
        </div>
    );
}
