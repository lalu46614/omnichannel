export interface VADResult {
  /** Speech probability (0-1) */
  probability: number;
  /** Is speech currently detected */
  isSpeech: boolean;
  /** Confidence level (0-1) */
  confidence: number;
  /** Timestamp of detection */
  timestamp: number;
  /** Detection type: onset (speech start) or offset (speech end) */
  type: 'onset' | 'offset' | 'continuing' | 'silence';
}

export interface VADConfig {
  /** Onset threshold: 0.5-0.7 (higher avoids breathing noise) */
  onsetThreshold: number;
  /** Offset threshold: 0.3-0.5 (lower ensures soft endings aren't cut off) */
  offsetThreshold: number;
  /** Minimum audio energy to process (filters out silence) */
  minEnergyThreshold?: number;
  /** Smoothing window size for probability history */
  smoothingWindow?: number;
  /** Check interval in milliseconds */
  checkInterval?: number;
}

export interface VADStreamProcessor {
  /** Process analyser node and return speech detection */
  (analyser: AnalyserNode): Promise<boolean>;
}

export const VADEngineType = {
  SILERO: 'silero',
  WEBRTC: 'webrtc',
  PICOVOICE: 'picovoice',
  ENERGY_BASED: 'energy', // Fallback
} as const;

export type VADEngineType = typeof VADEngineType[keyof typeof VADEngineType];

