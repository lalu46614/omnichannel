from typing import List, Dict, Optional, Any
from datetime import datetime
from semantic.clustering import InputItem, cluster_inputs_advanced
from semantic.embeddings import get_embeddings, cosine_similarity
from context.envelope import ContextEnvelope, ClusterEnvelope, ConversationHistory
from schemas.models import Metadata
from history.memory_store import history_store
import numpy as np

class ContextEnvelopeConstructor:

    def __init__(self):
        # Future: Inject conversation history service
        self.history_service = None  # Will be implemented later
    
    async def construct_envelope(self,input_items: List[InputItem],clusters: List[Dict],metadata: Metadata,input_id: str,alternative_interpretations: Optional[List[List[Dict]]] = None,conflicts: Optional[List[Dict]] = None) -> ContextEnvelope:
        
        reasoning_trace = []
        reasoning_trace.append(f"Constructing context envelope for input {input_id}")
        
        # 1. Build cluster envelopes with enriched information
        cluster_envelopes = await self._build_cluster_envelopes(
            input_items, clusters, reasoning_trace
        )
        
        # 2. Retrieve conversation history (if session_id exists)
        conversation_history = await self._get_conversation_history(
            metadata.session_id, metadata.user_id, reasoning_trace
        )
        
        # 3. Analyze cluster relationships
        cluster_relationships = await self._analyze_cluster_relationships(
            cluster_envelopes, reasoning_trace
        )
        
        # 4. Detect if tools are needed
        requires_tools = self._detect_tool_requirements(cluster_envelopes)
        
        # 5. Assess complexity and urgency
        complexity = self._assess_complexity(cluster_envelopes)
        urgency = self._assess_urgency(cluster_envelopes, metadata)
        
        # 6. Build alternative interpretation envelopes (if provided)
        alt_envelopes = []
        if alternative_interpretations:
            for alt_clusters in alternative_interpretations:
                alt_envelopes.append(
                    await self._build_cluster_envelopes(
                        input_items, alt_clusters, reasoning_trace
                    )
                )
        
        reasoning_trace.append(f"Envelope construction complete: {len(cluster_envelopes)} clusters")
        
        return ContextEnvelope(
            input_id=input_id,
            timestamp=datetime.now(),
            metadata={
                "channel": metadata.channel,
                "user_id": str(metadata.user_id) if metadata.user_id else None,
                "session_id": str(metadata.session_id) if metadata.session_id else None,
            },
            cluster_envelopes=cluster_envelopes,
            conversation_history=conversation_history,
            alternative_interpretations=alt_envelopes,
            conflicts=conflicts or [],
            cluster_relationships=cluster_relationships,
            requires_tools=requires_tools,
            estimated_complexity=complexity,
            urgency=urgency,
            reasoning_trace=reasoning_trace
        )
    
    async def _build_cluster_envelopes(self,input_items: List[InputItem],clusters: List[Dict],reasoning_trace: List[str]) -> List[ClusterEnvelope]:

        cluster_envelopes = []
        
        for cluster in clusters:
            # Get all normalized texts for this cluster from cluster items directly
            cluster_texts = []
            for cluster_item in cluster.get('items', []):
                # Extract text from cluster item
                if 'text_preview' in cluster_item:
                    cluster_texts.append(cluster_item['text_preview'])
                elif 'original_data' in cluster_item and 'gateway_output' in cluster_item['original_data']:
                    # Fallback to raw_text from gateway_output
                    gw_output = cluster_item['original_data']['gateway_output']
                    if 'raw_text' in gw_output:
                        cluster_texts.append(gw_output['raw_text'])
            
            combined_text = "\n\n".join(cluster_texts) if cluster_texts else ""
            
            # Future: Generate semantic summary using LLM
            semantic_summary = await self._generate_semantic_summary(combined_text)
            
            reasoning_trace.append(
                f"Built envelope for cluster {cluster['bucket_id']}: "
                f"{cluster['item_count']} items, types: {cluster['input_types']}"
            )
            
            cluster_envelopes.append(ClusterEnvelope(
                bucket_id=cluster['bucket_id'],
                items=cluster['items'],
                normalized_text=combined_text,
                input_types=cluster['input_types'],
                item_count=cluster['item_count'],
                semantic_summary=semantic_summary,
                confidence_score=1.0,  # Will be adjusted by elicitation
                requires_clarification=False,
                clarification_questions=[]
            ))
        
        return cluster_envelopes
    
    async def _generate_semantic_summary(self, text: str) -> Optional[str]:
        """Generate a brief semantic summary of the cluster intent"""
        # Future: Use lightweight LLM call or extractive summarization
        # For now, return None or first 100 chars
        if len(text) > 200:
            return text[:100] + "..."
        return text
    
    async def _get_conversation_history(self,session_id: Optional[str],user_id: Optional[str],reasoning_trace: List[str]) -> ConversationHistory:
        """Retrieve conversation history for context"""
        if session_id:
            reasoning_trace.append(f"Retrieving history for session {session_id}")
            history_data = history_store.get_history(session_id, limit=10)
            
            return ConversationHistory(
                previous_inputs=history_data['previous_inputs'],
                previous_responses=history_data['previous_responses'],
                session_summary=history_data['session_summary'],
                topics_discussed=history_data['topics_discussed'],
                user_preferences=history_data['user_preferences']
            )
        return ConversationHistory()
    
    async def _analyze_cluster_relationships(self,cluster_envelopes: List[ClusterEnvelope],reasoning_trace: List[str]) -> Dict[str, Any]:
        """Analyze how clusters relate to each other semantically"""
        
        if len(cluster_envelopes) < 2:
            return {"relationship_type": "single_cluster"}
        
        # Get embeddings for each cluster
        cluster_texts = [env.normalized_text for env in cluster_envelopes]
        embeddings = await get_embeddings(cluster_texts)
        
        # Calculate pairwise similarities
        relationships = {
            "relationship_type": "multi_cluster",
            "pairwise_similarities": {},
            "most_similar_pair": None,
            "least_similar_pair": None
        }
        
        max_sim = -1
        min_sim = 2
        max_pair = None
        min_pair = None
        
        for i in range(len(cluster_envelopes)):
            for j in range(i + 1, len(cluster_envelopes)):
                sim = cosine_similarity(embeddings[i], embeddings[j])
                pair_key = f"{i}-{j}"
                relationships["pairwise_similarities"][pair_key] = float(sim)
                
                if sim > max_sim:
                    max_sim = sim
                    max_pair = pair_key
                if sim < min_sim:
                    min_sim = sim
                    min_pair = pair_key
        
        relationships["most_similar_pair"] = max_pair
        relationships["least_similar_pair"] = min_pair
        
        reasoning_trace.append(
            f"Cluster relationships analyzed: {len(cluster_envelopes)} clusters, "
            f"max similarity: {max_sim:.2f}, min: {min_sim:.2f}"
        )
        
        return relationships
    
    def _detect_tool_requirements(self, cluster_envelopes: List[ClusterEnvelope]) -> bool:
        """Detect if this request might need external tools"""
        
        # Simple heuristic: check for keywords that suggest tool usage
        tool_keywords = [
            "search", "lookup", "calculate", "fetch", "get data",
            "api", "database", "query", "retrieve", "find"
        ]
        
        combined_text = " ".join([env.normalized_text.lower() for env in cluster_envelopes])
        
        return any(keyword in combined_text for keyword in tool_keywords)
    
    def _assess_complexity(self, cluster_envelopes: List[ClusterEnvelope]) -> str:
        """Assess the complexity of the request"""
        
        total_items = sum(env.item_count for env in cluster_envelopes)
        total_text_length = sum(len(env.normalized_text) for env in cluster_envelopes)
        
        if len(cluster_envelopes) > 3 or total_items > 5 or total_text_length > 5000:
            return "complex"
        elif len(cluster_envelopes) == 1 and total_items == 1 and total_text_length < 500:
            return "simple"
        else:
            return "medium"
    
    def _assess_urgency(self, cluster_envelopes: List[ClusterEnvelope], metadata: Metadata) -> str:
        """Assess urgency based on content and metadata"""
        
        # Check for urgency keywords
        urgency_keywords = ["urgent", "asap", "immediately", "emergency", "critical"]
        combined_text = " ".join([env.normalized_text.lower() for env in cluster_envelopes])
        
        if any(keyword in combined_text for keyword in urgency_keywords):
            return "high"
        
        # Could also check channel type (e.g., "support" channel = higher urgency)
        if metadata.channel and "support" in metadata.channel.lower():
            return "high"
        
        return "normal"