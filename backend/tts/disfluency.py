import random
import re

DISFLUENCY_PATTERNS = [
    "um",
    "uh", 
    "you know",
    "like",
    "actually",
    "I mean",
    "well",
    "so",
]

# Disfluencies that work better mid-sentence
MID_SENTENCE_DISFLUENCIES = [
    "um",
    "uh",
    "like",
    "you know",
    "I mean",
]

# Self-correction patterns: (trigger_phrase, correction_phrase)
SELF_CORRECTION_PATTERNS = [
    ("I think", "actually, I know"),
    ("maybe", "definitely"),
    ("probably", "certainly"),
    ("I guess", "I'm sure"),
    ("kind of", "really"),
    ("sort of", "absolutely"),
    ("a little", "quite a bit"),
    ("not really", "absolutely"),
]

def inject_disfluencies(text: str, intensity: float = 0.3) -> str:
    """
    Inject natural disfluencies into text at sentence start AND mid-sentence.
    Also adds self-corrections for more natural speech.
    intensity: 0.0 (none) to 1.0 (very frequent)
    """
    if not text or len(text.strip()) == 0:
        return text
    
    # Split into sentences (preserving punctuation)
    # This regex splits on sentence endings but keeps the punctuation
    parts = re.split(r'([.!?]+\s*)', text)
    parts = [p for p in parts if p.strip()]
    
    if not parts:
        return text
    
    result = []
    
    for i, part in enumerate(parts):
        part = part.strip()
        
        # Skip very short parts (punctuation only)
        if len(part) < 3:
            result.append(part)
            continue
        
        # Check if this is a sentence (not punctuation)
        is_sentence = not re.match(r'^[.!?]+\s*$', part)
        
        if is_sentence:
            # 1. Add disfluency at START of sentence
            if random.random() < intensity * 0.3:  # 30% of intensity for sentence start
                disfluency = random.choice(DISFLUENCY_PATTERNS)
                result.append(f"{disfluency}, ")
            
            # 2. Process sentence for mid-sentence disfluencies and self-corrections
            processed_sentence = _add_mid_sentence_disfluencies(part, intensity)
            processed_sentence = _add_self_corrections(processed_sentence, intensity)
            
            result.append(processed_sentence)
        else:
            # It's punctuation, just add it
            result.append(part)
    
    return "".join(result)


def _add_mid_sentence_disfluencies(sentence: str, intensity: float) -> str:
    """
    Add disfluencies in the middle of sentences for natural speech patterns.
    """
    # Split sentence into words
    words = sentence.split()
    
    if len(words) < 4:  # Too short to add mid-sentence disfluencies
        return sentence
    
    result = []
    
    # Probability of adding disfluency after each word (except last 2 words)
    # With intensity=0.5, about 15% chance per word position
    disfluency_probability = intensity * 0.25
    
    for i, word in enumerate(words):
        result.append(word)
        
        # Don't add disfluency after last 2 words
        if i < len(words) - 2:
            # Check if we should add a disfluency here
            if random.random() < disfluency_probability:
                disfluency = random.choice(MID_SENTENCE_DISFLUENCIES)
                result.append(f" {disfluency},")
    
    return " ".join(result)


def _add_self_corrections(sentence: str, intensity: float) -> str:
    """
    Add self-correction patterns like "I think... actually, I know" for natural speech.
    """
    # Probability of self-correction
    correction_probability = intensity * 0.15  # Lower probability than disfluencies
    
    if random.random() > correction_probability:
        return sentence
    
    # Check if sentence contains any trigger phrases
    sentence_lower = sentence.lower()
    
    for trigger, correction in SELF_CORRECTION_PATTERNS:
        if trigger.lower() in sentence_lower:
            # Find the trigger phrase (case-insensitive)
            pattern = re.compile(re.escape(trigger), re.IGNORECASE)
            
            # Replace first occurrence with self-correction pattern
            # Only do this once per sentence to avoid over-correction
            if pattern.search(sentence):
                # Insert correction after trigger
                def replace_with_correction(match):
                    return f"{match.group()}... {correction},"
                
                sentence = pattern.sub(replace_with_correction, sentence, count=1)
                break  # Only one self-correction per sentence
    
    return sentence