from groq import Groq
from dotenv import load_dotenv
import os
from typing import Optional, Dict, Any

load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY is not set")

client = Groq(api_key=GROQ_API_KEY)

async def call_llm(prompt: str, context_envelope: Optional[Dict[str, Any]] = None) -> str:
    messages = []
    
    if context_envelope:
        system_context = _format_context(context_envelope)
        messages.append({"role": "system", "content": system_context})
    
    messages.append({"role": "user", "content": prompt})
    
    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=messages,
        temperature=0.2,
    )
    
    return response.choices[0].message.content


def _format_context(envelope: Dict[str, Any]) -> str:
    """Format context envelope into system prompt."""
    parts = []

    parts.append("=== RESPONSE GUIDELINES ===")
    parts.append("Keep responses SHORT and CONVERSATIONAL (2-4 sentences maximum).")
    parts.append("Speak naturally, as if having a casual conversation.")
    parts.append("Avoid long paragraphs or essay-style responses.")
    parts.append("Be concise and to the point.")
    parts.append("")
    
    # Conversation History
    if envelope.get('conversation_history'):
        h = envelope['conversation_history']
        parts.append("=== CONVERSATION HISTORY ===")
        if h.get('session_summary'):
            parts.append(f"Summary: {h['session_summary']}")
        if h.get('topics_discussed'):
            parts.append(f"Topics: {', '.join(h['topics_discussed'])}")
        if h.get('previous_inputs'):
            parts.append("\nRecent Inputs:")
            for inp in h['previous_inputs'][-5:]:
                parts.append(f"  - {inp.get('text', 'N/A')}")
        parts.append("")
    
    # Cluster Info
    if envelope.get('cluster_envelopes'):
        parts.append("=== CURRENT CLUSTERS ===")
        for c in envelope['cluster_envelopes']:
            parts.append(f"Cluster {c.get('bucket_id')}: {c.get('item_count', 0)} items")
        parts.append("")
    
    # Instructions
    parts.append("Use conversation history to provide context-aware responses.")
    
    return "\n".join(parts)