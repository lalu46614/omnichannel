import random
import re

DISFLUENCY_PATTERNS = [
    "um",
    "uh", 
    "you know",
    "like",
    "actually",
    "I mean",
]

def inject_disfluencies(text: str, intensity: float = 0.3) -> str:
    """
    Inject natural disfluencies into text.
    intensity: 0.0 (none) to 1.0 (very frequent)
    """
    if not text or len(text.strip()) == 0:
        return text
    
    # Split into sentences
    sentences = re.split(r'([.!?]+\s*)', text)
    sentences = [s for s in sentences if s.strip()]
    
    if not sentences:
        return text
    
    result = []
    
    for sentence in sentences:
        sentence = sentence.strip()
        
        if len(sentence) < 5:
            result.append(sentence)
            continue
        
        # Add disfluency at start of sentence with probability based on intensity
        # With intensity=0.2, about 20% of sentences get a disfluency
        if random.random() < intensity:
            disfluency = random.choice(DISFLUENCY_PATTERNS)
            result.append(f"{disfluency}, ")
        
        result.append(sentence)
    
    return "".join(result)