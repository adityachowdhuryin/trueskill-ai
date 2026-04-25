"""
Ingestion Engine Module
Clones GitHub repos, parses code using tree-sitter, and builds the Knowledge Graph.

Graph Schema (from project_spec.md):
    Nodes:
        - (:File {name, path, language})
        - (:Class {name, line_start, line_end})
        - (:Function {name, args, complexity_score})
        - (:Import {module_name})
    Relationships:
        - (:Function)-[:CALLS]->(:Function)
        - (:Class)-[:INHERITS_FROM]->(:Class)
        - (:File)-[:CONTAINS]->(:Class|:Function)
        - (:File)-[:IMPORTS]->(:Import)
"""

import os
import shutil
import subprocess
import tempfile
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional, Union

import git
import tree_sitter_python as tspython
from tree_sitter import Language, Parser, Node

from .db import neo4j_driver


# =============================================================================
# Data Classes for Graph Representation
# =============================================================================

@dataclass
class FileNode:
    """Represents a File node in the graph"""
    name: str
    path: str
    language: str
    repo_id: str
    

@dataclass
class ClassNode:
    """Represents a Class node in the graph"""
    name: str
    line_start: int
    line_end: int
    file_path: str
    repo_id: str
    bases: list[str] = field(default_factory=list)  # For INHERITS_FROM


@dataclass
class FunctionNode:
    """Represents a Function node in the graph"""
    name: str
    args: list[str]
    complexity_score: int
    line_start: int
    line_end: int
    file_path: str
    repo_id: str
    parent_class: Optional[str] = None  # For methods inside classes
    calls: list[str] = field(default_factory=list)  # Function names this function calls


@dataclass
class ImportNode:
    """Represents an Import node in the graph"""
    module_name: str
    file_path: str
    repo_id: str


@dataclass
class GraphData:
    """Container for all extracted graph data"""
    repo_id: str
    files: list[FileNode] = field(default_factory=list)
    classes: list[ClassNode] = field(default_factory=list)
    functions: list[FunctionNode] = field(default_factory=list)
    imports: list[ImportNode] = field(default_factory=list)


# =============================================================================
# Repository Cloning
# =============================================================================

def clone_repo(github_url: str, target_dir: Optional[str] = None) -> tuple[str, str]:
    """
    Clone a GitHub repository to a temporary directory.
    
    Args:
        github_url: The GitHub repository URL (HTTPS or SSH)
        target_dir: Optional target directory. If None, creates a temp directory.
        
    Returns:
        Tuple of (repo_id, repo_path) where repo_id is a unique identifier
        
    Raises:
        git.GitError: If cloning fails
        ValueError: If URL is invalid
    """
    # Validate URL
    if not github_url.startswith(("https://", "git@")):
        raise ValueError(f"Invalid GitHub URL: {github_url}")
    
    # Generate unique repo ID
    repo_id = str(uuid.uuid4())[:8]
    
    # Create target directory
    if target_dir is None:
        target_dir = tempfile.mkdtemp(prefix=f"trueskill_{repo_id}_")
    
    repo_path = os.path.join(target_dir, repo_id)
    
    try:
        # Use subprocess directly to fully disable git-lfs filters.
        # GitPython's env= parameter doesn't reliably pass GIT_LFS_SKIP_SMUDGE,
        # and even when it does, .gitattributes LFS filter configs still cause
        # checkout failures. Disabling filters via -c flags is the only reliable fix.
        clone_env = os.environ.copy()
        clone_env["GIT_LFS_SKIP_SMUDGE"] = "1"

        result = subprocess.run(
            [
                "git",
                "-c", "filter.lfs.smudge=",
                "-c", "filter.lfs.clean=",
                "-c", "filter.lfs.process=",
                "-c", "filter.lfs.required=false",
                "clone",
                "--depth=1",
                "--single-branch",
                github_url,
                repo_path,
            ],
            env=clone_env,
            capture_output=True,
            text=True,
            timeout=120,
        )

        if result.returncode != 0:
            raise git.GitError(result.stderr.strip() or result.stdout.strip())

        print(f"✓ Cloned repository to: {repo_path}")
        return repo_id, repo_path
        
    except subprocess.TimeoutExpired:
        if os.path.exists(repo_path):
            shutil.rmtree(repo_path)
        raise git.GitError("Clone timed out after 120 seconds")
    except git.GitError:
        if os.path.exists(repo_path):
            shutil.rmtree(repo_path)
        raise
    except Exception as e:
        # Clean up on failure
        if os.path.exists(repo_path):
            shutil.rmtree(repo_path)
        raise git.GitError(f"Failed to clone repository: {e}")


def cleanup_repo(repo_path: str) -> None:
    """Remove a cloned repository directory."""
    if os.path.exists(repo_path):
        shutil.rmtree(repo_path)
        print(f"✓ Cleaned up: {repo_path}")


# =============================================================================
# Tree-Sitter Parser Setup (Improvement #11 — multi-language)
# =============================================================================

def _get_python_parser() -> Parser:
    """Initialize and return a tree-sitter parser for Python."""
    PY_LANGUAGE = Language(tspython.language())
    parser = Parser(PY_LANGUAGE)
    return parser


def _get_js_parser() -> Optional[Parser]:
    """
    Initialize and return a tree-sitter parser for JavaScript.
    Returns None if tree-sitter-javascript is not installed.
    """
    try:
        import tree_sitter_javascript as tsjavascript
        JS_LANGUAGE = Language(tsjavascript.language())
        parser = Parser(JS_LANGUAGE)
        return parser
    except ImportError:
        return None


def _get_ts_parser() -> Optional[Parser]:
    """
    Initialize and return a tree-sitter parser for TypeScript.
    Returns None if tree-sitter-typescript is not installed.
    """
    try:
        import tree_sitter_typescript as tstypescript
        TS_LANGUAGE = Language(tstypescript.language_typescript())
        parser = Parser(TS_LANGUAGE)
        return parser
    except ImportError:
        return None


def _get_go_parser() -> Optional[Parser]:
    """Initialize tree-sitter for Go."""
    try:
        import tree_sitter_go as tsgo
        return Parser(Language(tsgo.language()))
    except ImportError:
        return None


def _get_java_parser() -> Optional[Parser]:
    """Initialize tree-sitter for Java."""
    try:
        import tree_sitter_java as tsjava
        return Parser(Language(tsjava.language()))
    except ImportError:
        return None


def _get_rust_parser() -> Optional[Parser]:
    """Initialize tree-sitter for Rust."""
    try:
        import tree_sitter_rust as tsrust
        return Parser(Language(tsrust.language()))
    except ImportError:
        return None


# Language to file extension mapping (Improvement #11)
LANGUAGE_EXTENSIONS: dict[str, list[str]] = {
    "python": [".py"],
    "javascript": [".js", ".jsx", ".mjs"],
    "typescript": [".ts", ".tsx"],
    "go": [".go"],
    "java": [".java"],
    "rust": [".rs"],
}


def _detect_language(file_path: str) -> Optional[str]:
    """Detect programming language from file extension."""
    ext = Path(file_path).suffix.lower()
    for lang, extensions in LANGUAGE_EXTENSIONS.items():
        if ext in extensions:
            return lang
    return None


# =============================================================================
# AST Traversal & Node Extraction
# =============================================================================

def _calculate_cyclomatic_complexity(node: Node, source_code: bytes) -> int:
    """
    Calculate cyclomatic complexity of a function.
    
    Complexity = 1 + number of decision points
    Decision points: if, elif, for, while, except, and, or, ternary
    """
    complexity = 1  # Base complexity
    
    decision_node_types = {
        "if_statement",
        "elif_clause", 
        "for_statement",
        "while_statement",
        "except_clause",
        "with_statement",
        "assert_statement",
        "conditional_expression",  # ternary
        "boolean_operator",  # and/or
        "list_comprehension",
        "dictionary_comprehension",
        "set_comprehension",
        "generator_expression",
        # JS/TS decision points
        "switch_case",
        "ternary_expression",
        "for_in_statement",
        "catch_clause",
    }
    
    def traverse(n: Node):
        nonlocal complexity
        if n.type in decision_node_types:
            complexity += 1
        for child in n.children:
            traverse(child)
    
    traverse(node)
    return complexity


def _extract_function_calls(node: Node, source_code: bytes) -> list[str]:
    """Extract all function calls within a function body."""
    calls = []
    
    def traverse(n: Node):
        if n.type == "call" or n.type == "call_expression":
            # Get the function being called
            func_node = n.child_by_field_name("function")
            if func_node:
                if func_node.type == "identifier":
                    # Simple function call: foo()
                    calls.append(source_code[func_node.start_byte:func_node.end_byte].decode())
                elif func_node.type in ("attribute", "member_expression"):
                    # Method call: obj.method()
                    attr = func_node.child_by_field_name("attribute") or func_node.child_by_field_name("property")
                    if attr:
                        calls.append(source_code[attr.start_byte:attr.end_byte].decode())
        
        for child in n.children:
            traverse(child)
    
    traverse(node)
    return calls


def _extract_function_args(node: Node, source_code: bytes) -> list[str]:
    """Extract function parameter names."""
    args = []
    # Python uses "parameters", JS/TS uses "formal_parameters"
    params = node.child_by_field_name("parameters") or node.child_by_field_name("formal_parameters")
    if params:
        for child in params.children:
            if child.type == "identifier":
                args.append(source_code[child.start_byte:child.end_byte].decode())
            elif child.type in ("default_parameter", "typed_parameter", "typed_default_parameter",
                                "required_parameter", "optional_parameter"):
                name_node = child.child_by_field_name("name") or child.child_by_field_name("pattern")
                if name_node:
                    args.append(source_code[name_node.start_byte:name_node.end_byte].decode())
    return args


def _extract_class_bases(node: Node, source_code: bytes) -> list[str]:
    """Extract base class names for inheritance."""
    bases = []
    # Python: superclasses;  JS/TS: uses "heritage" clauses
    superclasses = node.child_by_field_name("superclasses")
    if superclasses:
        for child in superclasses.children:
            if child.type == "identifier":
                bases.append(source_code[child.start_byte:child.end_byte].decode())
            elif child.type == "attribute":
                bases.append(source_code[child.start_byte:child.end_byte].decode())

    # JS/TS: class Foo extends Bar { ... }
    for child in node.children:
        if child.type == "class_heritage":
            for sub in child.children:
                if sub.type == "extends_clause":
                    for val in sub.children:
                        if val.type == "identifier":
                            bases.append(source_code[val.start_byte:val.end_byte].decode())
    return bases


def _parse_python_file(
    file_path: str, 
    relative_path: str,
    repo_id: str, 
    parser: Parser
) -> tuple[list[ClassNode], list[FunctionNode], list[ImportNode]]:
    """
    Parse a Python file and extract AST nodes.
    
    Returns:
        Tuple of (classes, functions, imports)
    """
    classes: list[ClassNode] = []
    functions: list[FunctionNode] = []
    imports: list[ImportNode] = []
    
    try:
        with open(file_path, "rb") as f:
            source_code = f.read()
    except (IOError, UnicodeDecodeError) as e:
        print(f"⚠ Skipping file {file_path}: {e}")
        return classes, functions, imports
    
    tree = parser.parse(source_code)
    root = tree.root_node
    
    def process_node(node: Node, parent_class: Optional[str] = None):
        """Recursively process AST nodes."""
        
        if node.type == "class_definition":
            # Extract class name
            name_node = node.child_by_field_name("name")
            if name_node:
                class_name = source_code[name_node.start_byte:name_node.end_byte].decode()
                bases = _extract_class_bases(node, source_code)
                
                classes.append(ClassNode(
                    name=class_name,
                    line_start=node.start_point[0] + 1,  # tree-sitter is 0-indexed
                    line_end=node.end_point[0] + 1,
                    file_path=relative_path,
                    repo_id=repo_id,
                    bases=bases
                ))
                
                # Process class body with class context
                body = node.child_by_field_name("body")
                if body:
                    for child in body.children:
                        process_node(child, parent_class=class_name)
                return  # Don't recurse into class body again
        
        elif node.type == "function_definition":
            name_node = node.child_by_field_name("name")
            if name_node:
                func_name = source_code[name_node.start_byte:name_node.end_byte].decode()
                args = _extract_function_args(node, source_code)
                complexity = _calculate_cyclomatic_complexity(node, source_code)
                calls = _extract_function_calls(node, source_code)
                
                functions.append(FunctionNode(
                    name=func_name,
                    args=args,
                    complexity_score=complexity,
                    line_start=node.start_point[0] + 1,
                    line_end=node.end_point[0] + 1,
                    file_path=relative_path,
                    repo_id=repo_id,
                    parent_class=parent_class,
                    calls=calls
                ))
                return  # Don't recurse into function body for nested functions (for simplicity)
        
        elif node.type == "import_statement":
            # import module, module2
            for child in node.children:
                if child.type == "dotted_name":
                    module = source_code[child.start_byte:child.end_byte].decode()
                    imports.append(ImportNode(
                        module_name=module,
                        file_path=relative_path,
                        repo_id=repo_id
                    ))
        
        elif node.type == "import_from_statement":
            # from module import name
            module_node = node.child_by_field_name("module_name")
            if module_node:
                module = source_code[module_node.start_byte:module_node.end_byte].decode()
                imports.append(ImportNode(
                    module_name=module,
                    file_path=relative_path,
                    repo_id=repo_id
                ))
        
        # Recurse into children
        for child in node.children:
            process_node(child, parent_class)
    
    process_node(root)
    return classes, functions, imports


# =============================================================================
# JavaScript / TypeScript Parsing (Improvement #11)
# =============================================================================

def _parse_js_ts_file(
    file_path: str,
    relative_path: str,
    repo_id: str,
    parser: Parser
) -> tuple[list[ClassNode], list[FunctionNode], list[ImportNode]]:
    """
    Parse a JavaScript or TypeScript file and extract AST nodes.

    Returns:
        Tuple of (classes, functions, imports)
    """
    classes: list[ClassNode] = []
    functions: list[FunctionNode] = []
    imports: list[ImportNode] = []

    try:
        with open(file_path, "rb") as f:
            source_code = f.read()
    except (IOError, UnicodeDecodeError) as e:
        print(f"⚠ Skipping file {file_path}: {e}")
        return classes, functions, imports

    tree = parser.parse(source_code)
    root = tree.root_node

    def process_node(node: Node, parent_class: Optional[str] = None):
        """Recursively process JS/TS AST nodes."""

        # Class declarations: class Foo { ... } or export class Foo { ... }
        if node.type == "class_declaration":
            name_node = node.child_by_field_name("name")
            if name_node:
                class_name = source_code[name_node.start_byte:name_node.end_byte].decode()
                bases = _extract_class_bases(node, source_code)

                classes.append(ClassNode(
                    name=class_name,
                    line_start=node.start_point[0] + 1,
                    line_end=node.end_point[0] + 1,
                    file_path=relative_path,
                    repo_id=repo_id,
                    bases=bases
                ))

                body = node.child_by_field_name("body")
                if body:
                    for child in body.children:
                        process_node(child, parent_class=class_name)
                return

        # Function declarations: function foo() { ... }
        elif node.type in ("function_declaration", "method_definition"):
            name_node = node.child_by_field_name("name")
            if name_node:
                func_name = source_code[name_node.start_byte:name_node.end_byte].decode()
                args = _extract_function_args(node, source_code)
                complexity = _calculate_cyclomatic_complexity(node, source_code)
                calls = _extract_function_calls(node, source_code)

                functions.append(FunctionNode(
                    name=func_name,
                    args=args,
                    complexity_score=complexity,
                    line_start=node.start_point[0] + 1,
                    line_end=node.end_point[0] + 1,
                    file_path=relative_path,
                    repo_id=repo_id,
                    parent_class=parent_class,
                    calls=calls
                ))
                return

        # Arrow functions assigned to variables: const foo = () => { ... }
        elif node.type in ("lexical_declaration", "variable_declaration"):
            for declarator in node.children:
                if declarator.type in ("variable_declarator",):
                    name_node = declarator.child_by_field_name("name")
                    value_node = declarator.child_by_field_name("value")
                    if name_node and value_node and value_node.type == "arrow_function":
                        func_name = source_code[name_node.start_byte:name_node.end_byte].decode()
                        args = _extract_function_args(value_node, source_code)
                        complexity = _calculate_cyclomatic_complexity(value_node, source_code)
                        calls = _extract_function_calls(value_node, source_code)

                        functions.append(FunctionNode(
                            name=func_name,
                            args=args,
                            complexity_score=complexity,
                            line_start=node.start_point[0] + 1,
                            line_end=node.end_point[0] + 1,
                            file_path=relative_path,
                            repo_id=repo_id,
                            parent_class=parent_class,
                            calls=calls
                        ))

        # Import statements: import X from 'module' or import { X } from 'module'
        elif node.type == "import_statement":
            source_node = node.child_by_field_name("source")
            if source_node:
                # Remove quotes from the string
                raw = source_code[source_node.start_byte:source_node.end_byte].decode()
                module = raw.strip("'\"")
                imports.append(ImportNode(
                    module_name=module,
                    file_path=relative_path,
                    repo_id=repo_id
                ))

        # Recurse into children
        for child in node.children:
            process_node(child, parent_class)

    process_node(root)
    return classes, functions, imports


# =============================================================================
# Generic Parsing Function for Go, Java, Rust
# =============================================================================

def _parse_generic_file(
    file_path: str,
    relative_path: str,
    repo_id: str,
    parser: Parser
) -> tuple[list[ClassNode], list[FunctionNode], list[ImportNode]]:
    classes: list[ClassNode] = []
    functions: list[FunctionNode] = []
    imports: list[ImportNode] = []

    try:
        with open(file_path, "rb") as f:
            source_code = f.read()
    except Exception as e:
        print(f"⚠ Skipping file {file_path}: {e}")
        return classes, functions, imports

    tree = parser.parse(source_code)
    root = tree.root_node

    CLASS_TAGS = {"class_declaration", "struct_item", "type_declaration", "interface_declaration"}
    FUNC_TAGS = {"function_declaration", "method_declaration", "function_item", "method_definition", "method_spec"}
    IMPORT_TAGS = {"import_declaration", "use_declaration"}

    def traverse(node: Node, parent_class: Optional[str] = None):
        if node.type in CLASS_TAGS:
            name_node = node.child_by_field_name("name") or next((c for c in node.children if "ident" in c.type or "name" in c.type), None)
            class_name = source_code[name_node.start_byte:name_node.end_byte].decode() if name_node else f"Anon_{node.id}"
            classes.append(ClassNode(
                name=class_name,
                line_start=node.start_point[0] + 1,
                line_end=node.end_point[0] + 1,
                file_path=relative_path,
                repo_id=repo_id,
                bases=[]
            ))
            for child in node.children:
                traverse(child, class_name)
            return

        elif node.type in FUNC_TAGS:
            name_node = node.child_by_field_name("name") or next((c for c in node.children if "ident" in c.type or "name" in c.type), None)
            func_name = source_code[name_node.start_byte:name_node.end_byte].decode() if name_node else f"Anon_{node.id}"
            
            raw_text = source_code[node.start_byte:node.end_byte].decode(errors="ignore")
            complexity = 1 + sum(raw_text.count(kw) for kw in (" if ", " for ", " while ", " catch ", " match ", " else if "))
            
            functions.append(FunctionNode(
                name=func_name,
                args=[],
                complexity_score=max(1, complexity),
                line_start=node.start_point[0] + 1,
                line_end=node.end_point[0] + 1,
                file_path=relative_path,
                repo_id=repo_id,
                parent_class=parent_class,
                calls=[]
            ))
            return 

        elif node.type in IMPORT_TAGS:
            raw_text = source_code[node.start_byte:node.end_byte].decode(errors="ignore")
            module = raw_text.replace("import ", "").replace("use ", "").replace(";", "").strip()
            module = module.split(" ")[0].split("\n")[0]
            if module:
                imports.append(ImportNode(
                    module_name=module,
                    file_path=relative_path,
                    repo_id=repo_id
                ))

        for child in node.children:
            traverse(child, parent_class)

    traverse(root)
    return classes, functions, imports


# =============================================================================
# Main Parsing Function
# =============================================================================

def parse_codebase(repo_path: str, repo_id: str) -> GraphData:
    """
    Parse an entire codebase and extract graph data.
    Supports Python, JavaScript, and TypeScript.
    
    Args:
        repo_path: Path to the cloned repository
        repo_id: Unique identifier for the repository
        
    Returns:
        GraphData containing all extracted nodes
    """
    graph_data = GraphData(repo_id=repo_id)
    python_parser = _get_python_parser()
    js_parser = _get_js_parser()
    ts_parser = _get_ts_parser()
    go_parser = _get_go_parser()
    java_parser = _get_java_parser()
    rust_parser = _get_rust_parser()
    
    repo_path_obj = Path(repo_path)
    
    # Directories to skip
    skip_dirs = {".git", "__pycache__", "node_modules", ".venv", "venv", ".tox", "dist", "build", ".next", "target", "vendor"}
    
    for root, dirs, files in os.walk(repo_path_obj):
        # Skip excluded directories
        dirs[:] = [d for d in dirs if d not in skip_dirs]
        
        for file_name in files:
            file_path_full = os.path.join(root, file_name)
            relative_path = os.path.relpath(file_path_full, repo_path_obj)
            
            language = _detect_language(file_path_full)
            if language is None:
                continue  # Skip unsupported file types
            
            # Create File node
            graph_data.files.append(FileNode(
                name=file_name,
                path=relative_path,
                language=language,
                repo_id=repo_id
            ))
            
            # Parse based on language
            if language == "python":
                classes, functions, imports = _parse_python_file(
                    file_path_full, relative_path, repo_id, python_parser
                )
            elif language == "javascript" and js_parser:
                classes, functions, imports = _parse_js_ts_file(
                    file_path_full, relative_path, repo_id, js_parser
                )
            elif language == "typescript" and ts_parser:
                classes, functions, imports = _parse_js_ts_file(
                    file_path_full, relative_path, repo_id, ts_parser
                )
            elif language == "go" and go_parser:
                classes, functions, imports = _parse_generic_file(
                    file_path_full, relative_path, repo_id, go_parser
                )
            elif language == "java" and java_parser:
                classes, functions, imports = _parse_generic_file(
                    file_path_full, relative_path, repo_id, java_parser
                )
            elif language == "rust" and rust_parser:
                classes, functions, imports = _parse_generic_file(
                    file_path_full, relative_path, repo_id, rust_parser
                )
            else:
                continue

            graph_data.classes.extend(classes)
            graph_data.functions.extend(functions)
            graph_data.imports.extend(imports)
    
    print(f"✓ Parsed codebase: {len(graph_data.files)} files, "
          f"{len(graph_data.classes)} classes, {len(graph_data.functions)} functions, "
          f"{len(graph_data.imports)} imports")
    
    return graph_data


# =============================================================================
# Neo4j Batch Insertion (Improvement #5 — UNWIND-based batches)
# =============================================================================

BATCH_SIZE = 200  # Max items per UNWIND batch


def _batch_list(items: list, size: int = BATCH_SIZE) -> list[list]:
    """Split a list into chunks of `size`."""
    return [items[i:i + size] for i in range(0, len(items), size)]


def insert_into_neo4j(graph_data: GraphData) -> dict[str, Any]:
    """
    Insert extracted graph data into Neo4j using batched UNWIND queries.
    
    Args:
        graph_data: GraphData containing all nodes and relationships
        
    Returns:
        Summary of inserted nodes and relationships
    """
    repo_id = graph_data.repo_id
    stats = {
        "files": 0,
        "classes": 0,
        "functions": 0,
        "imports": 0,
        "contains_relationships": 0,
        "calls_relationships": 0,
        "inherits_relationships": 0,
        "imports_relationships": 0,
    }
    
    # Create constraint indexes for better performance (idempotent)
    _create_indexes()
    
    # ── Batch insert File nodes ──
    file_rows = [
        {"name": f.name, "path": f.path, "language": f.language, "repo_id": repo_id}
        for f in graph_data.files
    ]
    for batch in _batch_list(file_rows):
        neo4j_driver.execute_write("""
            UNWIND $rows AS row
            MERGE (f:File {path: row.path, repo_id: row.repo_id})
            SET f.name = row.name, f.language = row.language
        """, {"rows": batch})
        stats["files"] += len(batch)

    # ── Batch insert Class nodes + CONTAINS ──
    class_rows = [
        {
            "name": c.name,
            "line_start": c.line_start,
            "line_end": c.line_end,
            "file_path": c.file_path,
            "repo_id": repo_id,
        }
        for c in graph_data.classes
    ]
    for batch in _batch_list(class_rows):
        neo4j_driver.execute_write("""
            UNWIND $rows AS row
            MERGE (c:Class {name: row.name, file_path: row.file_path, repo_id: row.repo_id})
            SET c.line_start = row.line_start, c.line_end = row.line_end
            WITH c, row
            MATCH (f:File {path: row.file_path, repo_id: row.repo_id})
            MERGE (f)-[:CONTAINS]->(c)
        """, {"rows": batch})
        stats["classes"] += len(batch)
        stats["contains_relationships"] += len(batch)

    # ── Batch insert Function nodes + CONTAINS ──
    func_rows = []
    for fn in graph_data.functions:
        func_id = f"{fn.file_path}:{fn.name}"
        if fn.parent_class:
            func_id = f"{fn.file_path}:{fn.parent_class}.{fn.name}"
        func_rows.append({
            "func_id": func_id,
            "name": fn.name,
            "args": fn.args,
            "complexity_score": fn.complexity_score,
            "line_start": fn.line_start,
            "line_end": fn.line_end,
            "file_path": fn.file_path,
            "parent_class": fn.parent_class,
            "repo_id": repo_id,
        })

    for batch in _batch_list(func_rows):
        # Insert function nodes
        neo4j_driver.execute_write("""
            UNWIND $rows AS row
            MERGE (fn:Function {func_id: row.func_id, repo_id: row.repo_id})
            SET fn.name = row.name,
                fn.args = row.args,
                fn.complexity_score = row.complexity_score,
                fn.line_start = row.line_start,
                fn.line_end = row.line_end,
                fn.file_path = row.file_path,
                fn.parent_class = row.parent_class
        """, {"rows": batch})
        stats["functions"] += len(batch)

        # CONTAINS from File (for top-level functions)
        top_level = [r for r in batch if r["parent_class"] is None]
        if top_level:
            neo4j_driver.execute_write("""
                UNWIND $rows AS row
                MATCH (f:File {path: row.file_path, repo_id: row.repo_id})
                MATCH (fn:Function {func_id: row.func_id, repo_id: row.repo_id})
                MERGE (f)-[:CONTAINS]->(fn)
            """, {"rows": top_level})
            stats["contains_relationships"] += len(top_level)

        # CONTAINS from Class (for methods)
        methods = [r for r in batch if r["parent_class"] is not None]
        if methods:
            neo4j_driver.execute_write("""
                UNWIND $rows AS row
                MATCH (c:Class {name: row.parent_class, file_path: row.file_path, repo_id: row.repo_id})
                MATCH (fn:Function {func_id: row.func_id, repo_id: row.repo_id})
                MERGE (c)-[:CONTAINS]->(fn)
            """, {"rows": methods})
            stats["contains_relationships"] += len(methods)

    # ── Batch insert Import nodes + IMPORTS ──
    import_rows = [
        {"module_name": i.module_name, "file_path": i.file_path, "repo_id": repo_id}
        for i in graph_data.imports
    ]
    for batch in _batch_list(import_rows):
        neo4j_driver.execute_write("""
            UNWIND $rows AS row
            MERGE (i:Import {module_name: row.module_name, repo_id: row.repo_id})
            WITH i, row
            MATCH (f:File {path: row.file_path, repo_id: row.repo_id})
            MERGE (f)-[:IMPORTS]->(i)
        """, {"rows": batch})
        stats["imports"] += len(batch)
        stats["imports_relationships"] += len(batch)
    
    # ── CALLS relationships (batched) ──
    _create_calls_relationships_batch(graph_data, stats)
    
    # ── INHERITS_FROM relationships (batched) ──
    _create_inheritance_relationships_batch(graph_data, stats)
    
    print(f"✓ Inserted into Neo4j: {stats}")
    return stats


def _create_indexes() -> None:
    """Create indexes for better query performance."""
    indexes = [
        "CREATE INDEX IF NOT EXISTS FOR (f:File) ON (f.path, f.repo_id)",
        "CREATE INDEX IF NOT EXISTS FOR (c:Class) ON (c.name, c.repo_id)",
        "CREATE INDEX IF NOT EXISTS FOR (fn:Function) ON (fn.func_id, fn.repo_id)",
        "CREATE INDEX IF NOT EXISTS FOR (i:Import) ON (i.module_name, i.repo_id)",
    ]
    for query in indexes:
        try:
            neo4j_driver.execute_write(query)
        except Exception:
            pass  # Index might already exist


def _create_calls_relationships_batch(graph_data: GraphData, stats: dict[str, int]) -> None:
    """Create CALLS relationships between functions using batch UNWIND."""
    # Build lookup of function names to func_ids
    func_lookup: dict[str, list[str]] = {}
    for func in graph_data.functions:
        func_id = f"{func.file_path}:{func.name}"
        if func.parent_class:
            func_id = f"{func.file_path}:{func.parent_class}.{func.name}"
        if func.name not in func_lookup:
            func_lookup[func.name] = []
        func_lookup[func.name].append(func_id)

    # Build batch of caller→callee pairs
    call_rows = []
    for func in graph_data.functions:
        caller_id = f"{func.file_path}:{func.name}"
        if func.parent_class:
            caller_id = f"{func.file_path}:{func.parent_class}.{func.name}"
        for called_name in func.calls:
            if called_name in func_lookup:
                for callee_id in func_lookup[called_name]:
                    call_rows.append({
                        "caller_id": caller_id,
                        "callee_id": callee_id,
                        "repo_id": graph_data.repo_id,
                    })

    for batch in _batch_list(call_rows):
        neo4j_driver.execute_write("""
            UNWIND $rows AS row
            MATCH (caller:Function {func_id: row.caller_id, repo_id: row.repo_id})
            MATCH (callee:Function {func_id: row.callee_id, repo_id: row.repo_id})
            MERGE (caller)-[:CALLS]->(callee)
        """, {"rows": batch})
        stats["calls_relationships"] += len(batch)


def _create_inheritance_relationships_batch(graph_data: GraphData, stats: dict[str, int]) -> None:
    """Create INHERITS_FROM relationships between classes using batch UNWIND."""
    class_names = {c.name for c in graph_data.classes}

    inherit_rows = []
    for class_node in graph_data.classes:
        for base_name in class_node.bases:
            if base_name in class_names:
                inherit_rows.append({
                    "child_name": class_node.name,
                    "parent_name": base_name,
                    "repo_id": graph_data.repo_id,
                })

    for batch in _batch_list(inherit_rows):
        neo4j_driver.execute_write("""
            UNWIND $rows AS row
            MATCH (child:Class {name: row.child_name, repo_id: row.repo_id})
            MATCH (parent:Class {name: row.parent_name, repo_id: row.repo_id})
            MERGE (child)-[:INHERITS_FROM]->(parent)
        """, {"rows": batch})
        stats["inherits_relationships"] += len(batch)


# =============================================================================
# High-Level Ingestion Pipeline
# =============================================================================

def extract_file_dates(repo_path: str) -> dict[str, dict[str, str]]:
    """
    Extract first-seen and last-modified dates per file from git log.
    Returns {relative_path: {"first_seen": ISO date, "last_modified": ISO date}}
    """
    dates: dict[str, dict[str, str]] = {}
    try:
        result = subprocess.run(
            ["git", "log", "--format=%aI", "--name-only", "--diff-filter=A"],
            cwd=repo_path, capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            current_date = ""
            for line in result.stdout.strip().split("\n"):
                line = line.strip()
                if not line:
                    continue
                if line.startswith("20"):  # ISO date
                    current_date = line[:10]
                elif current_date:
                    dates[line] = {"first_seen": current_date, "last_modified": current_date}

        result2 = subprocess.run(
            ["git", "log", "-1", "--format=%aI", "--name-only"],
            cwd=repo_path, capture_output=True, text=True, timeout=30
        )
        if result2.returncode == 0:
            lines = result2.stdout.strip().split("\n")
            if lines:
                latest_date = lines[0].strip()[:10]
                for line in lines[1:]:
                    fname = line.strip()
                    if fname and not fname.startswith("20"):
                        if fname in dates:
                            dates[fname]["last_modified"] = latest_date
                        else:
                            dates[fname] = {"first_seen": latest_date, "last_modified": latest_date}
    except Exception:
        pass
    return dates


def _store_file_dates(repo_id: str, file_dates: dict[str, dict[str, str]]) -> None:
    """Store first_seen and last_modified on File nodes in Neo4j."""
    if not file_dates:
        return
    try:
        with neo4j_driver.get_session() as session:
            for path, dates in file_dates.items():
                session.run(
                    """
                    MATCH (f:File {repo_id: $repo_id, path: $path})
                    SET f.first_seen = $first_seen, f.last_modified = $last_modified
                    """,
                    {"repo_id": repo_id, "path": path,
                     "first_seen": dates["first_seen"],
                     "last_modified": dates["last_modified"]}
                )
    except Exception as e:
        print(f"⚠ Could not store file dates: {e}")


async def ingest_repository(github_url: str) -> dict[str, Any]:
    """
    Full ingestion pipeline: clone -> parse -> insert into Neo4j.

    Args:
        github_url: GitHub repository URL

    Returns:
        Dictionary with repo_id and stats
    """
    repo_path = None
    try:
        # Step 1: Clone repository
        repo_id, repo_path = clone_repo(github_url)

        # Step 2: Parse codebase
        graph_data = parse_codebase(repo_path, repo_id)

        # Step 3: Insert into Neo4j
        stats = insert_into_neo4j(graph_data)

        # Step 4: Extract and store file dates for timeline
        file_dates = extract_file_dates(repo_path)
        _store_file_dates(repo_id, file_dates)

        # Step 5: Register repo metadata in SQLite (owner/name for heatmap lookups)
        try:
            from .storage import register_repo
            # Parse owner and repo_name from URL
            # e.g. https://github.com/octocat/Hello-World → owner=octocat, repo_name=Hello-World
            url_clean = str(github_url).rstrip("/").replace(".git", "")
            parts = url_clean.split("/")
            if len(parts) >= 2:
                owner = parts[-2]
                repo_name = parts[-1]
                register_repo(repo_id, github_url, owner, repo_name)
        except Exception as reg_err:
            print(f"⚠ Could not register repo metadata: {reg_err}")

        return {
            "repo_id": repo_id,
            "status": "success",
            "stats": stats
        }

    finally:
        # Clean up cloned repo
        if repo_path:
            cleanup_repo(repo_path)
