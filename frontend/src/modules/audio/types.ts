export interface RecordingState {
  isRecording: boolean;
  isProcessing: boolean;
  startTime: number | null;
  chunks: Blob[];
}

export interface AudioManagerConfig {
  timeslice?: number; // MediaRecorder chunk interval (ms)
  fftSize?: number;   // AnalyserNode FFT size
  smoothing?: number; // AnalyserNode smoothing constant
}

export interface AudioResources {
  stream: MediaStream;
  audioContext: AudioContext;
  analyser: AnalyserNode;
  source: MediaStreamAudioSourceNode;
}

