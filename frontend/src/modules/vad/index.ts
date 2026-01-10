import { VADEngineType } from './types';
import type { VADConfig } from './types';
import { BaseVADEngine } from './base';
import { SileroVADEngine } from './sileroVAD';


export * from './types';
export { BaseVADEngine } from './base';
export { SileroVADEngine } from './sileroVAD';


export const DEFAULT_VAD_CONFIG: 
VADConfig = {
  onsetThreshold: 0.4,      // 0.4-0.5: Lowered to detect speech onset more reliably
  offsetThreshold: 0.3,     // 0.25-0.35: Lower ensures soft endings aren't cut off
  minEnergyThreshold: 0.01, // Lowered from 0.02 to catch quieter speech
  smoothingWindow: 5,       // Smooth over 5 frames
  checkInterval: 100,       // Check every 100ms
};


export function createVADEngine(
  type: VADEngineType,
  config: VADConfig = DEFAULT_VAD_CONFIG
): BaseVADEngine {
  switch (type) {
    case VADEngineType.SILERO:
      return new SileroVADEngine(config);

    case VADEngineType.ENERGY_BASED:
      throw new Error('Energy-based VAD is not implemented');

    default:
      throw new Error(`Unknown VAD engine type: ${type}`);
  }
}

export function createDefaultVAD(engineType: VADEngineType = VADEngineType.SILERO): BaseVADEngine {
  return createVADEngine(engineType, DEFAULT_VAD_CONFIG);
}

