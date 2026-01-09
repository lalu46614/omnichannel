from sentence_transformers import SentenceTransformer
import numpy as np
from typing import List
import asyncio
import hashlib

_model = None
_embedding_cache = {}

def get_embedding_model():
    global _model
    if _model is None:
        print("Loading embedding model (first time only, ~80MB download)...")
        _model = SentenceTransformer('all-MiniLM-L6-v2')
        print("Embedding model loaded!")
    return _model

async def get_embeddings(texts: List[str]) -> np.ndarray:
    # Create cache key from text content
    cache_key = hashlib.md5("|".join(texts).encode()).hexdigest()
    if cache_key in _embedding_cache:
        return _embedding_cache[cache_key]
    
    model = get_embedding_model()
    loop = asyncio.get_event_loop()
    embeddings = await loop.run_in_executor(
        None, 
        lambda: model.encode(texts, convert_to_numpy=True)
    )
    _embedding_cache[cache_key] = embeddings
    return embeddings

def cosine_similarity(emb1: np.ndarray, emb2: np.ndarray) -> float:
    return np.dot(emb1, emb2) / (np.linalg.norm(emb1) * np.linalg.norm(emb2))