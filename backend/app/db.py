"""
Neo4j Database Connection Module
Handles connection to the Neo4j graph database for storing code structure.
"""

import os
from contextlib import contextmanager
from typing import Generator, Any, Optional, Union

from neo4j import GraphDatabase, Driver, Session
from pydantic_settings import BaseSettings


class Neo4jSettings(BaseSettings):
    """Neo4j connection settings loaded from environment variables"""
    
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "trueskill_password"
    
    class Config:
        env_file = ".env"
        extra = "ignore"


class Neo4jConnection:
    """
    Neo4j database connection manager.
    Implements singleton pattern for connection reuse.
    """
    
    _instance: Optional["Neo4jConnection"] = None
    _driver: Optional[Driver] = None
    
    def __new__(cls) -> "Neo4jConnection":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._driver is None:
            settings = Neo4jSettings()
            self._driver = GraphDatabase.driver(
                settings.neo4j_uri,
                auth=(settings.neo4j_user, settings.neo4j_password)
            )
    
    @property
    def driver(self) -> Driver:
        """Get the Neo4j driver instance"""
        if self._driver is None:
            raise RuntimeError("Neo4j driver not initialized")
        return self._driver
    
    def close(self) -> None:
        """Close the Neo4j driver connection"""
        if self._driver is not None:
            self._driver.close()
            self._driver = None
    
    def verify_connectivity(self) -> bool:
        """
        Verify that the connection to Neo4j is working.
        Returns True if connected, False otherwise.
        """
        try:
            self.driver.verify_connectivity()
            return True
        except Exception as e:
            print(f"Neo4j connectivity check failed: {e}")
            return False
    
    @contextmanager
    def get_session(self, database: str = "neo4j") -> Generator[Session, None, None]:
        """
        Context manager for Neo4j sessions.
        Ensures proper session cleanup after use.
        
        Usage:
            with neo4j_driver.get_session() as session:
                result = session.run("MATCH (n) RETURN n LIMIT 10")
        """
        session = self.driver.session(database=database)
        try:
            yield session
        finally:
            session.close()
    
    def execute_query(
        self, 
        query: str, 
        parameters: Optional[dict[str, Any]] = None,
        database: str = "neo4j"
    ) -> list[dict[str, Any]]:
        """
        Execute a Cypher query and return results as a list of dictionaries.
        
        Args:
            query: Cypher query string
            parameters: Optional query parameters
            database: Target database name
            
        Returns:
            List of result records as dictionaries
        """
        with self.get_session(database=database) as session:
            result = session.run(query, parameters or {})
            return [record.data() for record in result]
    
    def execute_write(
        self,
        query: str,
        parameters: Optional[dict[str, Any]] = None,
        database: str = "neo4j"
    ) -> dict[str, Any]:
        """
        Execute a write transaction and return summary info.
        
        Args:
            query: Cypher query string for write operation
            parameters: Optional query parameters
            database: Target database name
            
        Returns:
            Dictionary with counters from the result summary
        """
        with self.get_session(database=database) as session:
            result = session.run(query, parameters or {})
            summary = result.consume()
            return {
                "nodes_created": summary.counters.nodes_created,
                "nodes_deleted": summary.counters.nodes_deleted,
                "relationships_created": summary.counters.relationships_created,
                "relationships_deleted": summary.counters.relationships_deleted,
                "properties_set": summary.counters.properties_set,
            }


# Global driver instance
neo4j_driver = Neo4jConnection()


# Convenience functions for common graph operations
def create_file_node(
    name: str, 
    path: str, 
    language: str
) -> dict[str, Any]:
    """Create a File node in the graph"""
    query = """
    CREATE (f:File {name: $name, path: $path, language: $language})
    RETURN f
    """
    return neo4j_driver.execute_write(query, {
        "name": name,
        "path": path,
        "language": language
    })


def create_function_node(
    name: str,
    args: list[str],
    complexity_score: int,
    line_start: int,
    line_end: int
) -> dict[str, Any]:
    """Create a Function node in the graph"""
    query = """
    CREATE (fn:Function {
        name: $name, 
        args: $args, 
        complexity_score: $complexity_score,
        line_start: $line_start,
        line_end: $line_end
    })
    RETURN fn
    """
    return neo4j_driver.execute_write(query, {
        "name": name,
        "args": args,
        "complexity_score": complexity_score,
        "line_start": line_start,
        "line_end": line_end
    })


def create_class_node(
    name: str,
    line_start: int,
    line_end: int
) -> dict[str, Any]:
    """Create a Class node in the graph"""
    query = """
    CREATE (c:Class {name: $name, line_start: $line_start, line_end: $line_end})
    RETURN c
    """
    return neo4j_driver.execute_write(query, {
        "name": name,
        "line_start": line_start,
        "line_end": line_end
    })


def link_file_contains(file_path: str, node_name: str, node_type: str) -> dict[str, Any]:
    """Create a CONTAINS relationship between a File and a Class/Function"""
    query = f"""
    MATCH (f:File {{path: $file_path}})
    MATCH (n:{node_type} {{name: $node_name}})
    CREATE (f)-[:CONTAINS]->(n)
    """
    return neo4j_driver.execute_write(query, {
        "file_path": file_path,
        "node_name": node_name
    })


def query_graph(cypher_query: str, params: Optional[dict[str, Any]] = None) -> list[dict[str, Any]]:
    """
    Execute an arbitrary Cypher query - used by the Auditor agent.
    
    This is the main interface for the Verification Loop workflow
    where the Auditor queries the graph to find evidence for claims.
    """
    return neo4j_driver.execute_query(cypher_query, params)
