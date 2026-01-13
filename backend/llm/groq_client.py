from groq import Groq
from dotenv import load_dotenv
import os
from typing import Optional, Dict, Any

load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY is not set")

client = Groq(api_key=GROQ_API_KEY)

async def call_llm(
    prompt: str, 
    context_envelope: Optional[Dict[str, Any]] = None,
    user_sentiment: Optional[Dict[str, Any]] = None
) -> str:
    messages = []
    
    if context_envelope:
        system_context = _format_context(context_envelope, user_sentiment)
        messages.append({"role": "system", "content": system_context})
    
    messages.append({"role": "user", "content": prompt})
    
    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=messages,
        temperature=0.2,
        max_tokens=150,  # Keep responses short
    )
    
    return response.choices[0].message.content


def _format_context(envelope: Dict[str, Any], user_sentiment: Optional[Dict[str, Any]] = None) -> str:
    """Format context envelope into system prompt."""
    parts = []

    parts.append("=== RESPONSE GUIDELINES ===")
    parts.append("Keep responses SHORT and CONVERSATIONAL (2-4 sentences maximum).")
    parts.append("Speak naturally, as if having a casual conversation.")
    parts.append("Avoid long paragraphs or essay-style responses.")
    parts.append("Be concise and to the point.")
    parts.append("")
    
    # CRITICAL: Add sentiment-aware response instructions
    if user_sentiment:
        sentiment = user_sentiment.get('sentiment', 'neutral')
        tone = user_sentiment.get('tone', 'neutral')
        emotional_intensity = user_sentiment.get('emotional_intensity', 0.5)
        
        parts.append("=== USER SENTIMENT & EMOTIONAL CONTEXT ===")
        parts.append(f"Detected User Sentiment: {sentiment}")
        parts.append(f"Detected Tone: {tone}")
        parts.append(f"Emotional Intensity: {emotional_intensity:.1f}")
        parts.append("")
        parts.append("=== SENTIMENT-AWARE RESPONSE INSTRUCTIONS ===")
        
        if sentiment == 'frustrated':
            parts.append("The user is FRUSTRATED. Respond with:")
            parts.append("- Empathy and understanding")
            parts.append("- Apologetic tone (e.g., 'I'm really sorry you're experiencing this...')")
            parts.append("- Calm, reassuring language")
            parts.append("- Focus on helping solve their problem")
            parts.append("- Avoid being dismissive or overly technical")
            
        elif sentiment == 'excited':
            parts.append("The user is EXCITED. Respond with:")
            parts.append("- Enthusiasm and positive energy")
            parts.append("- Matching their excitement level")
            parts.append("- Encouraging and supportive language")
            parts.append("- Celebrate their enthusiasm")
            
        elif sentiment == 'sarcastic':
            parts.append("The user is being SARCASTIC. Respond with:")
            parts.append("- Acknowledge their tone (e.g., 'I sense some frustration...')")
            parts.append("- Empathetic understanding")
            parts.append("- Address underlying concerns")
            parts.append("- Be genuine and helpful, not dismissive")
            
        elif sentiment == 'calm':
            parts.append("The user is CALM. Respond with:")
            parts.append("- Professional, clear communication")
            parts.append("- Match their calm demeanor")
            parts.append("- Direct and helpful")
            
        else:  # neutral
            parts.append("The user is NEUTRAL. Respond with:")
            parts.append("- Professional and helpful")
            parts.append("- Clear and concise")
        
        parts.append("")
        parts.append("IMPORTANT: Adapt your response CONTENT and TONE based on the user's sentiment.")
        parts.append("If frustrated → be empathetic and apologetic. If excited → match their energy.")
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