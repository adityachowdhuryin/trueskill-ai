"use client";

import { useState } from "react";
import { Package, Loader2, Copy, Check, Mail, Linkedin, FileText, Download } from "lucide-react";

interface ApplicationKit {
    cover_letter: string;
    linkedin_message: string;
    cold_email_subject: string;
    cold_email_body: string;
    company_name: string;
    role_title: string;
}

interface Props {
    candidateName: string;
    verifiedSkills: object[];
    jobDescription: string;
    gapSummary: string;
    companyName?: string;
    roleTitle?: string;
    hiringManagerName?: string;
    apiBase: string;
    onClose: () => void;
}

function CopyBtn({ text, label }: { text: string; label: string }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };
    return (
        <button onClick={copy} style={{
            padding: "5px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0",
            background: copied ? "#dcfce7" : "white", color: copied ? "#16a34a" : "#64748b",
            fontSize: 11, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 5, transition: "all 0.2s",
        }}>
            {copied ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> {label}</>}
        </button>
    );
}

const TABS = [
    { key: "cover",    label: "Cover Letter",  Icon: FileText  },
    { key: "linkedin", label: "LinkedIn",       Icon: Linkedin  },
    { key: "email",    label: "Cold Email",     Icon: Mail      },
] as const;

type TabKey = typeof TABS[number]["key"];

export default function ApplicationKit({
    candidateName, verifiedSkills, jobDescription, gapSummary,
    companyName = "", roleTitle = "", hiringManagerName = "", apiBase, onClose,
}: Props) {
    const [loading, setLoading] = useState(false);
    const [kit, setKit]         = useState<ApplicationKit | null>(null);
    const [error, setError]     = useState<string | null>(null);
    const [tab, setTab]         = useState<TabKey>("cover");
    const [editedKit, setEditedKit] = useState<ApplicationKit | null>(null);

    const activeKit = editedKit ?? kit;

    const generate = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${apiBase}/api/coach/application-kit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    candidate_name: candidateName,
                    verified_skills: verifiedSkills,
                    job_description: jobDescription,
                    gap_summary: gapSummary,
                    company_name: companyName,
                    role_title: roleTitle,
                    hiring_manager_name: hiringManagerName,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Generation failed");
            setKit(data);
            setEditedKit(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to generate application kit");
        } finally {
            setLoading(false);
        }
    };

    const downloadAll = () => {
        if (!activeKit) return;
        const content = `
COVER LETTER
============
${activeKit.cover_letter}

---

LINKEDIN CONNECTION MESSAGE
===========================
${activeKit.linkedin_message}

---

COLD EMAIL
==========
Subject: ${activeKit.cold_email_subject}

${activeKit.cold_email_body}
        `.trim();
        const blob = new Blob([content], { type: "text/plain" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `application_kit_${(activeKit.company_name || "company").replace(/\s+/g, "_")}.txt`;
        a.click();
    };

    return (
        <div style={{ background: "white", borderRadius: 16, border: "1px solid #e2e8f0", overflow: "hidden" }}>
            {/* Header */}
            <div style={{ background: "linear-gradient(135deg, #0f172a, #1e293b)", padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Package size={18} color="#a78bfa" />
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: "white" }}>One-Click Application Kit</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>Cover letter · LinkedIn message · Cold email · All grounded in your verified skills</div>
                    </div>
                </div>
                <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, color: "#94a3b8", padding: "4px 10px", cursor: "pointer", fontSize: 12 }}>✕</button>
            </div>

            <div style={{ padding: 24 }}>
                {!activeKit ? (
                    <>
                        <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6, marginBottom: 20 }}>
                            Generates a complete, personalized application package in one click.
                            Every claim in the cover letter and email is grounded in your <strong>verified code analysis scores</strong>.
                        </p>
                        {error && (
                            <div style={{ marginBottom: 16, padding: "10px 14px", background: "#fee2e2", borderRadius: 8, fontSize: 13, color: "#dc2626" }}>
                                {error}
                            </div>
                        )}
                        <button
                            onClick={generate}
                            disabled={loading || !jobDescription}
                            style={{
                                width: "100%", padding: 12, borderRadius: 12, border: "none",
                                background: loading ? "#a78bfa" : "linear-gradient(135deg, #7c3aed, #6366f1)",
                                color: "white", fontSize: 14, fontWeight: 700,
                                cursor: loading || !jobDescription ? "not-allowed" : "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                            }}
                        >
                            {loading ? (
                                <><Loader2 size={16} className="animate-spin" /> Generating Kit...</>
                            ) : (
                                <><Package size={16} /> Generate Application Kit</>
                            )}
                        </button>
                    </>
                ) : (
                    <>
                        {/* Company + role pills */}
                        {(activeKit.company_name || activeKit.role_title) && (
                            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                                {activeKit.role_title && (
                                    <span style={{ padding: "3px 10px", background: "#ede9fe", color: "#7c3aed", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                                        {activeKit.role_title}
                                    </span>
                                )}
                                {activeKit.company_name && (
                                    <span style={{ padding: "3px 10px", background: "#f1f5f9", color: "#374151", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                                        {activeKit.company_name}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Tabs */}
                        <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "#f1f5f9", borderRadius: 10, padding: 4 }}>
                            {TABS.map(({ key, label, Icon }) => (
                                <button key={key} onClick={() => setTab(key)}
                                    style={{
                                        flex: 1, padding: "7px 10px", borderRadius: 8, border: "none",
                                        background: tab === key ? "white" : "transparent",
                                        color: tab === key ? "#7c3aed" : "#64748b",
                                        fontSize: 12, fontWeight: 600, cursor: "pointer",
                                        boxShadow: tab === key ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                                        display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                                        transition: "all 0.2s",
                                    }}
                                >
                                    <Icon size={12} /> {label}
                                </button>
                            ))}
                        </div>

                        {/* Cover letter */}
                        {tab === "cover" && (
                            <div>
                                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                                    <CopyBtn text={activeKit.cover_letter} label="Copy Letter" />
                                </div>
                                <textarea
                                    value={activeKit.cover_letter}
                                    onChange={e => setEditedKit(prev => prev ? { ...prev, cover_letter: e.target.value } : null)}
                                    rows={12}
                                    style={{
                                        width: "100%", padding: 14, borderRadius: 10, border: "1.5px solid #e2e8f0",
                                        fontSize: 13, lineHeight: 1.7, resize: "vertical", fontFamily: "inherit",
                                        outline: "none", color: "#1e293b", boxSizing: "border-box",
                                    }}
                                />
                            </div>
                        )}

                        {/* LinkedIn */}
                        {tab === "linkedin" && (
                            <div>
                                <p style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                                    Connection request message — max 300 characters. Keep it specific and non-generic.
                                </p>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                    <span style={{ fontSize: 11, color: activeKit.linkedin_message.length > 280 ? "#dc2626" : "#94a3b8" }}>
                                        {activeKit.linkedin_message.length}/300 chars
                                    </span>
                                    <CopyBtn text={activeKit.linkedin_message} label="Copy Message" />
                                </div>
                                <textarea
                                    value={activeKit.linkedin_message}
                                    onChange={e => setEditedKit(prev => prev ? { ...prev, linkedin_message: e.target.value.slice(0, 300) } : null)}
                                    rows={4}
                                    maxLength={300}
                                    style={{
                                        width: "100%", padding: 14, borderRadius: 10, border: "1.5px solid #e2e8f0",
                                        fontSize: 13, lineHeight: 1.7, resize: "none", fontFamily: "inherit",
                                        outline: "none", color: "#1e293b", boxSizing: "border-box",
                                    }}
                                />
                            </div>
                        )}

                        {/* Cold email */}
                        {tab === "email" && (
                            <div>
                                <div style={{ marginBottom: 12 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 6 }}>Subject Line</div>
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <input
                                            value={activeKit.cold_email_subject}
                                            onChange={e => setEditedKit(prev => prev ? { ...prev, cold_email_subject: e.target.value } : null)}
                                            style={{
                                                flex: 1, padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0",
                                                fontSize: 13, outline: "none", color: "#1e293b",
                                            }}
                                        />
                                        <CopyBtn text={activeKit.cold_email_subject} label="Copy" />
                                    </div>
                                </div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 6 }}>Body</div>
                                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
                                    <CopyBtn text={`Subject: ${activeKit.cold_email_subject}\n\n${activeKit.cold_email_body}`} label="Copy Full Email" />
                                </div>
                                <textarea
                                    value={activeKit.cold_email_body}
                                    onChange={e => setEditedKit(prev => prev ? { ...prev, cold_email_body: e.target.value } : null)}
                                    rows={8}
                                    style={{
                                        width: "100%", padding: 14, borderRadius: 10, border: "1.5px solid #e2e8f0",
                                        fontSize: 13, lineHeight: 1.7, resize: "vertical", fontFamily: "inherit",
                                        outline: "none", color: "#1e293b", boxSizing: "border-box",
                                    }}
                                />
                            </div>
                        )}

                        {/* Actions row */}
                        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                            <button onClick={downloadAll} style={{
                                flex: 1, padding: "9px 14px", borderRadius: 10, border: "1.5px solid #e2e8f0",
                                background: "white", color: "#374151", fontSize: 12, fontWeight: 600,
                                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                            }}>
                                <Download size={13} /> Download All (.txt)
                            </button>
                            <button onClick={() => { setKit(null); setEditedKit(null); }} style={{
                                flex: 1, padding: "9px 14px", borderRadius: 10, border: "none",
                                background: "linear-gradient(135deg, #7c3aed, #6366f1)",
                                color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer",
                            }}>
                                Regenerate
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
