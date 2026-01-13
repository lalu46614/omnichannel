from typing import Dict, Literal
import json
import re
from llm.groq_client import call_llm

def parse_sentiment_result(result: str) -> Dict:
    """
    Parse LLM response to extract sentiment analysis JSON.
    Handles cases where response may contain markdown or extra text.
    """
    # Try to extract JSON from the response
    # Look for JSON object in the text
    json_match = re.search(r'\{[^{}]*\}', result, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass
    
    # Fallback: return default neutral sentiment
    return {
        "sentiment": "neutral",
        "tone": "neutral",
        "pitch_trend": "stable",
        "urgency": 0.5,
        "emotional_intensity": 0.5
    }

async def analyze_sentiment_and_tone(text: str) -> Dict:
    """
    Analyze user input for sentiment, tone, and para-linguistic cues.
    Returns: {
        "sentiment": "frustrated" | "excited" | "neutral" | "sarcastic" | "calm",
        "tone": "sarcastic" | "enthusiastic" | "apologetic" | "neutral",
        "pitch_trend": "dropping" | "rising" | "stable",
        "urgency": float (0-1),
        "emotional_intensity": float (0-1)
    }
    """
    prompt = f"""Analyze this user input for sentiment and tone. Return JSON only:
{{
    "sentiment": "frustrated|excited|neutral|sarcastic|calm",
    "tone": "sarcastic|enthusiastic|apologetic|neutral",
    "pitch_trend": "dropping|rising|stable",
    "urgency": 0.0-1.0,
    "emotional_intensity": 0.0-1.0
}}

User input: "{text}"
"""
    result = await call_llm(prompt)
    # Parse JSON response
    return parse_sentiment_result(result)