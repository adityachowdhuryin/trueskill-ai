"""
Pytest configuration for TrueSkill AI tests.
"""
import sys
import os

# Add backend directory to path so app modules are importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
