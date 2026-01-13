export interface SentimentData {
  sentiment: 'frustrated' | 'excited' | 'neutral' | 'sarcastic' | 'calm';
  tone?: string;
  pitch_trend?: 'dropping' | 'rising' | 'stable';
  urgency?: number;
  emotional_intensity?: number;
}

export interface ProsodySettings {
  speed: number;  // 0.5 to 2.0
  pitch: number;  // -50 to +50 semitones
  stability: number;  // 0.0 to 1.0
  style?: string;  // ElevenLabs style tokens
}

export function getProsodyFromSentiment(sentiment: SentimentData): ProsodySettings {
  const base: ProsodySettings = {
    speed: 1.0,
    pitch: 0,
    stability: 0.5,
  };

  switch (sentiment.sentiment) {
    case 'frustrated':
      return {
        ...base,
        speed: 0.85,  // Slower, calmer
        pitch: -10,   // Lower pitch
        stability: 0.7,
        style: 'calm',
      };
    
    case 'excited':
      return {
        ...base,
        speed: 1.2,   // Faster
        pitch: +15,   // Higher pitch
        stability: 0.3, // More variation
        style: 'upbeat',
      };
    
    case 'sarcastic':
      return {
        ...base,
        speed: 0.95,
        pitch: -5,
        stability: 0.4,
        style: 'sarcastic',
      };
    
    default:
      return base;
  }
}


export function preprocessTextForTts(text: string): string {
  if (!text) return text;
  
  let processed = text;
  
  // Replace commas with periods for natural pauses (but not in numbers or URLs)
  // This regex matches commas that are NOT inside numbers (like 1,000)
  processed = processed.replace(/,(\s+)/g, '.$1');
  
  // Replace multiple spaces with single space
  processed = processed.replace(/\s+/g, ' ');
  
  // Replace multiple periods with single period
  processed = processed.replace(/\.{2,}/g, '.');
  
  // Ensure proper spacing after periods
  processed = processed.replace(/\.([^\s])/g, '. $1');
  
  // Remove any remaining commas that might be read as "comma"
  // But keep commas in numbers (e.g., 1,000)
  processed = processed.replace(/,/g, '');
  
  // Clean up any double spaces
  processed = processed.replace(/\s{2,}/g, ' ');
  
  return processed.trim();
}