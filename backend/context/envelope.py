from typing import List, Dict, Optional, Any
from datetime import datetime
from pydantic import BaseModel, Field
from semantic.clustering import InputItem

class ClusterEnvelope(BaseModel):

    bucket_id: int
    items: List[Dict]  # Original cluster items
    normalized_text: str  # Combined text from all items in cluster
    input_types: List[str]
    item_count: int
    semantic_summary: Optional[str] = None  # LLM-generated summary of cluster intent
    confidence_score: float = 1.0  # Confidence in this interpretation
    requires_clarification: bool = False
    clarification_questions: List[str] = []

class ConversationHistory(BaseModel):

    previous_inputs: List[Dict] = []
    previous_responses: List[Dict] = []
    session_summary: Optional[str] = None  # High-level session summary
    topics_discussed: List[str] = []
    user_preferences: Dict[str, Any] = {}

class ContextEnvelope(BaseModel):

    input_id: str
    timestamp: datetime
    metadata: Dict[str, Any]  # channel, user_id, session_id
    
    # Current input clusters
    cluster_envelopes: List[ClusterEnvelope]
    
    # Conversation context
    conversation_history: ConversationHistory
    
    # Multi-interpretation handling (from elicitation)
    alternative_interpretations: List[List[ClusterEnvelope]] = []
    conflicts: List[Dict] = []  # Detected conflicts between clusters
    
    # Semantic relationships
    cluster_relationships: Dict[str, Any] = {}  # How clusters relate to each other
    
    # Contextual metadata
    estimated_complexity: str = "medium"  # simple, medium, complex
    
    # For explainability
    reasoning_trace: List[str] = []  # Steps taken to build this envelope