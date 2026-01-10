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
        
        result.append({
            'bucket_id': idx,
            'items': [
                {
                    'input_type': item.input_type,
                    'text_preview': item.normalized_text,  # CRITICAL FIX: Show full text in preview (was truncated to 100 chars)
                    'normalized_text': item.normalized_text,  # Store full text for LLM processing
                    'original_data': item.original_data
                }
                for item in cluster
            ],
            'item_count': len(cluster),
            'input_types': list(set(item.input_type for item in cluster))
        })
    
    return result


async def cluster_inputs_with_history(
    inputs: List[InputItem], 
    previous_clusters: List[Dict] = None,
    threshold: float = 0.4
) -> List[Dict]:
    """
    Cluster inputs, comparing against previous clusters from session history.
    Appends to existing clusters if similar, creates new ones if not.
    """
    
    if not inputs:
        return previous_clusters or []
    
    # If no previous clusters, use standard clustering
    if not previous_clusters:
        return await cluster_inputs_advanced(inputs, threshold)
    
    # Get embeddings for new inputs
    new_texts = [item.normalized_text for item in inputs]
    new_embeddings = await get_embeddings(new_texts)
    
    # Get embeddings for existing clusters (use representative text)
    existing_cluster_texts = []
    existing_cluster_embeddings = []
    
    for cluster in previous_clusters:
        # Get representative text from cluster (first item or combined)
        # CRITICAL FIX: Use normalized_text (full text) instead of text_preview (truncated)
        cluster_text = " ".join([
            item.get('normalized_text', item.get('text_preview', ''))
            for item in cluster.get('items', [])
        ])
        existing_cluster_texts.append(cluster_text)
    
    if existing_cluster_texts:
        existing_cluster_embeddings = await get_embeddings(existing_cluster_texts)
    
    # Track which new inputs have been assigned
    assigned = [False] * len(inputs)
    updated_clusters = []
    
    # Try to match new inputs to existing clusters
    for cluster_idx, cluster in enumerate(previous_clusters):
        # Get cluster embedding if available
        cluster_embedding = None
        if existing_cluster_embeddings is not None and len(existing_cluster_embeddings) > cluster_idx:
            cluster_embedding = existing_cluster_embeddings[cluster_idx]
        
        # Find new inputs similar to this cluster
        matched_items = []
        for i, (item, new_emb) in enumerate(zip(inputs, new_embeddings)):
            if assigned[i]:
                continue
            
            if cluster_embedding is not None:
                similarity = cosine_similarity(new_emb, cluster_embedding)
                if similarity >= threshold:
                    matched_items.append((i, item))
                    assigned[i] = True
        
        # If matches found, append to existing cluster
        if matched_items:
            # Update cluster with new items
            updated_cluster = cluster.copy()
            for idx, item in matched_items:
                updated_cluster['items'].append({
                    'input_type': item.input_type,
                    'text_preview': item.normalized_text,  # CRITICAL FIX: Show full text in preview (was truncated to 100 chars)
                    'normalized_text': item.normalized_text,  # Store full text for LLM processing
                    'original_data': item.original_data
                })
            updated_cluster['item_count'] = len(updated_cluster['items'])
            updated_cluster['input_types'] = list(set(
                item.get('input_type') for item in updated_cluster['items']
            ))
            updated_clusters.append(updated_cluster)
        else:
            # No matches, keep existing cluster as is
            updated_clusters.append(cluster)
    
    # Create new clusters for unassigned inputs
    unassigned_items = [inputs[i] for i in range(len(inputs)) if not assigned[i]]
    if unassigned_items:
        # Cluster unassigned items together
        new_clusters = await cluster_inputs_advanced(unassigned_items, threshold)
        # Assign new bucket IDs (continue from previous)
        max_bucket_id = max([c.get('bucket_id', -1) for c in previous_clusters], default=-1)
        for cluster in new_clusters:
            cluster['bucket_id'] = max_bucket_id + 1
            max_bucket_id += 1
        updated_clusters.extend(new_clusters)
    
    return updated_clusters
