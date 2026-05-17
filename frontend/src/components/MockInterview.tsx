"use client";

import { useState } from "react";
import { Mic, Send, CheckCircle2, AlertCircle, Loader2, ChevronRight, RotateCcw, Trophy } from "lucide-react";

interface InterviewQuestion {
    index: number;
    question: string;
    type: string;
    skill_tags: string[];
    difficulty: string;
    expected_answer_hint: string;
}

interface AnswerFeedback {
    question_index: number;
    score: number;
    verdict: string;
    strengths: string[];
    improvements: string[];
    code_evidence_reference: string;
    model_answer_excerpt: string;
}

interface Props {
    verifiedSkills: object[];
    jobDescription: string;
    gapSummary: string;
    apiBase: string;
    onClose: () => void;
}

const TYPE_COLORS: Record<string, string> = {
    technical:     "#6366f1",
    behavioral:    "#10b981",
    system_design: "#f59e0b",
    situational:   "#ec4899",
};

const DIFFICULTY_COLORS: Record<string, string> = {
    Easy:   "#22c55e",
    Medium: "#f59e0b",
    Hard:   "#ef4444",
};

const VERDICT_STYLES: Record<string, { bg: string; color: string }> = {
    Strong:      { bg: "#dcfce7", color: "#16a34a" },
    Good:        { bg: "#dbeafe", color: "#1d4ed8" },
    "Needs Work":{ bg: "#fef3c7", color: "#d97706" },
    Weak:        { bg: "#fee2e2", color: "#dc2626" },
};

function ScoreRing({ score }: { score: number }) {
    const r = 20;
    const circ = 2 * Math.PI * r;
    const dash = (score / 10) * circ;
    const color = score >= 8 ? "#22c55e" : score >= 6 ? "#3b82f6" : score >= 4 ? "#f59e0b" : "#ef4444";
    return (
        <svg width={52} height={52} style={{ transform: "rotate(-90deg)" }}>
            <circle cx={26} cy={26} r={r} fill="none" stroke="#e2e8f0" strokeWidth={5} />
            <circle cx={26} cy={26} r={r} fill="none" stroke={color} strokeWidth={5}
                strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                style={{ transition: "stroke-dasharray 0.8s ease" }} />
            <text x={26} y={26} textAnchor="middle" dominantBaseline="middle"
                style={{ transform: "rotate(90deg)", transformOrigin: "26px 26px", fontSize: 13, fontWeight: 800, fill: color }}>
                {score}/10
            </text>
        </svg>
    );
}

export default function MockInterview({ verifiedSkills, jobDescription, gapSummary, apiBase, onClose }: Props) {
    const [phase, setPhase]             = useState<"start" | "loading" | "interview" | "report">("start");
    const [questions, setQuestions]     = useState<InterviewQuestion[]>([]);
    const [currentIdx, setCurrentIdx]   = useState(0);
    const [answer, setAnswer]           = useState("");
    const [grading, setGrading]         = useState(false);
    const [feedbacks, setFeedbacks]     = useState<AnswerFeedback[]>([]);
    const [error, setError]             = useState<string | null>(null);
    const [numQ, setNumQ]               = useState(6);
    const [showHint, setShowHint]       = useState(false);

    const startInterview = async () => {
        setPhase("loading");
        setError(null);
        try {
            const res = await fetch(`${apiBase}/api/coach/mock-interview/questions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    verified_skills: verifiedSkills,
                    job_description: jobDescription,
                    gap_summary: gapSummary,
                    num_questions: numQ,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Failed to generate questions");
            setQuestions(data.questions || []);
            setCurrentIdx(0);
            setFeedbacks([]);
            setAnswer("");
            setPhase("interview");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to start interview");
            setPhase("start");
        }
    };

    const submitAnswer = async () => {
        if (!answer.trim() || grading) return;
        setGrading(true);
        setShowHint(false);
        try {
            const res = await fetch(`${apiBase}/api/coach/mock-interview/grade`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    question: questions[currentIdx],
                    answer,
                    verified_skills: verifiedSkills,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Grading failed");
            const newFeedbacks = [...feedbacks, data as AnswerFeedback];
            setFeedbacks(newFeedbacks);
            setAnswer("");

            if (currentIdx + 1 >= questions.length) {
                setPhase("report");
            } else {
                setCurrentIdx(currentIdx + 1);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Grading failed");
        } finally {
            setGrading(false);
        }
    };

    const avgScore = feedbacks.length
        ? Math.round(feedbacks.reduce((s, f) => s + f.score, 0) / feedbacks.length * 10)
        : 0;

    // ── Start Screen ─────────────────────────────────────────────────────────
    if (phase === "start" || phase === "loading") {
        return (
            <div style={{ background: "white", borderRadius: 16, border: "1px solid #e2e8f0", overflow: "hidden" }}>
                {/* Header */}
                <div style={{ background: "linear-gradient(135deg, #7c3aed, #6366f1)", padding: "20px 24px", color: "white" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <Mic size={20} />
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 16 }}>AI Mock Interview</div>
                                <div style={{ fontSize: 12, opacity: 0.85 }}>Calibrated to your verified skills + this JD</div>
                            </div>
                        </div>
                        <button onClick={onClose} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8, color: "white", padding: "4px 10px", cursor: "pointer", fontSize: 12 }}>✕ Close</button>
                    </div>
                </div>
                <div style={{ padding: 24 }}>
                    <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20, lineHeight: 1.6 }}>
                        Questions are tailored to your <strong>verified skill scores</strong> and the target role.
                        Strong skills get depth questions; gap areas get probing questions. Grade is shown after each answer.
                    </p>

                    {/* Num questions picker */}
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>Number of questions</div>
                        <div style={{ display: "flex", gap: 8 }}>
                            {[3, 4, 5, 6, 8].map(n => (
                                <button key={n} onClick={() => setNumQ(n)}
                                    style={{
                                        width: 36, height: 36, borderRadius: 8, border: "none",
                                        background: numQ === n ? "#7c3aed" : "#f1f5f9",
                                        color: numQ === n ? "white" : "#374151",
                                        fontWeight: 700, fontSize: 13, cursor: "pointer",
                                        transition: "all 0.15s",
                                    }}>{n}</button>
                            ))}
                        </div>
                    </div>

                    {error && (
                        <div style={{ marginBottom: 16, padding: "10px 14px", background: "#fee2e2", borderRadius: 8, fontSize: 13, color: "#dc2626", display: "flex", gap: 6 }}>
                            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
                        </div>
                    )}

                    <button
                        onClick={startInterview}
                        disabled={phase === "loading" || !jobDescription}
                        style={{
                            width: "100%", padding: "12px", borderRadius: 12, border: "none",
                            background: "linear-gradient(135deg, #7c3aed, #6366f1)",
                            color: "white", fontSize: 14, fontWeight: 700,
                            cursor: phase === "loading" || !jobDescription ? "not-allowed" : "pointer",
                            opacity: !jobDescription ? 0.5 : 1,
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        }}
                    >
                        {phase === "loading" ? (
                            <><Loader2 size={16} className="animate-spin" /> Generating Questions...</>
                        ) : (
                            <><Mic size={16} /> Start {numQ}-Question Interview</>
                        )}
                    </button>
                    {!jobDescription && (
                        <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 8, textAlign: "center" }}>
                            Add a job description first to start the interview.
                        </p>
                    )}
                </div>
            </div>
        );
    }

    // ── Interview Phase ───────────────────────────────────────────────────────
    if (phase === "interview") {
        const q = questions[currentIdx];
        const prevFeedback = feedbacks[currentIdx - 1];
        const typeColor = TYPE_COLORS[q?.type] || "#64748b";
        const diffColor = DIFFICULTY_COLORS[q?.difficulty] || "#64748b";

        return (
            <div style={{ background: "white", borderRadius: 16, border: "1px solid #e2e8f0", overflow: "hidden" }}>
                {/* Progress bar */}
                <div style={{ height: 4, background: "#f1f5f9" }}>
                    <div style={{
                        height: "100%", background: "linear-gradient(90deg, #7c3aed, #6366f1)",
                        width: `${((currentIdx) / questions.length) * 100}%`,
                        transition: "width 0.5s ease",
                    }} />
                </div>

                {/* Header */}
                <div style={{ padding: "16px 24px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Mic size={16} color="#7c3aed" />
                        <span style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>Mock Interview</span>
                        <span style={{ fontSize: 12, color: "#94a3b8" }}>Question {currentIdx + 1} of {questions.length}</span>
                    </div>
                    <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 12 }}>✕</button>
                </div>

                <div style={{ padding: 24 }}>
                    {/* Previous answer feedback (compact) */}
                    {prevFeedback && (
                        <div style={{
                            marginBottom: 16, padding: "10px 14px", borderRadius: 10,
                            background: (VERDICT_STYLES[prevFeedback.verdict] ?? { bg: "#f1f5f9" }).bg,
                            border: `1px solid ${(VERDICT_STYLES[prevFeedback.verdict] ?? { color: "#94a3b8" }).color}33`,
                        }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: (VERDICT_STYLES[prevFeedback.verdict] ?? { color: "#1e293b" }).color }}>
                                Previous answer: {prevFeedback.verdict} ({prevFeedback.score}/10)
                            </div>
                            {prevFeedback.improvements[0] && (
                                <div style={{ fontSize: 12, color: "#475569", marginTop: 3 }}>
                                    💡 {prevFeedback.improvements[0]}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Question card */}
                    <div style={{ background: "#fafafa", borderRadius: 12, padding: 20, marginBottom: 20, border: "1px solid #e2e8f0" }}>
                        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                            <span style={{ padding: "2px 10px", borderRadius: 20, background: `${typeColor}18`, color: typeColor, fontSize: 11, fontWeight: 700, textTransform: "capitalize" }}>
                                {q?.type?.replace("_", " ")}
                            </span>
                            <span style={{ padding: "2px 10px", borderRadius: 20, background: `${diffColor}18`, color: diffColor, fontSize: 11, fontWeight: 700 }}>
                                {q?.difficulty}
                            </span>
                            {q?.skill_tags?.slice(0, 3).map(tag => (
                                <span key={tag} style={{ padding: "2px 10px", borderRadius: 20, background: "#ede9fe", color: "#7c3aed", fontSize: 11 }}>{tag}</span>
                            ))}
                        </div>
                        <p style={{ fontSize: 15, fontWeight: 600, color: "#1e293b", lineHeight: 1.6, margin: 0 }}>
                            {q?.question}
                        </p>
                        {showHint && q?.expected_answer_hint && (
                            <div style={{ marginTop: 12, padding: "8px 12px", background: "#ede9fe", borderRadius: 8, fontSize: 12, color: "#5b21b6" }}>
                                💡 Hint: {q.expected_answer_hint}
                            </div>
                        )}
                    </div>

                    {/* Answer textarea */}
                    <textarea
                        value={answer}
                        onChange={e => setAnswer(e.target.value)}
                        disabled={grading}
                        placeholder="Type your answer here. Be specific — reference your actual experience and code..."
                        rows={6}
                        style={{
                            width: "100%", padding: "12px", borderRadius: 10, border: "1.5px solid #e2e8f0",
                            fontSize: 13, lineHeight: 1.6, resize: "none", outline: "none",
                            fontFamily: "inherit", background: grading ? "#f8fafc" : "white",
                            boxSizing: "border-box",
                        }}
                    />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                        <div style={{ display: "flex", gap: 8 }}>
                            <span style={{ fontSize: 11, color: "#94a3b8" }}>
                                {answer.split(/\s+/).filter(Boolean).length} words
                            </span>
                            <button
                                onClick={() => setShowHint(!showHint)}
                                style={{ fontSize: 11, color: "#7c3aed", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                            >
                                {showHint ? "Hide hint" : "Show hint"}
                            </button>
                        </div>
                        <button
                            onClick={submitAnswer}
                            disabled={!answer.trim() || grading}
                            style={{
                                padding: "9px 20px", borderRadius: 10, border: "none",
                                background: "linear-gradient(135deg, #7c3aed, #6366f1)",
                                color: "white", fontSize: 13, fontWeight: 700,
                                cursor: !answer.trim() || grading ? "not-allowed" : "pointer",
                                opacity: !answer.trim() ? 0.5 : 1,
                                display: "flex", alignItems: "center", gap: 6,
                            }}
                        >
                            {grading ? (
                                <><Loader2 size={14} className="animate-spin" /> Grading...</>
                            ) : currentIdx + 1 >= questions.length ? (
                                <><CheckCircle2 size={14} /> Submit & Finish</>
                            ) : (
                                <><Send size={14} /> Submit Answer</>
                            )}
                        </button>
                    </div>
                    {error && <p style={{ fontSize: 12, color: "#dc2626", marginTop: 8 }}>{error}</p>}
                </div>
            </div>
        );
    }

    // ── Report Phase ──────────────────────────────────────────────────────────
    return (
        <div style={{ background: "white", borderRadius: 16, border: "1px solid #e2e8f0", overflow: "hidden" }}>
            {/* Report header */}
            <div style={{ background: "linear-gradient(135deg, #7c3aed, #6366f1)", padding: "20px 24px", color: "white" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Trophy size={22} />
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>Interview Complete!</div>
                        <div style={{ fontSize: 12, opacity: 0.85 }}>
                            Average score: {avgScore / 10}/10 across {feedbacks.length} questions
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ padding: 24, maxHeight: 600, overflowY: "auto" }}>
                {feedbacks.map((fb, i) => {
                    const q = questions[i];
                    const vs = VERDICT_STYLES[fb.verdict] ?? { bg: "#f1f5f9", color: "#1e293b" };
                    return (
                        <div key={i} style={{ marginBottom: 20, border: "1px solid #f1f5f9", borderRadius: 12, overflow: "hidden" }}>
                            <div style={{ padding: "12px 16px", background: vs.bg, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: vs.color }}>
                                    Q{i + 1}: {q?.question?.slice(0, 70)}{q?.question?.length > 70 ? "..." : ""}
                                </div>
                                <ScoreRing score={fb.score} />
                            </div>
                            <div style={{ padding: "12px 16px" }}>
                                <div style={{ marginBottom: 8 }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Strengths</span>
                                    {fb.strengths.map((s, si) => (
                                        <div key={si} style={{ fontSize: 12, color: "#16a34a", display: "flex", gap: 6, marginTop: 3 }}>
                                            <span>✓</span><span>{s}</span>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ marginBottom: 8 }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>To Improve</span>
                                    {fb.improvements.map((imp, ii) => (
                                        <div key={ii} style={{ fontSize: 12, color: "#dc2626", display: "flex", gap: 6, marginTop: 3 }}>
                                            <span>→</span><span>{imp}</span>
                                        </div>
                                    ))}
                                </div>
                                {fb.code_evidence_reference && (
                                    <div style={{ padding: "6px 10px", background: "#ede9fe", borderRadius: 8, fontSize: 11, color: "#5b21b6" }}>
                                        📊 {fb.code_evidence_reference}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                    <button
                        onClick={() => { setPhase("start"); setFeedbacks([]); setCurrentIdx(0); setAnswer(""); }}
                        style={{
                            flex: 1, padding: "10px", borderRadius: 10, border: "1.5px solid #e2e8f0",
                            background: "white", color: "#374151", fontSize: 13, fontWeight: 600,
                            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        }}
                    >
                        <RotateCcw size={14} /> Try Again
                    </button>
                    <button
                        onClick={onClose}
                        style={{
                            flex: 1, padding: "10px", borderRadius: 10, border: "none",
                            background: "linear-gradient(135deg, #7c3aed, #6366f1)",
                            color: "white", fontSize: 13, fontWeight: 600,
                            cursor: "pointer",
                        }}
                    >
                        Done <ChevronRight size={14} style={{ display: "inline" }} />
                    </button>
                </div>
            </div>
        </div>
    );
}
