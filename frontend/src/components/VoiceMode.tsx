import { useState, useRef, useEffect } from 'react';
import { MicrophoneIcon } from './Icons';
import { submitUnified } from '../services/api';

interface VoiceModeProps {
  channel: string;
  user_id?: string;
  session_id?: string;
  onChunkProcessed?: (response: any) => void;
  onError?: (error: string) => void;
}

// Configuration constants
const VAD_CONFIG = {
  SILENCE_THRESHOLD: 15,        // Amplitude threshold (0-128 range)
  SILENCE_DURATION: 2000,       // 2 seconds of silence to trigger chunk
  MIN_CHUNK_DURATION: 1000,     // Minimum 1 second before sending (filters noise)
  FFT_SIZE: 2048,                // Audio analysis resolution
  SMOOTHING: 0.3,                // VAD responsiveness
  TIMESLICE: 100,                // MediaRecorder chunk interval (ms)
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
  // State
  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);

  // Refs for audio resources
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Refs for control flow
  const isActiveRef = useRef(false);
  const isRecordingRef = useRef(false);
  const isProcessingRef = useRef(false);
  const recordingStartTimeRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const vadAnimationFrameRef = useRef<number | null>(null);
  const chunkBufferRef = useRef<Blob[]>([]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopVoiceMode();
  }, []);

  // ==================== Recording Management ====================

  const startRecording = () => {
    if (!streamRef.current || isRecordingRef.current) return;

    const mediaRecorder = new MediaRecorder(streamRef.current, {
      mimeType: MediaRecorder.isTypeSupported('audio/webm') 
        ? 'audio/webm' 
        : 'audio/mp4',
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

  const monitorVoiceActivity = () => {
    if (!analyserRef.current) return;

    const analyser = analyserRef.current;
    
    const checkVoice = () => {
      if (!isActiveRef.current || !analyserRef.current) {
        vadAnimationFrameRef.current = null;
        return;
      }

      const voiceLevel = calculateVoiceLevel(analyser);
      const hasVoice = voiceLevel > VAD_CONFIG.SILENCE_THRESHOLD;

      if (hasVoice) {
        setIsListening(true);
        
        if (!isRecordingRef.current) {
          startRecording();
        }
        
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
      } else {
        setIsListening(false);
        
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

    if (chunks.length === 0) {
      isProcessingRef.current = false;
      return;
    }

    const audioBlob = new Blob(chunks, { 
      type: mediaRecorderRef.current?.mimeType || 'audio/webm' 
    });

    // Calculate actual recording duration
    const actualDuration = recordingStartTimeRef.current 
      ? Date.now() - recordingStartTimeRef.current 
      : 0;

    // Filter out noise/short utterances
    if (actualDuration < VAD_CONFIG.MIN_CHUNK_DURATION) {
      isProcessingRef.current = false;
      if (isActiveRef.current) {
        startRecording();
      }
      return;
    }

    try {
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = VAD_CONFIG.FFT_SIZE;
      analyser.smoothingTimeConstant = VAD_CONFIG.SMOOTHING;
      source.connect(analyser);
      analyserRef.current = analyser;

      isActiveRef.current = true;
      setIsActive(true);
      setIsListening(false);

      monitorVoiceActivity();
    } catch (error) {
      console.error('Error starting voice mode:', error);
      onError?.('Failed to access microphone. Please check your permissions.');
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
