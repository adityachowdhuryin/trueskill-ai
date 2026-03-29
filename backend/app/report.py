"""
HTML Report Generator for TrueSkill AI.
Generates a self-contained, downloadable HTML report from analysis results.
"""

from typing import Any


def generate_html_report(data: dict[str, Any]) -> str:
    """
    Generate a self-contained HTML report from analysis results.
    
    Expected data keys:
        candidate_name, repo_names, skills (list of {topic, score, status, evidence}),
        overall_score, forensics (optional)
    """
    candidate = data.get("candidate_name", "Unknown Candidate")
    repo_names = data.get("repo_names", [])
    skills = data.get("skills", [])
    overall_score = data.get("overall_score", 0)
    forensics = data.get("forensics", {})

    # Build skill rows
    skill_rows = ""
    for s in skills:
        topic = s.get("topic", "")
        score = s.get("score", 0)
        status = s.get("status", "Unverified")
        evidence = s.get("evidence", "—")

        status_color = "#22c55e" if status == "Verified" else "#f59e0b" if status == "Partially Verified" else "#ef4444"
        bar_color = "#22c55e" if score >= 70 else "#f59e0b" if score >= 40 else "#ef4444"

        skill_rows += f"""
        <tr>
            <td style="padding:10px 14px;font-weight:500">{topic}</td>
            <td style="padding:10px 14px;text-align:center">
                <div style="background:#e2e8f0;border-radius:6px;height:8px;width:100px;display:inline-block;vertical-align:middle">
                    <div style="background:{bar_color};height:8px;border-radius:6px;width:{score}px"></div>
                </div>
                <span style="margin-left:8px;font-weight:600">{score}%</span>
            </td>
            <td style="padding:10px 14px;text-align:center">
                <span style="color:{status_color};font-weight:600">{status}</span>
            </td>
            <td style="padding:10px 14px;color:#64748b;font-size:13px">{evidence}</td>
        </tr>"""

    # Forensics section
    forensics_html = ""
    if forensics:
        auth_score = forensics.get("authenticity_score", "N/A")
        verdict = forensics.get("verdict", "N/A")
        verdict_color = "#22c55e" if verdict == "Authentic" else "#f59e0b" if verdict == "Suspicious" else "#ef4444"
        forensics_html = f"""
        <div style="margin-top:32px">
            <h2 style="color:#1e293b;font-size:20px;margin-bottom:16px">🔍 Code Authenticity</h2>
            <div style="display:flex;gap:24px">
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;flex:1">
                    <div style="font-size:14px;color:#64748b">Authenticity Score</div>
                    <div style="font-size:32px;font-weight:700;color:#1e293b">{auth_score}%</div>
                </div>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;flex:1">
                    <div style="font-size:14px;color:#64748b">Verdict</div>
                    <div style="font-size:24px;font-weight:700;color:{verdict_color}">{verdict}</div>
                </div>
            </div>
        </div>"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TrueSkill AI Report — {candidate}</title>
    <style>
        * {{ margin:0; padding:0; box-sizing:border-box; }}
        body {{ font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#f1f5f9;color:#1e293b; }}
        .container {{ max-width:900px; margin:0 auto; padding:40px 24px; }}
        .header {{ background:linear-gradient(135deg,#6366f1,#8b5cf6); color:white; border-radius:16px; padding:32px; margin-bottom:32px; }}
        .header h1 {{ font-size:28px; margin-bottom:8px; }}
        .header .subtitle {{ opacity:0.85; font-size:15px; }}
        .score-card {{ display:flex; gap:24px; margin-bottom:32px; }}
        .score-box {{ background:white; border-radius:12px; padding:24px; flex:1; box-shadow:0 1px 3px rgba(0,0,0,0.1); text-align:center; }}
        .score-box .label {{ font-size:14px; color:#64748b; margin-bottom:8px; }}
        .score-box .value {{ font-size:36px; font-weight:700; }}
        table {{ width:100%; border-collapse:collapse; background:white; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.1); }}
        thead tr {{ background:#f8fafc; }}
        th {{ padding:12px 14px; text-align:left; font-size:13px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; }}
        tr {{ border-bottom:1px solid #f1f5f9; }}
        tr:last-child {{ border-bottom:none; }}
        .footer {{ text-align:center; margin-top:40px; font-size:13px; color:#94a3b8; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>TrueSkill AI — Verification Report</h1>
            <div class="subtitle">Candidate: <strong>{candidate}</strong> &nbsp;|&nbsp; Repos: {', '.join(repo_names) if repo_names else 'N/A'}</div>
        </div>

        <div class="score-card">
            <div class="score-box">
                <div class="label">Overall Score</div>
                <div class="value" style="color:{'#22c55e' if overall_score >= 70 else '#f59e0b' if overall_score >= 40 else '#ef4444'}">{overall_score}%</div>
            </div>
            <div class="score-box">
                <div class="label">Skills Verified</div>
                <div class="value">{len([s for s in skills if s.get('status') == 'Verified'])}/{len(skills)}</div>
            </div>
            <div class="score-box">
                <div class="label">Repos Analyzed</div>
                <div class="value">{len(repo_names)}</div>
            </div>
        </div>

        <h2 style="color:#1e293b;font-size:20px;margin-bottom:16px">📊 Skill Verification Details</h2>
        <table>
            <thead>
                <tr>
                    <th>Skill</th>
                    <th style="text-align:center">Score</th>
                    <th style="text-align:center">Status</th>
                    <th>Evidence</th>
                </tr>
            </thead>
            <tbody>
                {skill_rows}
            </tbody>
        </table>

        {forensics_html}

        <div class="footer">
            Generated by TrueSkill AI — Automated Competency Verification System
        </div>
    </div>
</body>
</html>"""

    return html
