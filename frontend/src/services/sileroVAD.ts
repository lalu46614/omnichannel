import * as ort from 'onnxruntime-web';

// Configuration
const MODEL_URL = '/models/silero_vad.onnx';
const SAMPLE_RATE = 16000; // 16kHz required by Silero VAD
const REQUIRED_SAMPLES = 512; // 32ms at 16kHz
const SPEECH_THRESHOLD = 0.5; // Increased from 0.45 to reduce false positives
const MIN_ENERGY_THRESHOLD = 0.01; // Minimum audio energy to run VAD (filters out silence)
const SMOOTHING_HISTORY_SIZE = 5;

class SileroVAD {
  private model: ort.InferenceSession | null = null;
  private state: ort.Tensor | null = null;
  private isLoaded = false;
  private loadingPromise: Promise<void> | null = null;
  
  // Model input/output names (detected at load time)
  private inputName = 'input';
  private stateInputName = 'state';
  private sampleRateInputName: string | null = null;
  private outputName = 'output';
  private stateOutputName = 'state';
  
  // Probability smoothing
  private probabilityHistory: number[] = [];

  /**
   * Load Silero VAD model and initialize state
   */
  async loadModel(): Promise<void> {
    if (this.isLoaded && this.model) return;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      try {
        ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';
        
        this.model = await ort.InferenceSession.create(MODEL_URL, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        });
        
        // Detect model input/output names
        this.detectModelNames();
        
        // Initialize state tensor [2, 1, 128]
        this.initializeState();
        
        this.isLoaded = true;
        console.log('Silero VAD loaded successfully');
      } catch (error) {
        console.error('Failed to load Silero VAD:', error);
        throw error;
      } finally {
        this.loadingPromise = null;
      }
    })();

    return this.loadingPromise;
  }

  /**
   * Detect model input/output names automatically
   */
  private detectModelNames(): void {
    if (!this.model) return;

    this.inputName = this.model.inputNames.find(name => 
      ['input', 'audio', 'waveform', 'x'].includes(name)
    ) || this.model.inputNames[0];
    
    this.stateInputName = this.model.inputNames.find(name => 
      name.includes('state')
    ) || 'state';
    
    this.sampleRateInputName = this.model.inputNames.find(name => 
      ['sr', 'sample_rate'].includes(name) || name.includes('sr')
    ) || null;
    
    this.outputName = this.model.outputNames.find(name => 
      ['output', 'logits', 'prob', 'output_0'].includes(name)
    ) || this.model.outputNames[0];
    
    this.stateOutputName = this.model.outputNames.find(name => 
      name.includes('state') && name !== this.outputName
    ) || this.model.outputNames[1] || this.model.outputNames[0];
  }

  /**
   * Initialize state tensor for recurrent model
   */
  private initializeState(): void {
    const stateShape = [2, 1, 128]; // [layers, batch, hidden_size]
    const stateSize = stateShape[0] * stateShape[1] * stateShape[2];
    this.state = new ort.Tensor('float32', new Float32Array(stateSize), stateShape);
  }

  /**
   * Reset state and history for new recording session
   */
  resetState(): void {
    if (this.state) {
      const stateSize = this.state.data.length;
      this.state = new ort.Tensor('float32', new Float32Array(stateSize), this.state.dims);
    }
    this.probabilityHistory = [];
  }

  /**
   * Resample audio to 16kHz
   */
  private resampleTo16kHz(audioBuffer: AudioBuffer): Float32Array {
    if (audioBuffer.sampleRate === SAMPLE_RATE) {
      return audioBuffer.getChannelData(0);
    }

    const ratio = audioBuffer.sampleRate / SAMPLE_RATE;
    const sourceData = audioBuffer.getChannelData(0);
    const targetLength = Math.floor(sourceData.length / ratio);
    const targetData = new Float32Array(targetLength);

    for (let i = 0; i < targetLength; i++) {
      targetData[i] = sourceData[Math.floor(i * ratio)];
    }

    return targetData;
  }

  /**
   * Normalize audio to [-1, 1] range
   */
  private normalize(audio: Float32Array): Float32Array {
    const max = Math.max(...Array.from(audio).map(Math.abs));
    return max > 0 ? audio.map(s => s / max) : audio;
  }

  /**
   * Prepare audio chunk: resample, normalize, pad/truncate to 512 samples
   */
  private prepareAudioChunk(audioBuffer: AudioBuffer): Float32Array {
    let audioData = this.resampleTo16kHz(audioBuffer);
    audioData = this.normalize(audioData);

    // Ensure exactly 512 samples
    if (audioData.length < REQUIRED_SAMPLES) {
      const padded = new Float32Array(REQUIRED_SAMPLES);
      padded.set(audioData, 0);
      return padded;
    }
    
    return audioData.slice(0, REQUIRED_SAMPLES);
  }

  /**
   * Extract probability from model output
   */
  private extractProbability(output: ort.Tensor): number {
    if (Array.isArray(output.data)) {
      return Number(output.data[0]) || 0;
    }
    if (output.data instanceof Float32Array) {
      return output.data[0];
    }
    return (output.data as unknown as ArrayLike<number>)[0] || 0;
  }

  /**
   * Smooth probability over recent frames
   * Resets history when silence is detected (probability below threshold)
   */
  private smoothProbability(probability: number, previousSmoothed: number = 0): number {
    // Reset history if we detect silence (current prob below threshold)
    // This prevents old noise spikes from persisting in the history
    if (probability < SPEECH_THRESHOLD) {
      // Only reset if we were previously above threshold (transition to silence)
      // OR if history is empty (fresh start)
      if (previousSmoothed >= SPEECH_THRESHOLD || this.probabilityHistory.length === 0) {
        this.probabilityHistory = [];
      }
    }
    
    this.probabilityHistory.push(probability);
    if (this.probabilityHistory.length > SMOOTHING_HISTORY_SIZE) {
      this.probabilityHistory.shift();
    }
    
    const sum = this.probabilityHistory.reduce((a, b) => a + b, 0);
    return sum / this.probabilityHistory.length;
  }

  /**
   * Detect voice activity in audio chunk
   */
  async detectVoice(audioBuffer: AudioBuffer): Promise<{ probability: number; isSpeech: boolean }> {
    if (!this.model) await this.loadModel();
    if (!this.model || !this.state) {
      throw new Error('Silero VAD model not loaded');
    }

    try {
      // Prepare audio
      const audioData = this.prepareAudioChunk(audioBuffer);
      const inputTensor = new ort.Tensor('float32', audioData, [1, audioData.length]);

      // Prepare model inputs
      const feeds: { [key: string]: ort.Tensor } = {
        [this.inputName]: inputTensor,
        [this.stateInputName]: this.state,
      };
      
      if (this.sampleRateInputName) {
        feeds[this.sampleRateInputName] = new ort.Tensor(
          'int64',
          BigInt64Array.from([BigInt(SAMPLE_RATE)]),
          []
        );
      }

      // Run inference
      const results = await this.model.run(feeds);
      
      // Update state for next inference
      if (results[this.stateOutputName]) {
        this.state = results[this.stateOutputName] as ort.Tensor;
      }
      
      // Get and smooth probability
      const output = results[this.outputName] as ort.Tensor;
      const rawProbability = this.extractProbability(output);
      const previousSmoothed = this.probabilityHistory.length > 0 
        ? this.probabilityHistory.reduce((a, b) => a + b, 0) / this.probabilityHistory.length 
        : 0;
      const smoothedProbability = this.smoothProbability(rawProbability, previousSmoothed);
      const isSpeech = smoothedProbability > SPEECH_THRESHOLD;

      return { probability: smoothedProbability, isSpeech };
    } catch (error) {
      console.error('Silero VAD detection error:', error);
      return { probability: 0, isSpeech: false };
    }
  }

  /**
   * Create stream processor for real-time VAD
   */
  createStreamProcessor(
    audioContext: AudioContext,
    _source: MediaStreamAudioSourceNode
  ): (analyser: AnalyserNode) => Promise<boolean> {
    this.resetState();

    return async (analyser: AnalyserNode): Promise<boolean> => {
      // Get audio from analyser
      const buffer = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(buffer);

      // Resample to 16kHz and prepare chunk
      const ratio = audioContext.sampleRate / SAMPLE_RATE;
      const sourceSamplesNeeded = Math.ceil(REQUIRED_SAMPLES * ratio);
      const sourceData = buffer.subarray(0, Math.min(sourceSamplesNeeded, buffer.length));
      
      const resampled = new Float32Array(REQUIRED_SAMPLES);
      for (let i = 0; i < REQUIRED_SAMPLES; i++) {
        const sourceIndex = Math.floor(i * ratio);
        resampled[i] = sourceIndex < sourceData.length ? sourceData[sourceIndex] : 0;
      }

      // Normalize
      const max = Math.max(...Array.from(resampled).map(Math.abs));

      // Energy-based pre-filtering: Skip VAD if energy is too low (prevents false positives from silence/noise)
      if (max < MIN_ENERGY_THRESHOLD) {
        return false;
      }

      if (max > 0) {
        for (let i = 0; i < resampled.length; i++) {
          resampled[i] /= max;
        }
      }

      // Create AudioBuffer and run VAD
      const audioBuffer = audioContext.createBuffer(1, resampled.length, SAMPLE_RATE);
      audioBuffer.getChannelData(0).set(resampled);
      
      const result = await this.detectVoice(audioBuffer);
      return result.isSpeech;
    };
  }
}

export const sileroVAD = new SileroVAD();
