from typing import List, Dict, Tuple
import numpy as np
from .embeddings import get_embeddings, cosine_similarity

SIMILARITY_THRESHOLD = 0.5  # (0.0-1.0)

class InputItem:
    
    def __init__(self, input_type: str, normalized_text: str, original_data: dict):
        self.input_type = input_type  # 'text', 'audio', 'document'
        self.normalized_text = normalized_text
        self.original_data = original_data  # Store original gateway_output or metadata

async def cluster_inputs(inputs: List[InputItem]) -> List[List[InputItem]]:
    """
    Cluster inputs into buckets based on semantic similarity.
    """
    if len(inputs) == 0:
        return []
    
    if len(inputs) == 1:
        return [[inputs[0]]]
    
    # Extract texts and get embeddings
    texts = [item.normalized_text for item in inputs]
    embeddings = await get_embeddings(texts)
    
    # Build similarity matrix
    n = len(inputs)
    similarity_matrix = np.zeros((n, n))
    
    for i in range(n):
        for j in range(i + 1, n):
            sim = cosine_similarity(embeddings[i], embeddings[j])
            similarity_matrix[i][j] = sim
            similarity_matrix[j][i] = sim
    
    # Simple clustering: group items that are similar to each other
    clusters = []
    used = set()
    
    for i in range(n):
        if i in used:
            continue
            
        # Start a new cluster with this item
        cluster = [inputs[i]]
        cluster_indices = [i]  # Track indices instead of using index()
        used.add(i)
        
        # Find all items similar to this one
        for j in range(i + 1, n):
            if j in used:
                continue
                
            # Check if j is similar to any item in current cluster
            is_similar = any(
                similarity_matrix[cluster_idx][j] >= SIMILARITY_THRESHOLD
                for cluster_idx in cluster_indices
            )
            
            if is_similar:
                cluster.append(inputs[j])
                cluster_indices.append(j)
                used.add(j)
        
        clusters.append(cluster)
    
    return clusters

async def cluster_inputs_advanced(inputs: List[InputItem], threshold: float = 0.6) -> List[Dict]:
    """
    Advanced clustering with more detailed output.
    
    Returns:
        List of cluster dictionaries with metadata
    """
    clusters = await cluster_inputs(inputs)
    
    result = []
    for idx, cluster in enumerate(clusters):
        # Get representative text (first item or most central)
        cluster_texts = [item.normalized_text for item in cluster]
        cluster_embeddings = await get_embeddings(cluster_texts)
        
        # Calculate average embedding for cluster summary
        avg_embedding = np.mean(cluster_embeddings, axis=0)
        
        result.append({
            'bucket_id': idx,
            'items': [
                {
                    'input_type': item.input_type,
                    'text_preview': item.normalized_text[:100] + '...' if len(item.normalized_text) > 100 else item.normalized_text,
                    'original_data': item.original_data
                }
                for item in cluster
            ],
            'item_count': len(cluster),
            'input_types': list(set(item.input_type for item in cluster))
        })
    
    return result