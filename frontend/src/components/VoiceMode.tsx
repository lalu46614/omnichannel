import { useState, useRef, useEffect } from 'react';
import { MicrophoneIcon } from './Icons';
import { submitUnified } from '../services/api';
import { sileroVAD } from '../services/sileroVAD';

interface VoiceModeProps {
  channel: string;
  user_id?: string;
  session_id?: string;
  onChunkProcessed?: (response: any) => void;
  onError?: (error: string) => void;
}

// Configuration
const VAD_CONFIG = {
  SILENCE_THRESHOLD: 15,        // Energy-based fallback threshold
  SILENCE_DURATION: 4000,      // Wait 4s of silence before stopping
  MIN_CHUNK_DURATION: 3000,    // Minimum 2s recording (filters noise)
  FFT_SIZE: 2048,
  SMOOTHING: 0.3,
  USE_SILERO: true,
  TIMESLICE: 100,              // MediaRecorder chunk interval (ms)
  VAD_CHECK_INTERVAL: 100,     // Check VAD every 100ms
  RECORDING_COOLDOWN: 500,     // 500ms cooldown between recordings
} as const;

const BUTTON_STYLES = {
  container: {
    position: 'fixed' as const,
    top: '20px',
    right: '20px',
    zIndex: 1000,
  },
  button: {
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    border: 'none',
    color: 'white',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    transition: 'all 0.3s ease',
  },
  statusBadge: {
    position: 'absolute' as const,
    top: '70px',
    right: '0',
    backgroundColor: 'rgba(0,0,0,0.8)',
    color: 'white',
    padding: '8px 12px',
    borderRadius: '8px',
    fontSize: '12px',
    whiteSpace: 'nowrap' as const,
  },
} as const;

export const VoiceMode = ({
  channel,
  user_id,
  session_id,
  onChunkProcessed,
  onError,
}: VoiceModeProps) => {
  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);

  // Audio resources
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Control state
  const isActiveRef = useRef(false);
  const isRecordingRef = useRef(false);
  const isProcessingRef = useRef(false);
  const recordingStartTimeRef = useRef<number | null>(null);
  const chunkBufferRef = useRef<Blob[]>([]);

  // Timers
  const silenceTimerRef = useRef<number | null>(null);
  const vadAnimationFrameRef = useRef<number | null>(null);
  const lastVadCheckRef = useRef<number>(0);
  const lastRecordingStopRef = useRef<number>(0);

  // Silero VAD
  const sileroProcessorRef = useRef<((analyser: AnalyserNode) => Promise<boolean>) | null>(null);
  const vadModelLoadedRef = useRef(false);

  useEffect(() => {
    return () => stopVoiceMode();
  }, []);

  // ==================== Recording Management ====================

  const startRecording = () => {
    // Cooldown check
    const now = Date.now();
    if (now - lastRecordingStopRef.current < VAD_CONFIG.RECORDING_COOLDOWN) {
      return;
    }

    if (!streamRef.current || isRecordingRef.current) return;

    const mediaRecorder = new MediaRecorder(streamRef.current, {
      mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4',
    });

    mediaRecorderRef.current = mediaRecorder;
    chunkBufferRef.current = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunkBufferRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      if (chunkBufferRef.current.length > 0 && isActiveRef.current) {
        processChunk();
      }
      isRecordingRef.current = false;
      recordingStartTimeRef.current = null;
    };

    mediaRecorder.start(VAD_CONFIG.TIMESLICE);
    isRecordingRef.current = true;
    recordingStartTimeRef.current = Date.now();
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      lastRecordingStopRef.current = Date.now();
    }
  };

  // ==================== Voice Activity Detection ====================

  const calculateVoiceLevel = (analyser: AnalyserNode): number => {
    const dataArray = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(dataArray);
    
    let maxAmplitude = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const deviation = Math.abs(dataArray[i] - 128);
      if (deviation > maxAmplitude) {
        maxAmplitude = deviation;
      }
    }
    return maxAmplitude;
  };

  const detectVoice = async (analyser: AnalyserNode): Promise<boolean> => {
    if (VAD_CONFIG.USE_SILERO && vadModelLoadedRef.current && sileroProcessorRef.current) {
      try {
        return await sileroProcessorRef.current(analyser);
      } catch (error) {
        console.error('Silero VAD error, using fallback:', error);
      }
    }
    
    // Fallback to energy-based detection
    const voiceLevel = calculateVoiceLevel(analyser);
    return voiceLevel > VAD_CONFIG.SILENCE_THRESHOLD;
  };

  const monitorVoiceActivity = () => {
    if (!analyserRef.current) return;

    const checkVoice = async () => {
      if (!isActiveRef.current || !analyserRef.current) {
        vadAnimationFrameRef.current = null;
        return;
      }

      // Throttle VAD checks
      const now = Date.now();
      if (now - lastVadCheckRef.current < VAD_CONFIG.VAD_CHECK_INTERVAL) {
        vadAnimationFrameRef.current = requestAnimationFrame(checkVoice);
        return;
      }
      lastVadCheckRef.current = now;

      // Detect voice
      const hasVoice = await detectVoice(analyserRef.current);

      if (hasVoice) {
        setIsListening(true);
        
        if (!isRecordingRef.current) {
          startRecording();
        }
        
        // Clear silence timer
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
      } else {
        setIsListening(false);
        
        // Start silence timer if recording
        if (isRecordingRef.current && !silenceTimerRef.current) {
          silenceTimerRef.current = window.setTimeout(() => {
            stopRecording();
            silenceTimerRef.current = null;
          }, VAD_CONFIG.SILENCE_DURATION);
        }
      }

      vadAnimationFrameRef.current = requestAnimationFrame(checkVoice);
    };

    checkVoice();
  };

  // ==================== Chunk Processing ====================

  const processChunk = async () => {
    if (isProcessingRef.current || chunkBufferRef.current.length === 0) return;
    
    isProcessingRef.current = true;
    const chunks = [...chunkBufferRef.current];
    chunkBufferRef.current = [];

    // Check minimum duration
    const duration = recordingStartTimeRef.current 
      ? Date.now() - recordingStartTimeRef.current 
      : 0;

    if (duration < VAD_CONFIG.MIN_CHUNK_DURATION) {
      isProcessingRef.current = false;
      if (isActiveRef.current) startRecording();
      return;
    }

    try {
      const audioBlob = new Blob(chunks, { 
        type: mediaRecorderRef.current?.mimeType || 'audio/webm' 
      });

      const audioFile = new File([audioBlob], `chunk_${Date.now()}.webm`, {
        type: audioBlob.type || 'audio/webm',
      });

      const response = await submitUnified({
        channel,
        audio: audioFile,
        user_id,
        session_id,
      });

      onChunkProcessed?.(response);

      if (isActiveRef.current) {
        startRecording();
      }
    } catch (error) {
      console.error('Error processing chunk:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to process audio chunk');
      
      if (isActiveRef.current) {
        startRecording();
      }
    } finally {
      isProcessingRef.current = false;
    }
  };

  // ==================== Voice Mode Control ====================

  const startVoiceMode = async () => {
    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Setup audio context and analyser
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = VAD_CONFIG.FFT_SIZE;
      analyser.smoothingTimeConstant = VAD_CONFIG.SMOOTHING;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Load Silero VAD if enabled
      if (VAD_CONFIG.USE_SILERO) {
        try {
          await sileroVAD.loadModel();
          sileroProcessorRef.current = sileroVAD.createStreamProcessor(audioContext, source);
          vadModelLoadedRef.current = true;
          console.log('Silero VAD ready');
        } catch (error) {
          console.error('Silero VAD failed, using fallback:', error);
          vadModelLoadedRef.current = false;
          onError?.('VAD model failed, using basic detection');
        }
      }

      // Start monitoring
      isActiveRef.current = true;
      setIsActive(true);
      setIsListening(false);
      monitorVoiceActivity();
    } catch (error) {
      console.error('Failed to start voice mode:', error);
      onError?.('Failed to access microphone. Please check permissions.');
      isActiveRef.current = false;
      setIsActive(false);
    }
  };

  const stopVoiceMode = () => {
    isActiveRef.current = false;
    setIsActive(false);

    // Clear timers
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (vadAnimationFrameRef.current) {
      cancelAnimationFrame(vadAnimationFrameRef.current);
      vadAnimationFrameRef.current = null;
    }

    // Process remaining recording
    if (isRecordingRef.current && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    } else if (chunkBufferRef.current.length > 0) {
      processChunk();
    }

    // Cleanup resources
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;

    setIsListening(false);
    chunkBufferRef.current = [];
    isRecordingRef.current = false;
  };

  const toggleVoiceMode = () => {
    isActive ? stopVoiceMode() : startVoiceMode();
  };

  // ==================== Render ====================

  const getButtonColor = () => {
    if (!isActive) return '#4CAF50';
    return isListening ? '#ff4444' : '#ff8888';
  };

  return (
    <div className="voice-mode-container" style={BUTTON_STYLES.container}>
      <button
        type="button"
        onClick={toggleVoiceMode}
        className={`voice-mode-toggle ${isActive ? 'active' : ''}`}
        style={{ ...BUTTON_STYLES.button, backgroundColor: getButtonColor() }}
        title={isActive ? 'Stop voice mode' : 'Start voice mode'}
      >
        <MicrophoneIcon className="icon" />
      </button>
      
      {isActive && (
        <div style={BUTTON_STYLES.statusBadge}>
          {isListening ? '🎤 Listening...' : '⏸️ Paused'}
        </div>
      )}
    </div>
  );
};
