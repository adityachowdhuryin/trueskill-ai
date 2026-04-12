"""
HTML Report Generator for TrueSkill AI.
Generates a premium self-contained, downloadable HTML report from analysis results.
"""

from datetime import datetime
from typing import Any


def generate_html_report(data: dict[str, Any]) -> str:
    """
    Generate a premium self-contained HTML report from analysis results.

    Expected data keys:
        candidate_name, repo_names, skills (list of {topic, score, status, evidence}),
        overall_score, forensics (optional), verification_results (optional — full objects),
        bridge_projects (optional), ats_report (optional), summary (optional)
    """
    candidate = data.get("candidate_name", "Unknown Candidate")
    repo_names = data.get("repo_names", [])
    skills = data.get("skills", [])
    overall_score = data.get("overall_score", 0)
    forensics = data.get("forensics") or {}
    verification_results = data.get("verification_results", [])
    bridge_projects = data.get("bridge_projects", [])
    ats_report = data.get("ats_report") or {}
    summary = data.get("summary") or {}
    generated_at = datetime.now().strftime("%B %d, %Y at %I:%M %p")

    # Merge skills from verification_results if skills list is empty
    if not skills and verification_results:
        skills = [
            {
                "topic": v.get("topic", ""),
                "score": v.get("score", 0),
                "status": v.get("status", "Unverified"),
                "evidence": v.get("reasoning", "—"),
                "complexity_analysis": v.get("complexity_analysis", ""),
            }
            for v in verification_results
        ]

    verified_count = sum(1 for s in skills if s.get("status") == "Verified")
    partial_count = sum(1 for s in skills if s.get("status") == "Partially Verified")
    unverified_count = sum(1 for s in skills if s.get("status") == "Unverified")

    # Determine score color
    def score_color(score: float) -> str:
        if score >= 75:
            return "#22c55e"
        if score >= 50:
            return "#f59e0b"
        return "#ef4444"

    def score_bg(score: float) -> str:
        if score >= 75:
            return "rgba(34,197,94,0.12)"
        if score >= 50:
            return "rgba(245,158,11,0.12)"
        return "rgba(239,68,68,0.12)"

    # Build skill cards
    skill_cards_html = ""
    for s in skills:
        topic = s.get("topic", "")
        score = s.get("score", 0)
        status = s.get("status", "Unverified")
        evidence = s.get("evidence", "—")
        complexity = s.get("complexity_analysis", "")

        status_color = "#22c55e" if status == "Verified" else "#f59e0b" if status == "Partially Verified" else "#ef4444"
        status_bg = "rgba(34,197,94,0.1)" if status == "Verified" else "rgba(245,158,11,0.1)" if status == "Partially Verified" else "rgba(239,68,68,0.1)"
        status_border = "rgba(34,197,94,0.25)" if status == "Verified" else "rgba(245,158,11,0.25)" if status == "Partially Verified" else "rgba(239,68,68,0.25)"
        sc = score_color(score)
        bar_width = min(int(score), 100)
        status_icon = "✅" if status == "Verified" else "⚠️" if status == "Partially Verified" else "❌"

        skill_cards_html += f"""
        <div class="skill-card">
            <div class="skill-header">
                <div class="skill-title">{topic}</div>
                <span class="status-badge" style="background:{status_bg};border:1px solid {status_border};color:{status_color}">
                    {status_icon} {status}
                </span>
            </div>
            <div class="score-bar-wrap">
                <div class="score-bar-track">
                    <div class="score-bar-fill" style="width:{bar_width}%;background:{sc}"></div>
                </div>
                <span class="score-label" style="color:{sc}">{score}%</span>
            </div>
            <p class="evidence-text"><strong>Evidence:</strong> {evidence or "No evidence provided."}</p>
            {"<p class='complexity-text'><strong>Complexity:</strong> " + complexity + "</p>" if complexity else ""}
        </div>"""

    # Forensics section
    forensics_html = ""
    if forensics:
        auth_score = forensics.get("authenticity_score", "N/A")
        consistency = forensics.get("consistency_score", "N/A")
        verdict = forensics.get("verdict", "N/A")
        files_analyzed = forensics.get("files_analyzed", 0)
        files_with_issues = forensics.get("files_with_issues", 0)
        warnings = forensics.get("warnings", [])
        verdict_color = "#22c55e" if verdict == "Authentic" else "#f59e0b" if "Suspicious" in str(verdict) else "#ef4444"

        warnings_html = ""
        if warnings:
            items = "".join(f"<li>{w}</li>" for w in warnings[:5])
            warnings_html = f"<ul class='warning-list'>{items}</ul>"

        forensics_html = f"""
        <div class="section">
            <div class="section-header">🔬 Code Authenticity Analysis</div>
            <div class="metric-row">
                <div class="metric-box">
                    <div class="metric-label">Authenticity Score</div>
                    <div class="metric-value" style="color:{score_color(auth_score if isinstance(auth_score, (int,float)) else 0)}">{auth_score}%</div>
                </div>
                <div class="metric-box">
                    <div class="metric-label">Consistency Score</div>
                    <div class="metric-value">{consistency}{'%' if isinstance(consistency, (int,float)) else ''}</div>
                </div>
                <div class="metric-box">
                    <div class="metric-label">Files Analyzed</div>
                    <div class="metric-value">{files_analyzed}</div>
                </div>
                <div class="metric-box">
                    <div class="metric-label">Files Flagged</div>
                    <div class="metric-value" style="color:{'#ef4444' if files_with_issues > 0 else '#22c55e'}">{files_with_issues}</div>
                </div>
                <div class="metric-box" style="flex:2">
                    <div class="metric-label">Verdict</div>
                    <div class="metric-value" style="color:{verdict_color}">{verdict}</div>
                </div>
            </div>
            {f'<div class="warning-box"><strong>⚠ Flags:</strong>{warnings_html}</div>' if warnings else ''}
        </div>"""

    # Bridge projects section
    bridge_html = ""
    if bridge_projects:
        proj_items = ""
        for p in bridge_projects[:3]:
            diff = p.get("difficulty", "")
            diff_color = "#22c55e" if diff == "Beginner" else "#f59e0b" if diff == "Intermediate" else "#ef4444"
            tech = ", ".join(p.get("tech_stack", []))
            gain = p.get("estimated_score_gain", 0)
            steps = p.get("steps", [])[:4]
            steps_html = "".join(f"<li>{s}</li>" for s in steps)

            proj_items += f"""
            <div class="proj-card">
                <div class="proj-header">
                    <div>
                        <span class="proj-badge">Bridge Project #{p.get("rank", 1)}</span>
                        {f'<span class="proj-gain">+{gain}% match boost</span>' if gain else ''}
                    </div>
                    <span class="proj-diff" style="color:{diff_color}">{diff}</span>
                </div>
                <div class="proj-title">{p.get("project_title", "")}</div>
                <p class="proj-desc">{p.get("description", "")}</p>
                <div class="proj-gap">Gap Addressed: <strong style="color:#818cf8">{p.get("gap_skill","")}</strong> · Est. Time: {p.get("estimated_time","")}</div>
                {f'<div class="proj-tech">Tech: {tech}</div>' if tech else ''}
                {f'<ul class="proj-steps">{steps_html}</ul>' if steps else ''}
            </div>"""

        bridge_html = f"""
        <div class="section">
            <div class="section-header">🚀 Career Coach — Bridge Projects</div>
            {proj_items}
        </div>"""

    # ATS report section
    ats_html = ""
    if ats_report:
        ats_score = ats_report.get("ats_score", 0)
        kw_score = ats_report.get("keyword_match_score", 0)
        fmt_score = ats_report.get("format_score", 0)
        strengths = ats_report.get("strengths", [])
        improvements = ats_report.get("improvements", [])
        rec = ats_report.get("overall_recommendation", "")

        str_items = "".join(f"<li>✅ {s}</li>" for s in strengths[:4])
        imp_items = "".join(f"<li>🔧 {i}</li>" for i in improvements[:4])

        ats_html = f"""
        <div class="section">
            <div class="section-header">📋 ATS Score Report</div>
            <div class="metric-row">
                <div class="metric-box">
                    <div class="metric-label">ATS Score</div>
                    <div class="metric-value" style="color:{score_color(ats_score)}">{ats_score}%</div>
                </div>
                <div class="metric-box">
                    <div class="metric-label">Keyword Match</div>
                    <div class="metric-value">{kw_score}%</div>
                </div>
                <div class="metric-box">
                    <div class="metric-label">Format Score</div>
                    <div class="metric-value">{fmt_score}%</div>
                </div>
            </div>
            {f'<p class="rec-text"><strong>Recommendation:</strong> {rec}</p>' if rec else ''}
            <div class="two-col">
                <div><strong style="color:#22c55e">Strengths</strong><ul class="plain-list">{str_items}</ul></div>
                <div><strong style="color:#f59e0b">Improvements</strong><ul class="plain-list">{imp_items}</ul></div>
            </div>
        </div>"""

    score_c = score_color(overall_score)
    score_ring_offset = 2 * 3.14159 * 54 * (1 - overall_score / 100)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TrueSkill AI Report — {candidate}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
    <style>
        *, *::before, *::after {{ margin:0; padding:0; box-sizing:border-box; }}
        body {{ font-family:'Inter',system-ui,sans-serif; background:#0f172a; color:#e2e8f0; line-height:1.6; }}
        .page {{ max-width:960px; margin:0 auto; padding:32px 24px 64px; }}

        /* Hero Header */
        .hero {{ background:linear-gradient(135deg,#312e81 0%,#4c1d95 50%,#1e1b4b 100%); border-radius:24px; padding:40px 48px; margin-bottom:32px; position:relative; overflow:hidden; }}
        .hero::before {{ content:''; position:absolute; top:-80px; right:-80px; width:300px; height:300px; background:rgba(139,92,246,0.2); border-radius:50%; }}
        .hero::after {{ content:''; position:absolute; bottom:-60px; left:-60px; width:200px; height:200px; background:rgba(99,102,241,0.15); border-radius:50%; }}
        .hero-inner {{ position:relative; z-index:1; display:flex; align-items:center; gap:32px; }}
        .hero-text {{ flex:1; }}
        .hero-badge {{ display:inline-flex; align-items:center; gap:8px; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); border-radius:100px; padding:4px 14px; font-size:11px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:rgba(255,255,255,0.8); margin-bottom:16px; }}
        .hero-title {{ font-size:32px; font-weight:900; color:#fff; margin-bottom:8px; line-height:1.2; }}
        .hero-sub {{ font-size:14px; color:rgba(255,255,255,0.65); }}
        .hero-meta {{ margin-top:12px; display:flex; flex-wrap:wrap; gap:16px; }}
        .hero-meta span {{ font-size:12px; color:rgba(255,255,255,0.6); background:rgba(255,255,255,0.08); border-radius:8px; padding:4px 10px; }}

        /* Score Ring */
        .score-ring-wrap {{ flex-shrink:0; text-align:center; }}
        .ring-label {{ font-size:11px; color:rgba(255,255,255,0.6); margin-top:8px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; }}

        /* Stats Row */
        .stats-row {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:16px; margin-bottom:32px; }}
        .stat-card {{ background:#1e293b; border:1px solid rgba(255,255,255,0.06); border-radius:16px; padding:20px 24px; transition:transform .2s; }}
        .stat-card:hover {{ transform:translateY(-2px); }}
        .stat-label {{ font-size:11px; font-weight:700; letter-spacing:0.8px; text-transform:uppercase; color:#64748b; margin-bottom:8px; }}
        .stat-value {{ font-size:36px; font-weight:900; line-height:1; }}
        .stat-sub {{ font-size:12px; color:#64748b; margin-top:4px; }}

        /* Section */
        .section {{ background:#1e293b; border:1px solid rgba(255,255,255,0.06); border-radius:20px; padding:32px; margin-bottom:24px; }}
        .section-header {{ font-size:17px; font-weight:800; color:#f1f5f9; margin-bottom:24px; display:flex; align-items:center; gap:8px; }}

        /* Skill Cards */
        .skill-card {{ background:#0f172a; border:1px solid rgba(255,255,255,0.06); border-radius:12px; padding:20px; margin-bottom:12px; transition:border-color .2s; }}
        .skill-card:last-child {{ margin-bottom:0; }}
        .skill-header {{ display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; gap:12px; }}
        .skill-title {{ font-weight:700; font-size:15px; color:#f1f5f9; }}
        .status-badge {{ font-size:10px; font-weight:700; letter-spacing:0.5px; text-transform:uppercase; padding:3px 10px; border-radius:100px; white-space:nowrap; flex-shrink:0; }}
        .score-bar-wrap {{ display:flex; align-items:center; gap:12px; margin-bottom:12px; }}
        .score-bar-track {{ flex:1; height:6px; background:rgba(255,255,255,0.08); border-radius:4px; overflow:hidden; }}
        .score-bar-fill {{ height:100%; border-radius:4px; transition:width .6s ease; }}
        .score-label {{ font-size:14px; font-weight:800; width:40px; text-align:right; flex-shrink:0; }}
        .evidence-text {{ font-size:12px; color:#94a3b8; line-height:1.7; }}
        .complexity-text {{ font-size:12px; color:#64748b; margin-top:6px; line-height:1.6; }}

        /* Metric row */
        .metric-row {{ display:flex; flex-wrap:wrap; gap:12px; margin-bottom:20px; }}
        .metric-box {{ background:#0f172a; border:1px solid rgba(255,255,255,0.06); border-radius:12px; padding:16px 20px; flex:1; min-width:120px; }}
        .metric-label {{ font-size:11px; color:#64748b; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px; }}
        .metric-value {{ font-size:26px; font-weight:900; color:#f1f5f9; }}

        /* Warning box */
        .warning-box {{ background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.2); border-radius:10px; padding:14px 18px; font-size:13px; color:#fca5a5; }}
        .warning-list {{ list-style:none; margin-top:6px; }}
        .warning-list li {{ padding:3px 0; }}

        /* Bridge projects */
        .proj-card {{ background:#0f172a; border:1px solid rgba(99,102,241,0.2); border-radius:12px; padding:20px; margin-bottom:12px; }}
        .proj-header {{ display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }}
        .proj-badge {{ font-size:10px; font-weight:700; background:rgba(139,92,246,0.15); color:#a78bfa; border:1px solid rgba(139,92,246,0.3); border-radius:100px; padding:3px 10px; text-transform:uppercase; letter-spacing:0.5px; }}
        .proj-gain {{ margin-left:8px; font-size:10px; font-weight:700; background:rgba(99,102,241,0.12); color:#818cf8; border:1px solid rgba(99,102,241,0.25); border-radius:100px; padding:3px 10px; }}
        .proj-diff {{ font-size:12px; font-weight:700; }}
        .proj-title {{ font-size:16px; font-weight:800; color:#f1f5f9; margin-bottom:8px; }}
        .proj-desc {{ font-size:13px; color:#94a3b8; margin-bottom:10px; line-height:1.6; }}
        .proj-gap {{ font-size:12px; color:#64748b; margin-bottom:8px; }}
        .proj-tech {{ font-size:12px; color:#818cf8; margin-bottom:8px; }}
        .proj-steps {{ font-size:12px; color:#94a3b8; list-style:none; }}
        .proj-steps li {{ padding:3px 0; }}
        .proj-steps li::before {{ content:"→ "; color:#818cf8; }}

        /* ATS */
        .rec-text {{ font-size:13px; color:#cbd5e1; margin-bottom:16px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:10px; padding:12px 16px; line-height:1.6; }}
        .two-col {{ display:grid; grid-template-columns:1fr 1fr; gap:20px; }}
        .plain-list {{ list-style:none; margin-top:8px; }}
        .plain-list li {{ font-size:12px; color:#94a3b8; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.04); }}

        /* Footer */
        .footer {{ text-align:center; margin-top:48px; padding-top:24px; border-top:1px solid rgba(255,255,255,0.06); }}
        .footer-logo {{ font-size:18px; font-weight:900; background:linear-gradient(90deg,#6366f1,#a78bfa,#34d399); -webkit-background-clip:text; -webkit-text-fill-color:transparent; margin-bottom:6px; }}
        .footer-sub {{ font-size:12px; color:#475569; }}

        @media print {{
            body {{ background:#fff; color:#1e293b; }}
            .hero {{ background:linear-gradient(135deg,#312e81,#4c1d95) !important; }}
            .section, .skill-card, .metric-box, .proj-card {{ background:#f8fafc !important; border-color:#e2e8f0 !important; }}
            .stat-card {{ background:#f8fafc !important; border-color:#e2e8f0 !important; }}
            .skill-title, .section-header, .hero-title, .stat-value, .metric-value, .proj-title {{ color:#1e293b !important; }}
            .evidence-text, .hero-sub {{ color:#475569 !important; }}
        }}
    </style>
</head>
<body>
<div class="page">

    <!-- Hero Header -->
    <div class="hero">
        <div class="hero-inner">
            <div class="hero-text">
                <div class="hero-badge">🎯 TrueSkill AI · Competency Report</div>
                <div class="hero-title">{candidate}</div>
                <div class="hero-sub">Automated Resume Verification Against Real Code</div>
                <div class="hero-meta">
                    <span>📁 Repos: {", ".join(repo_names) if repo_names else "N/A"}</span>
                    <span>🗓 {generated_at}</span>
                    <span>🔍 {len(skills)} skills analyzed</span>
                </div>
            </div>
            <!-- Score Ring -->
            <div class="score-ring-wrap">
                <svg width="128" height="128" viewBox="0 0 128 128">
                    <circle cx="64" cy="64" r="54" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="10"/>
                    <circle cx="64" cy="64" r="54" fill="none" stroke="{score_c}" stroke-width="10"
                        stroke-linecap="round"
                        stroke-dasharray="{2 * 3.14159 * 54:.1f}"
                        stroke-dashoffset="{score_ring_offset:.1f}"
                        transform="rotate(-90 64 64)"/>
                    <text x="64" y="58" text-anchor="middle" font-family="Inter,sans-serif" font-size="26" font-weight="900" fill="{score_c}">{overall_score}</text>
                    <text x="64" y="76" text-anchor="middle" font-family="Inter,sans-serif" font-size="11" font-weight="600" fill="rgba(255,255,255,0.5)">Overall %</text>
                </svg>
                <div class="ring-label">Verification Score</div>
            </div>
        </div>
    </div>

    <!-- Stats Row -->
    <div class="stats-row">
        <div class="stat-card">
            <div class="stat-label">Verified Skills</div>
            <div class="stat-value" style="color:#22c55e">{verified_count}</div>
            <div class="stat-sub">out of {len(skills)} total</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Partially Verified</div>
            <div class="stat-value" style="color:#f59e0b">{partial_count}</div>
            <div class="stat-sub">require more evidence</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Unverified</div>
            <div class="stat-value" style="color:#ef4444">{unverified_count}</div>
            <div class="stat-sub">not found in code</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Repos Analyzed</div>
            <div class="stat-value" style="color:#818cf8">{len(repo_names)}</div>
            <div class="stat-sub">{", ".join(repo_names[:2]) if repo_names else "N/A"}</div>
        </div>
    </div>

    <!-- Skill Verification Details -->
    <div class="section">
        <div class="section-header">📊 Skill Verification Details</div>
        {skill_cards_html if skill_cards_html else '<p style="color:#64748b;font-size:14px">No skill data available.</p>'}
    </div>

    {forensics_html}
    {bridge_html}
    {ats_html}

    <div class="footer">
        <div class="footer-logo">TrueSkill AI</div>
        <div class="footer-sub">Automated Competency Verification System · GraphRAG + Multi-Agent Analysis · Generated {generated_at}</div>
    </div>
</div>
</body>
</html>"""

    return html
