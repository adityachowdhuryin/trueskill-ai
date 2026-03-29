"""
TrueSkill AI — Test Suite
Covers: llm utilities, agents (synonym mapping, claim parsing),
        forensics helpers, ingest (parsing, data structures), and API contract.
"""

import os
import sys
import tempfile
import pytest

# Ensure the backend is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ═══════════════════════════════════════════════════════════════════
# 1.  LLM Utilities (app/llm.py)
# ═══════════════════════════════════════════════════════════════════

class TestParseJsonResponse:
    """Tests for parse_json_response — robust JSON extraction from LLM output."""

    def test_raw_json(self):
        from app.llm import parse_json_response
        result = parse_json_response('{"key": "value"}')
        assert result == {"key": "value"}

    def test_json_in_markdown_code_block(self):
        from app.llm import parse_json_response
        text = 'Here is the JSON:\n```json\n{"score": 42}\n```\nEnd.'
        result = parse_json_response(text)
        assert result == {"score": 42}

    def test_json_in_generic_code_block(self):
        from app.llm import parse_json_response
        text = '```\n{"list": [1, 2, 3]}\n```'
        result = parse_json_response(text)
        assert result == {"list": [1, 2, 3]}

    def test_invalid_json_raises_value_error(self):
        from app.llm import parse_json_response
        with pytest.raises(ValueError, match="Failed to parse"):
            parse_json_response("this is not JSON")

    def test_nested_json(self):
        from app.llm import parse_json_response
        text = '```json\n{"a": {"b": [1, 2, {"c": true}]}}\n```'
        result = parse_json_response(text)
        assert result["a"]["b"][2]["c"] is True


# ═══════════════════════════════════════════════════════════════════
# 2.  Synonym / Keyword Expansion (app/agents.py)
# ═══════════════════════════════════════════════════════════════════

class TestExpandTopicKeywords:
    """Tests for _expand_topic_keywords — synonym-based query expansion."""

    def test_direct_topic_expansion(self):
        from app.agents import _expand_topic_keywords
        keywords = _expand_topic_keywords("machine learning")
        assert "sklearn" in keywords
        assert "tensorflow" in keywords
        assert "machine learning" in keywords

    def test_partial_match(self):
        from app.agents import _expand_topic_keywords
        keywords = _expand_topic_keywords("deep learning model")
        # "deep learning" group should be matched since it's contained in the topic
        assert "neural" in keywords or "pytorch" in keywords

    def test_unknown_topic_returns_tokens(self):
        from app.agents import _expand_topic_keywords
        keywords = _expand_topic_keywords("quantum computing")
        # Should at least contain the original and its tokens
        assert "quantum computing" in keywords
        assert "quantum" in keywords
        assert "computing" in keywords

    def test_single_word_topic(self):
        from app.agents import _expand_topic_keywords
        keywords = _expand_topic_keywords("api")
        assert "api" in keywords
        # Should pick up the "api" synonym group
        assert "rest" in keywords or "endpoint" in keywords


# ═══════════════════════════════════════════════════════════════════
# 3.  Forensics Helpers (app/forensics.py)
# ═══════════════════════════════════════════════════════════════════

class TestForensicsHelpers:
    """Tests for forensics utility functions."""

    def test_detect_naming_convention_snake_case(self):
        from app.forensics import detect_naming_convention
        assert detect_naming_convention("my_variable_name") == "snake_case"

    def test_detect_naming_convention_camel_case(self):
        from app.forensics import detect_naming_convention
        assert detect_naming_convention("myVariableName") == "camelCase"

    def test_detect_naming_convention_pascal_case(self):
        from app.forensics import detect_naming_convention
        assert detect_naming_convention("MyClassName") == "PascalCase"

    def test_calculate_style_entropy_uniform(self):
        from app.forensics import calculate_style_entropy
        # All same convention → entropy should be low
        names = ["foo_bar", "baz_qux", "hello_world"]
        entropy = calculate_style_entropy(names)
        assert entropy == 0.0  # All snake_case = no entropy

    def test_calculate_style_entropy_mixed(self):
        from app.forensics import calculate_style_entropy
        # Mixed conventions → entropy should be > 0
        names = ["foo_bar", "fooBar", "FooBar"]
        entropy = calculate_style_entropy(names)
        assert entropy > 0


# ═══════════════════════════════════════════════════════════════════
# 4.  Ingest Data Structures (app/ingest.py)
# ═══════════════════════════════════════════════════════════════════

class TestIngestDataStructures:
    """Tests for ingestion data classes and helper functions."""

    def test_file_node_creation(self):
        from app.ingest import FileNode
        node = FileNode(name="test.py", path="src/test.py", language="python", repo_id="abc123")
        assert node.name == "test.py"
        assert node.language == "python"

    def test_function_node_defaults(self):
        from app.ingest import FunctionNode
        node = FunctionNode(
            name="foo",
            args=["a", "b"],
            complexity_score=3,
            line_start=1,
            line_end=10,
            file_path="test.py",
            repo_id="abc123",
        )
        assert node.parent_class is None
        assert node.calls == []

    def test_graph_data_container(self):
        from app.ingest import GraphData
        data = GraphData(repo_id="test")
        assert len(data.files) == 0
        assert len(data.classes) == 0
        assert len(data.functions) == 0
        assert len(data.imports) == 0

    def test_detect_language_python(self):
        from app.ingest import _detect_language
        assert _detect_language("main.py") == "python"

    def test_detect_language_javascript(self):
        from app.ingest import _detect_language
        assert _detect_language("index.js") == "javascript"
        assert _detect_language("App.jsx") == "javascript"

    def test_detect_language_typescript(self):
        from app.ingest import _detect_language
        assert _detect_language("component.tsx") == "typescript"
        assert _detect_language("utils.ts") == "typescript"

    def test_detect_language_unsupported(self):
        from app.ingest import _detect_language
        assert _detect_language("style.css") is None
        assert _detect_language("README.md") is None

    def test_batch_list_helper(self):
        from app.ingest import _batch_list
        items = list(range(10))
        batches = _batch_list(items, size=3)
        assert len(batches) == 4  # 3 + 3 + 3 + 1
        assert batches[0] == [0, 1, 2]
        assert batches[-1] == [9]


# ═══════════════════════════════════════════════════════════════════
# 5.  Python Code Parsing (app/ingest.py)
# ═══════════════════════════════════════════════════════════════════

class TestPythonParsing:
    """Tests for tree-sitter based Python code parsing."""

    def _write_temp_py(self, code: str) -> tuple[str, str]:
        """Write code to a temp file and return (file_path, relative_path)."""
        fd, path = tempfile.mkstemp(suffix=".py")
        with os.fdopen(fd, 'w') as f:
            f.write(code)
        return path, os.path.basename(path)

    def test_parse_simple_function(self):
        from app.ingest import _parse_python_file, _get_python_parser
        code = "def hello(name):\n    print(name)\n"
        fpath, relpath = self._write_temp_py(code)
        try:
            parser = _get_python_parser()
            classes, functions, imports = _parse_python_file(fpath, relpath, "test", parser)
            assert len(functions) == 1
            assert functions[0].name == "hello"
            assert "name" in functions[0].args
        finally:
            os.unlink(fpath)

    def test_parse_class_with_methods(self):
        from app.ingest import _parse_python_file, _get_python_parser
        code = """
class Animal:
    def speak(self):
        pass

    def move(self, direction):
        pass
"""
        fpath, relpath = self._write_temp_py(code)
        try:
            parser = _get_python_parser()
            classes, functions, imports = _parse_python_file(fpath, relpath, "test", parser)
            assert len(classes) == 1
            assert classes[0].name == "Animal"
            assert len(functions) == 2
            assert all(f.parent_class == "Animal" for f in functions)
        finally:
            os.unlink(fpath)

    def test_parse_imports(self):
        from app.ingest import _parse_python_file, _get_python_parser
        code = "import os\nfrom pathlib import Path\n"
        fpath, relpath = self._write_temp_py(code)
        try:
            parser = _get_python_parser()
            classes, functions, imports = _parse_python_file(fpath, relpath, "test", parser)
            assert len(imports) == 2
            modules = {i.module_name for i in imports}
            assert "os" in modules
            assert "pathlib" in modules
        finally:
            os.unlink(fpath)

    def test_cyclomatic_complexity(self):
        from app.ingest import _parse_python_file, _get_python_parser
        code = """
def complex_func(x):
    if x > 0:
        for i in range(x):
            if i % 2 == 0:
                pass
            else:
                pass
    elif x < 0:
        while True:
            break
    return x
"""
        fpath, relpath = self._write_temp_py(code)
        try:
            parser = _get_python_parser()
            _, functions, _ = _parse_python_file(fpath, relpath, "test", parser)
            assert len(functions) == 1
            # Base(1) + if + for + if + elif + while = 6
            assert functions[0].complexity_score >= 5
        finally:
            os.unlink(fpath)

    def test_function_calls_extraction(self):
        from app.ingest import _parse_python_file, _get_python_parser
        code = """
def main():
    result = process()
    data = transform(result)
    save(data)
"""
        fpath, relpath = self._write_temp_py(code)
        try:
            parser = _get_python_parser()
            _, functions, _ = _parse_python_file(fpath, relpath, "test", parser)
            assert len(functions) == 1
            calls = functions[0].calls
            assert "process" in calls
            assert "transform" in calls
            assert "save" in calls
        finally:
            os.unlink(fpath)


# ═══════════════════════════════════════════════════════════════════
# 6.  API Contract (app/api.py — Pydantic models & rate limiting)
# ═══════════════════════════════════════════════════════════════════

class TestAPIModels:
    """Tests for API request/response models and rate limiting."""

    def test_valid_github_url(self):
        from app.api import IngestRequest
        req = IngestRequest(github_url="https://github.com/owner/repo")
        assert str(req.github_url).startswith("https://github.com")

    def test_invalid_github_url_raises(self):
        from app.api import IngestRequest
        with pytest.raises(Exception):
            IngestRequest(github_url="https://gitlab.com/owner/repo")

    def test_github_url_with_git_suffix(self):
        from app.api import IngestRequest
        req = IngestRequest(github_url="https://github.com/owner/repo.git")
        assert "repo" in str(req.github_url)

    def test_rate_limiter_allows_within_limit(self):
        from app.api import check_rate_limit, _rate_limit_store
        # Clear state
        _rate_limit_store.clear()
        # Should not raise for first request
        check_rate_limit("127.0.0.1", "test_endpoint")

    def test_rate_limiter_blocks_excess(self):
        from app.api import check_rate_limit, _rate_limit_store, RATE_LIMIT_MAX_REQUESTS
        from fastapi import HTTPException
        _rate_limit_store.clear()

        # Make max requests
        for _ in range(RATE_LIMIT_MAX_REQUESTS):
            check_rate_limit("10.0.0.1", "flood_test")

        # Next should fail
        with pytest.raises(HTTPException) as exc_info:
            check_rate_limit("10.0.0.1", "flood_test")
        assert exc_info.value.status_code == 429

    def test_ingest_response_model(self):
        from app.api import IngestResponse
        resp = IngestResponse(
            repo_id="abc123",
            status="success",
            message="ok",
            stats={"files": 10}
        )
        assert resp.repo_id == "abc123"
        assert resp.stats is not None


# ═══════════════════════════════════════════════════════════════════
# 7.  Coach Module (app/coach.py — gap analysis logic)
# ═══════════════════════════════════════════════════════════════════

class TestCoachGapAnalysis:
    """Tests for skill gap identification logic (no LLM required)."""

    def test_identify_skill_gaps_basic(self):
        from app.coach import identify_skill_gaps, VerifiedSkill
        skills = [
            VerifiedSkill(topic="Python", score=90, status="Verified"),
            VerifiedSkill(topic="Docker", score=20, status="Unverified"),
        ]
        jd = "We need Python, Docker, and Kubernetes"
        gaps = identify_skill_gaps(skills, jd)
        # Docker should be a gap (low score), Kubernetes should be a gap (not verified at all)
        assert len(gaps) > 0

    def test_template_project_keyword_match(self):
        from app.coach import get_template_project
        project = get_template_project("api")
        assert project is not None
        assert "api" in project.gap_skill.lower() or len(project.steps) > 0

    def test_template_project_no_match(self):
        from app.coach import get_template_project
        project = get_template_project("quantum teleportation")
        assert project is None
