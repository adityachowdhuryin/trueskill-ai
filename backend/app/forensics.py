"""
Stylometric Forensics Module - Code Authenticity Analysis
Detects potential AI-generated or copy-pasted code based on coding style patterns.

Features:
- Variable naming convention analysis (snake_case vs camelCase)
- Style entropy calculation for consistency detection
- Git commit pattern analysis for bulk code additions
- Overall authenticity scoring
"""

import os
import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional, Union


# =============================================================================
# Data Models
# =============================================================================

@dataclass
class FileStyleAnalysis:
    """Style analysis for a single file"""
    file_path: str
    language: str
    snake_case_count: int = 0
    camel_case_count: int = 0
    pascal_case_count: int = 0
    total_identifiers: int = 0
    style_entropy: float = 0.0  # 0 = consistent, 1 = chaotic
    dominant_style: str = "unknown"
    is_suspicious: bool = False
    flags: list[str] = field(default_factory=list)


@dataclass
class CommitAnalysis:
    """Git commit pattern analysis"""
    total_commits: int = 0
    single_commit_ratio: float = 0.0  # % of code in single largest commit
    avg_commit_size: float = 0.0
    is_bulk_addition: bool = False
    suspicious_commits: list[str] = field(default_factory=list)


@dataclass 
class ForensicsReport:
    """Complete forensics analysis report"""
    repo_path: str
    total_files_analyzed: int = 0
    files_with_issues: int = 0
    overall_consistency_score: float = 100.0  # 0-100, higher = more authentic
    authenticity_score: float = 100.0  # 0-100, overall authenticity
    style_analysis: list[FileStyleAnalysis] = field(default_factory=list)
    commit_analysis: Optional[CommitAnalysis] = None
    warnings: list[str] = field(default_factory=list)
    verdict: str = "Authentic"  # Authentic, Suspicious, Highly Suspicious


# =============================================================================
# Naming Convention Detection
# =============================================================================

# Regex patterns for identifier extraction
PYTHON_IDENTIFIER_PATTERN = re.compile(r'\b([a-zA-Z_][a-zA-Z0-9_]*)\b')
JS_IDENTIFIER_PATTERN = re.compile(r'\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b')

# Keywords to exclude from analysis
PYTHON_KEYWORDS = {
    'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 
    'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
    'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 
    'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try',
    'while', 'with', 'yield', 'self', 'cls', 'print', 'len', 'range',
    'str', 'int', 'float', 'bool', 'list', 'dict', 'set', 'tuple', 'type',
    'open', 'file', 'input', 'output', 'Exception', 'Error', 'super'
}

JS_KEYWORDS = {
    'break', 'case', 'catch', 'continue', 'debugger', 'default', 'delete',
    'do', 'else', 'finally', 'for', 'function', 'if', 'in', 'instanceof',
    'new', 'return', 'switch', 'this', 'throw', 'try', 'typeof', 'var',
    'void', 'while', 'with', 'class', 'const', 'enum', 'export', 'extends',
    'import', 'super', 'implements', 'interface', 'let', 'package', 'private',
    'protected', 'public', 'static', 'yield', 'null', 'true', 'false',
    'undefined', 'NaN', 'Infinity', 'console', 'document', 'window', 'async', 'await'
}


def is_snake_case(identifier: str) -> bool:
    """Check if identifier follows snake_case convention"""
    if '_' not in identifier:
        return False
    # Must be all lowercase with underscores
    return bool(re.match(r'^[a-z][a-z0-9]*(_[a-z0-9]+)+$', identifier))


def is_camel_case(identifier: str) -> bool:
    """Check if identifier follows camelCase convention"""
    if '_' in identifier:
        return False
    # Must start lowercase and have at least one uppercase
    return bool(re.match(r'^[a-z][a-z0-9]*([A-Z][a-z0-9]*)+$', identifier))


def is_pascal_case(identifier: str) -> bool:
    """Check if identifier follows PascalCase convention"""
    if '_' in identifier:
        return False
    # Must start uppercase
    return bool(re.match(r'^[A-Z][a-z0-9]*([A-Z][a-z0-9]*)*$', identifier))


def calculate_entropy(snake: int, camel: int, pascal: int) -> float:
    """
    Calculate style entropy based on naming convention distribution.
    Returns value between 0 (consistent) and 1 (chaotic/mixed).
    """
    total = snake + camel + pascal
    if total == 0:
        return 0.0
    
    # Normalize counts
    probs = []
    for count in [snake, camel, pascal]:
        if count > 0:
            probs.append(count / total)
    
    if len(probs) <= 1:
        return 0.0  # Only one style used = consistent
    
    # Calculate Shannon entropy normalized to [0, 1]
    import math
    entropy = -sum(p * math.log2(p) for p in probs if p > 0)
    max_entropy = math.log2(len(probs))  # Max possible entropy for this distribution
    
    return entropy / max_entropy if max_entropy > 0 else 0.0


# =============================================================================
# File Analysis
# =============================================================================

def analyze_file_style(file_path: str, content: str, language: str) -> FileStyleAnalysis:
    """Analyze the coding style of a single file"""
    analysis = FileStyleAnalysis(
        file_path=file_path,
        language=language
    )
    
    # Select patterns and keywords based on language
    if language == "python":
        pattern = PYTHON_IDENTIFIER_PATTERN
        keywords = PYTHON_KEYWORDS
    elif language in ["javascript", "typescript"]:
        pattern = JS_IDENTIFIER_PATTERN
        keywords = JS_KEYWORDS
    else:
        return analysis
    
    # Extract all identifiers
    identifiers = pattern.findall(content)
    
    # Filter out keywords and short identifiers
    identifiers = [
        ident for ident in identifiers 
        if ident not in keywords and len(ident) > 2
    ]
    
    # Remove duplicates for more accurate style analysis
    unique_identifiers = set(identifiers)
    
    # Count naming conventions
    for ident in unique_identifiers:
        analysis.total_identifiers += 1
        if is_snake_case(ident):
            analysis.snake_case_count += 1
        elif is_camel_case(ident):
            analysis.camel_case_count += 1
        elif is_pascal_case(ident):
            analysis.pascal_case_count += 1
    
    # Calculate style entropy
    analysis.style_entropy = calculate_entropy(
        analysis.snake_case_count,
        analysis.camel_case_count,
        analysis.pascal_case_count
    )
    
    # Determine dominant style
    counts = {
        "snake_case": analysis.snake_case_count,
        "camelCase": analysis.camel_case_count,
        "PascalCase": analysis.pascal_case_count
    }
    if sum(counts.values()) > 0:
        analysis.dominant_style = max(counts, key=counts.get)
    
    # Flag suspicious patterns
    if analysis.style_entropy > 0.7:
        analysis.is_suspicious = True
        analysis.flags.append("High style entropy - mixed naming conventions")
    
    # Check for language-specific style violations
    if language == "python" and analysis.camel_case_count > analysis.snake_case_count:
        if analysis.camel_case_count > 5:  # Threshold to avoid false positives
            analysis.flags.append("Non-Pythonic: Heavy camelCase usage in Python file")
    
    if language in ["javascript", "typescript"]:
        if analysis.snake_case_count > analysis.camel_case_count:
            if analysis.snake_case_count > 5:
                analysis.flags.append("Unusual: Heavy snake_case usage in JS/TS file")
    
    return analysis


# =============================================================================
# Git History Analysis
# =============================================================================

def analyze_git_history(repo_path: str) -> Optional[CommitAnalysis]:
    """Analyze git commit patterns for suspicious bulk additions"""
    git_dir = Path(repo_path) / ".git"
    if not git_dir.exists():
        return None
    
    analysis = CommitAnalysis()
    
    try:
        # Get commit count
        result = subprocess.run(
            ["git", "rev-list", "--count", "HEAD"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0:
            analysis.total_commits = int(result.stdout.strip())
        
        # Get lines added per commit (for top commits)
        result = subprocess.run(
            ["git", "log", "--pretty=format:%H", "--shortstat", "-n", "50"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode == 0:
            lines = result.stdout.strip().split('\n')
            commit_sizes = []
            
            for line in lines:
                if 'insertion' in line or 'deletion' in line:
                    # Extract insertions count
                    match = re.search(r'(\d+) insertion', line)
                    if match:
                        commit_sizes.append(int(match.group(1)))
            
            if commit_sizes:
                total_insertions = sum(commit_sizes)
                max_commit_size = max(commit_sizes)
                analysis.avg_commit_size = total_insertions / len(commit_sizes)
                
                # Calculate ratio of largest commit
                if total_insertions > 0:
                    analysis.single_commit_ratio = max_commit_size / total_insertions
                
                # Flag if 90%+ came from single commit
                if analysis.single_commit_ratio > 0.9:
                    analysis.is_bulk_addition = True
                    analysis.suspicious_commits.append(
                        f"90%+ of code added in single commit ({max_commit_size} lines)"
                    )
        
        return analysis
        
    except (subprocess.TimeoutExpired, Exception):
        return None


# =============================================================================
# Main Analysis Function
# =============================================================================

def analyze_stylometry(repo_path: str) -> ForensicsReport:
    """
    Perform complete stylometric analysis on a repository.
    
    Args:
        repo_path: Path to the repository to analyze
        
    Returns:
        ForensicsReport with authenticity scoring and detailed analysis
    """
    report = ForensicsReport(repo_path=repo_path)
    
    # File extensions to analyze
    extensions = {
        '.py': 'python',
        '.js': 'javascript',
        '.ts': 'typescript',
        '.jsx': 'javascript',
        '.tsx': 'typescript',
    }
    
    # Skip directories
    skip_dirs = {'.git', 'node_modules', '__pycache__', 'venv', '.venv', 'dist', 'build'}
    
    # Analyze all relevant files
    for root, dirs, files in os.walk(repo_path):
        # Skip excluded directories
        dirs[:] = [d for d in dirs if d not in skip_dirs]
        
        for file_name in files:
            ext = os.path.splitext(file_name)[1]
            if ext not in extensions:
                continue
            
            file_path = os.path.join(root, file_name)
            relative_path = os.path.relpath(file_path, repo_path)
            
            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                
                if len(content) < 100:  # Skip tiny files
                    continue
                
                analysis = analyze_file_style(
                    relative_path, 
                    content, 
                    extensions[ext]
                )
                
                report.style_analysis.append(analysis)
                report.total_files_analyzed += 1
                
                if analysis.is_suspicious or analysis.flags:
                    report.files_with_issues += 1
                    
            except Exception:
                continue
    
    # Analyze git history if available
    report.commit_analysis = analyze_git_history(repo_path)
    
    # Calculate overall scores
    _calculate_scores(report)
    
    return report


def _calculate_scores(report: ForensicsReport) -> None:
    """Calculate overall consistency and authenticity scores"""
    
    if report.total_files_analyzed == 0:
        return
    
    # Calculate consistency score based on average entropy
    total_entropy = sum(a.style_entropy for a in report.style_analysis)
    avg_entropy = total_entropy / report.total_files_analyzed
    
    # Convert entropy (0-1) to consistency (0-100)
    report.overall_consistency_score = round((1 - avg_entropy) * 100, 1)
    
    # Start with consistency score
    authenticity = report.overall_consistency_score
    
    # Deduct for suspicious files
    files_ratio = report.files_with_issues / report.total_files_analyzed
    authenticity -= files_ratio * 20  # Up to -20 for many suspicious files
    
    # Deduct for bulk additions
    if report.commit_analysis and report.commit_analysis.is_bulk_addition:
        authenticity -= 25
        report.warnings.append("Large portion of code added in single commit")
    
    # Deduct for style violations
    style_violations = sum(len(a.flags) for a in report.style_analysis)
    violation_penalty = min(style_violations * 2, 15)  # Up to -15
    authenticity -= violation_penalty
    
    report.authenticity_score = max(0, min(100, round(authenticity, 1)))
    
    # Determine verdict
    if report.authenticity_score >= 80:
        report.verdict = "Authentic"
    elif report.authenticity_score >= 50:
        report.verdict = "Suspicious"
        report.warnings.append("Code shows some inconsistencies in style")
    else:
        report.verdict = "Highly Suspicious"
        report.warnings.append("High probability of AI-generated or copy-pasted code")


# =============================================================================
# Helper Functions for Integration
# =============================================================================

def get_forensics_summary(report: ForensicsReport) -> dict[str, Any]:
    """Convert ForensicsReport to a JSON-serializable summary"""
    return {
        "authenticity_score": report.authenticity_score,
        "consistency_score": report.overall_consistency_score,
        "verdict": report.verdict,
        "files_analyzed": report.total_files_analyzed,
        "files_with_issues": report.files_with_issues,
        "warnings": report.warnings,
        "has_bulk_commits": (
            report.commit_analysis.is_bulk_addition 
            if report.commit_analysis else False
        ),
        "suspicious_files": [
            {
                "path": a.file_path,
                "entropy": round(a.style_entropy, 2),
                "dominant_style": a.dominant_style,
                "flags": a.flags
            }
            for a in report.style_analysis 
            if a.is_suspicious or a.flags
        ][:5]  # Limit to top 5 suspicious files
    }
