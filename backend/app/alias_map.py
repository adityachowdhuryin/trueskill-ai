"""
Library Alias Map — maps common/marketing names to actual Python import names.

The verification pipeline searches Neo4j for keywords matching the claim topic.
The problem: resumes say "PyTorch" but the code says `import torch`.
This map fixes that mismatch so the Cypher query finds real evidence.

To add a new library, append to the relevant section:
    "marketing name (lowercase)": ["actual_import_name", ...]
"""

LIBRARY_ALIAS_MAP: dict[str, list[str]] = {

    # ── Deep Learning Frameworks ───────────────────────────────────────────────
    "pytorch": ["torch", "torchvision", "torchaudio"],
    "tensorflow": ["tensorflow", "tf", "keras"],
    "keras": ["keras", "tensorflow.keras"],
    "jax": ["jax", "jaxlib", "flax", "optax"],

    # ── Machine Learning ────────────────────────────────────────────────────────
    "scikit-learn": ["sklearn", "scikit_learn"],
    "scikit learn": ["sklearn"],
    "sklearn": ["sklearn"],
    "xgboost": ["xgboost", "xgb"],
    "lightgbm": ["lightgbm", "lgb"],
    "catboost": ["catboost"],

    # ── Computer Vision ─────────────────────────────────────────────────────────
    "opencv": ["cv2", "opencv"],
    "computer vision": ["cv2", "pillow", "pil", "imageio", "skimage", "albumentations"],
    "yolo": ["ultralytics", "yolov5", "yolov8"],
    "yolov5": ["ultralytics", "yolov5"],
    "resnet": ["torchvision", "timm", "torch"],
    "resnet50": ["torchvision", "timm", "torch"],
    "u-net": ["segmentation_models", "torch"],
    "unet": ["segmentation_models", "torch"],
    "image segmentation": ["cv2", "segmentation_models", "torchvision"],
    "object detection": ["ultralytics", "cv2", "torchvision"],

    # ── NLP & Transformers ──────────────────────────────────────────────────────
    "hugging face": ["transformers", "datasets", "tokenizers", "huggingface_hub"],
    "huggingface": ["transformers", "datasets", "tokenizers", "huggingface_hub"],
    "transformers": ["transformers", "tokenizers"],
    "bert": ["transformers", "sentence_transformers"],
    "roberta": ["transformers"],
    "distilbert": ["transformers"],
    "gpt": ["openai", "transformers"],
    "nlp": ["nltk", "spacy", "transformers", "gensim", "textblob"],
    "natural language processing": ["nltk", "spacy", "transformers", "gensim"],
    "spacy": ["spacy"],
    "nltk": ["nltk"],
    "sentiment analysis": ["transformers", "nltk", "textblob"],
    "vader": ["vaderSentiment", "nltk"],
    "langchain": ["langchain", "langchain_core", "langchain_groq", "langchain_openai"],
    "langgraph": ["langgraph"],
    "rag": ["langchain", "faiss", "chromadb", "pinecone", "weaviate"],
    "vector database": ["faiss", "chromadb", "pinecone", "qdrant", "weaviate"],
    "llm": ["openai", "anthropic", "langchain", "groq", "transformers"],
    "openai": ["openai"],
    "anthropic": ["anthropic"],

    # ── Data Processing ─────────────────────────────────────────────────────────
    "pandas": ["pandas", "pd"],
    "numpy": ["numpy", "np"],
    "pyspark": ["pyspark"],
    "apache spark": ["pyspark"],
    "spark": ["pyspark"],
    "dask": ["dask"],
    "polars": ["polars"],

    # ── Visualization ───────────────────────────────────────────────────────────
    "matplotlib": ["matplotlib", "plt"],
    "seaborn": ["seaborn", "sns"],
    "plotly": ["plotly"],
    "streamlit": ["streamlit"],
    "gradio": ["gradio"],
    "bokeh": ["bokeh"],

    # ── Databases ───────────────────────────────────────────────────────────────
    "mongodb": ["pymongo", "motor", "mongoengine"],
    "postgresql": ["psycopg2", "psycopg", "asyncpg"],
    "mysql": ["mysql", "mysqlclient", "pymysql"],
    "neo4j": ["neo4j", "py2neo"],
    "redis": ["redis", "aioredis"],
    "elasticsearch": ["elasticsearch"],
    "sqlite": ["sqlite3"],
    "sqlalchemy": ["sqlalchemy"],

    # ── Cloud Platforms ─────────────────────────────────────────────────────────
    "aws": ["boto3", "botocore", "sagemaker"],
    "google cloud": ["google.cloud", "googleapiclient", "firebase_admin"],
    "gcp": ["google.cloud", "firebase_admin"],
    "azure": ["azure", "msrest"],
    "databricks": ["databricks", "pyspark"],
    "google cloud run": ["google.cloud", "googleapiclient"],
    "vertex ai": ["google.cloud", "vertexai"],

    # ── MLOps / Data Engineering ────────────────────────────────────────────────
    "airflow": ["airflow"],
    "mlflow": ["mlflow"],
    "wandb": ["wandb"],
    "kafka": ["kafka", "confluent_kafka"],
    "celery": ["celery"],

    # ── Web Frameworks ──────────────────────────────────────────────────────────
    "fastapi": ["fastapi"],
    "flask": ["flask"],
    "django": ["django"],

    # ── Geospatial ──────────────────────────────────────────────────────────────
    "arcgis": ["arcgis", "arcpy"],
    "geopandas": ["geopandas"],
    "folium": ["folium"],
    "gis": ["geopandas", "shapely", "fiona", "pyproj"],
    "google earth engine": ["ee"],

    # ── DevOps / Infra ──────────────────────────────────────────────────────────
    "docker": ["docker"],
    "kubernetes": ["kubernetes"],
}
