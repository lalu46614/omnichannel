import { useState, useRef, useEffect } from 'react';
import { MicrophoneIcon } from './Icons';
import { submitUnified, generateTtsAudio } from '../services/api';
import { createDefaultVAD, VADEngineType, BaseVADEngine } from '../modules/vad';
import { AudioManager } from '../modules/audio';
import { playManagedAudioBlob, stopAudioPlayback } from '../services/audioPlayer';
import { getProsodyFromSentiment } from '../services/ttsEnhancer';

interface VoiceModeProps {
  channel: string;
  user_id?: string;
  session_id?: string;
  onChunkProcessed?: (response: any) => void;
  onError?: (error: string) => void;
}

// Configuration - Fixed values
const VOICE_CONFIG = {
  SILENCE_DURATION: 2500,      // 2.5 seconds - allow for natural speech pauses (was 2000ms)
  MIN_CHUNK_DURATION: 3000,    // Minimum 1s recording (filters noise, was 3000ms)
  VAD_CHECK_INTERVAL: 100,     // Check VAD every 100ms
  RECORDING_COOLDOWN: 300,     // 300ms cooldown between recordings
  RESUME_WINDOW: 2000,         // 2s window to resume recording after silence
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

  // Modules
  const vadRef = useRef<BaseVADEngine | null>(null);
  const audioManagerRef = useRef<AudioManager | null>(null);
  const vadProcessorRef = useRef<((analyser: AnalyserNode) => Promise<boolean>) | null>(null);

  // Control state
  const isActiveRef = useRef(false);
  const silenceTimerRef = useRef<number | null>(null);
  const vadAnimationFrameRef = useRef<number | null>(null);
  const lastVadCheckRef = useRef<number>(0);
  const lastRecordingStopRef = useRef<number>(0);

  const pendingChunkRef = useRef<Blob | null>(null);
  const pendingChunkTimestampRef = useRef<number | null>(null);
  const pendingChunkDurationRef = useRef<number | null>(null);
  const resumeWindowTimerRef = useRef<number | null>(null);
  const consecutiveSilenceCountRef = useRef<number>(0);

  // TTS control for barge-in
  const ttsAbortRef = useRef<AbortController | null>(null);
  const ttsSeqRef = useRef(0);
  const ttsPlayingRef = useRef(false);

  useEffect(() => {
    return () => stopVoiceMode();
  }, []);

  // ==================== Recording Management ====================

  const startRecording = () => {
    const audioManager = audioManagerRef.current;
    if (!audioManager) return;

    // Cooldown check
    const now = Date.now();
    if (now - lastRecordingStopRef.current < VOICE_CONFIG.RECORDING_COOLDOWN) {
      return;
    }

    // Don't start if already recording or processing
    if (audioManager.isRecording() || audioManager.isProcessing()) {
      return;
    }

    // CRITICAL FIX: Reset VAD state before starting new recording session
    // This prevents false positives from previous session state
    if (vadRef.current) {
      vadRef.current.reset();
    }

    audioManager.clearChunks();
    audioManager.startRecording(
      undefined, // onDataAvailable
      () => {
        // onStop callback - process the chunk
        // Always process (even if stopping) to handle final chunk
        processChunk(false);
      }
    );
    lastRecordingStopRef.current = 0; // Reset cooldown
  };

  const stopRecording = () => {
    const audioManager = audioManagerRef.current;
    if (!audioManager) return;

    if (audioManager.isRecording()) {
      audioManager.stopRecording();
      lastRecordingStopRef.current = Date.now();
    }
  };

  // ==================== Voice Activity Detection ====================

const monitorVoiceActivity = () => {
  const audioManager = audioManagerRef.current;
  const vadProcessor = vadProcessorRef.current;
  
  if (!audioManager || !vadProcessor) {
    console.error('VoiceMode: Missing audioManager or vadProcessor');
    return;
  }

  const checkVoice = async () => {
    if (!isActiveRef.current) {
      vadAnimationFrameRef.current = null;
      return;
    }

    // Throttle VAD checks
    const now = Date.now();
    if (now - lastVadCheckRef.current < VOICE_CONFIG.VAD_CHECK_INTERVAL) {
      vadAnimationFrameRef.current = requestAnimationFrame(checkVoice);
      return;
    }
    lastVadCheckRef.current = now;

    try {
      const analyser = audioManager.getAnalyser();
      const hasVoice = await vadProcessor(analyser);

      if (hasVoice) {
        setIsListening(true);

        // BARGE-IN: if user starts speaking while TTS is playing, stop it immediately
        if (ttsPlayingRef.current) {
          ttsAbortRef.current?.abort(); // cancel in-flight TTS
          stopAudioPlayback();          // stop current audio
          ttsPlayingRef.current = false;
        }
        
        // Check if we should cancel pending chunk send (speech resumed)
        if (pendingChunkRef.current && pendingChunkTimestampRef.current) {
          const timeSinceLastChunk = Date.now() - pendingChunkTimestampRef.current;
          if (timeSinceLastChunk < VOICE_CONFIG.RESUME_WINDOW) {
            // User continued speaking - clear pending chunk and continue recording
            console.log('Speech resumed, canceling pending chunk send');
            pendingChunkRef.current = null;
            pendingChunkTimestampRef.current = null;
            pendingChunkDurationRef.current = null;
            if (resumeWindowTimerRef.current) {
              clearTimeout(resumeWindowTimerRef.current);
              resumeWindowTimerRef.current = null;
            }
          }
        }
        
        if (!audioManager.isRecording() && !audioManager.isProcessing()) {
          startRecording();
        }
        
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
        
        // Reset consecutive silence counter when voice is detected
        consecutiveSilenceCountRef.current = 0;
      } else {
        setIsListening(false);
        
        // CRITICAL FIX: If we have a pending chunk, we're in resume window - don't start new recordings
        // Just wait to see if speech resumes to cancel the pending chunk
        if (pendingChunkRef.current && pendingChunkTimestampRef.current) {
          const timeSinceLastChunk = Date.now() - pendingChunkTimestampRef.current;
          // Skip silence timer logic while in resume window - wait for voice or timer expiration
          if (timeSinceLastChunk < VOICE_CONFIG.RESUME_WINDOW && !audioManager.isRecording()) {
            // Still waiting in resume window - don't do anything yet
            vadAnimationFrameRef.current = requestAnimationFrame(checkVoice);
            return;
          }
        }
        
        // CRITICAL FIX: Require multiple consecutive silence detections before starting timer
        // This prevents false positives during natural speech pauses
        if (audioManager.isRecording() && !silenceTimerRef.current) {
          consecutiveSilenceCountRef.current++;
          const requiredConsecutiveSilence = 5; // Require 5 consecutive silence detections (~500ms) to reduce false positives
          
          if (consecutiveSilenceCountRef.current < requiredConsecutiveSilence) {
            // Not enough consecutive silence - continue checking
            vadAnimationFrameRef.current = requestAnimationFrame(checkVoice);
            return;
          }
          
          // Enough consecutive silence - start timer
          consecutiveSilenceCountRef.current = 0; // Reset counter
          silenceTimerRef.current = window.setTimeout(() => {
            // Save chunks to pending before stopping
            const chunks = audioManager.getChunks();
            if (chunks.length > 0) {
              const audioBlob = new Blob(chunks, { type: 'audio/webm' });
              const duration = audioManager.getDuration();
              
              pendingChunkRef.current = audioBlob;
              pendingChunkTimestampRef.current = Date.now();
              pendingChunkDurationRef.current = duration;
              
              // Set a timer to actually send if speech doesn't resume
              resumeWindowTimerRef.current = window.setTimeout(() => {
                if (pendingChunkRef.current && pendingChunkTimestampRef.current) {
                  processPendingChunk();
                }
                resumeWindowTimerRef.current = null;
              }, VOICE_CONFIG.RESUME_WINDOW);
            }
            
            stopRecording();
            silenceTimerRef.current = null;
          }, VOICE_CONFIG.SILENCE_DURATION);
        }
      }
    } catch (error) {
      console.error('VAD check error:', error);
    }

    vadAnimationFrameRef.current = requestAnimationFrame(checkVoice);
  };

  checkVoice();
};

  // ==================== Helpers ====================

  const getPrimaryResponse = (
    response: any
  ): { text: string; sentiment?: any } | null => {
    if (!response) return null;

    const inputId: string | undefined = response.input_id;

    // Find which bucket contains THIS request's input_id
    const bucketId =
      inputId && Array.isArray(response.clusters)
        ? response.clusters.find((c: any) => {
            const items = c?.items;
            if (!Array.isArray(items)) return false;
            return items.some(
              (it: any) => it?.original_data?.gateway_output?.input_id === inputId
            );
          })?.bucket_id
        : undefined;

    // Pick the response for that bucket_id (fallback to last one if not found)
    const picked =
      (bucketId !== undefined && Array.isArray(response.responses)
        ? response.responses.find((r: any) => r?.bucket_id === bucketId)
        : null) ||
      (Array.isArray(response.responses) && response.responses.length > 0
        ? response.responses[response.responses.length - 1]
        : null) ||
      null;

    const text: unknown = picked?.llm_response ?? response.llm_response;
    if (typeof text !== 'string' || !text.trim()) return null;

    return { text, sentiment: picked?.sentiment ?? response.sentiment };
  };

  const speakResponseIfAvailable = async (response: any) => {
    const picked = getPrimaryResponse(response);
    if (!picked) return;

    // Cancel any existing TTS (fetch or playback)
    ttsAbortRef.current?.abort();
    stopAudioPlayback();

    const mySeq = ++ttsSeqRef.current;
    const controller = new AbortController();
    ttsAbortRef.current = controller;

    try {
      const sentiment = picked.sentiment;
      const prosodySettings = sentiment
        ? getProsodyFromSentiment(sentiment)
        : undefined;

      ttsPlayingRef.current = true;

      const audioBlob = await generateTtsAudio(picked.text, prosodySettings, {
        signal: controller.signal,
      });

      // If a newer TTS started, skip this one
      if (mySeq !== ttsSeqRef.current) return;

      await playManagedAudioBlob(audioBlob, {
        signal: controller.signal,
        onEnd: () => {
          ttsPlayingRef.current = false;
        },
      });
    } catch (err: any) {
      // AbortError is expected on interruption; ignore it
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }

      console.error('TTS playback failed:', err);
      onError?.(err instanceof Error ? err.message : 'Failed to play TTS audio');
    } finally {
      if (mySeq === ttsSeqRef.current) {
        ttsPlayingRef.current = false;
      }
    }
  };

  // ==================== Chunk Processing ====================

  const processPendingChunk = async () => {
    if (!pendingChunkRef.current) return;
    
    const audioManager = audioManagerRef.current;
    if (!audioManager || audioManager.isProcessing()) {
      return;
    }

    // Check duration from stored value (recording has stopped by now)
    const duration = pendingChunkDurationRef.current || 0;
    if (duration < VOICE_CONFIG.MIN_CHUNK_DURATION) {
      pendingChunkRef.current = null;
      pendingChunkTimestampRef.current = null;
      pendingChunkDurationRef.current = null;
      return;
    }

    audioManager.setProcessing(true);

    try {
      const audioFile = new File(
        [pendingChunkRef.current], 
        `chunk_${Date.now()}.webm`,
        { type: 'audio/webm' }
      );

      const response = await submitUnified({
        channel,
        audio: audioFile,
        user_id,
        session_id,
      });

      onChunkProcessed?.(response);
      // VoiceMode always sends audio, so we always treat this as voice-originated
      speakResponseIfAvailable(response);

      if (vadRef.current) {
        vadRef.current.reset();
      }
    } catch (error) {
      console.error('Error processing chunk:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to process audio chunk');
    } finally {
      audioManager.setProcessing(false);
      pendingChunkRef.current = null;
      pendingChunkTimestampRef.current = null;
      pendingChunkDurationRef.current = null;
      if (!isActiveRef.current) {
        cleanup();
      }
    }
  };

  const processChunk = async (forceProcess = false) => {
    const audioManager = audioManagerRef.current;
    if (!audioManager || audioManager.isProcessing()) {
      return;
    }

    if (pendingChunkRef.current) {
      audioManager.clearChunks();
      return;
    }

    const chunks = audioManager.getChunks();
    if (chunks.length === 0) {
      return;
    }    
  
    const duration = audioManager.getDuration();
    if (!forceProcess && duration < VOICE_CONFIG.MIN_CHUNK_DURATION) {
      audioManager.clearChunks();
      return;
    }
  
    audioManager.setProcessing(true);
  
    try {
      const audioFile = audioManager.createAudioFile(`chunk_${Date.now()}.webm`);
      if (!audioFile) {
        throw new Error('Failed to create audio file');
      }
  
      const response = await submitUnified({
        channel,
        audio: audioFile,
        user_id,
        session_id,
      });
  
      onChunkProcessed?.(response);
      // VoiceMode always sends audio, so we always treat this as voice-originated
      speakResponseIfAvailable(response);
  
      if (vadRef.current) {
        vadRef.current.reset();
      }
      audioManager.clearChunks();
    } catch (error) {
      console.error('Error processing chunk:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to process audio chunk');
      audioManager.clearChunks();
    } finally {
      audioManager.setProcessing(false);
      if (!isActiveRef.current) {
        cleanup();
      }
    }
  };

  // ==================== Voice Mode Control ====================

  const startVoiceMode = async () => {
    try {
      // Initialize audio manager
      const audioManager = new AudioManager({
        timeslice: 100,
        fftSize: 2048,
        smoothing: 0.3,
      });
      
      const resources = await audioManager.initialize();
      audioManagerRef.current = audioManager;
  
      // Initialize VAD
      const vad = createDefaultVAD(VADEngineType.SILERO);
      await vad.load();
      vadRef.current = vad;
  
      // Create stream processor
      vadProcessorRef.current = vad.createStreamProcessor(resources.audioContext, resources.source);
  
      vad.reset();
  
      isActiveRef.current = true;
      setIsActive(true);
      setIsListening(false);
      
      monitorVoiceActivity();
    } catch (error) {
      console.error('Failed to start voice mode:', error);
      onError?.('Failed to access microphone. Please check permissions.');
      isActiveRef.current = false;
      setIsActive(false);
      cleanup();
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

    if (resumeWindowTimerRef.current) {
      clearTimeout(resumeWindowTimerRef.current);
      resumeWindowTimerRef.current = null;
    }

    if (vadAnimationFrameRef.current) {
      cancelAnimationFrame(vadAnimationFrameRef.current);
      vadAnimationFrameRef.current = null;
    }

    // Process remaining recording if any
    // Note: onStop callback will trigger processChunk, which will cleanup if not active
    const audioManager = audioManagerRef.current;
    if (audioManager?.isRecording()) {
      // Set temporary flag so processChunk runs even though we're stopping
      const wasProcessing = audioManager.isProcessing();
      if (!wasProcessing) {
        audioManager.stopRecording();
        // processChunk will be called via onStop callback and handle cleanup
        return;
      }
    }

    // Process any pending chunk before cleanup
    if (pendingChunkRef.current) {
      processPendingChunk();
      return;
    }

    cleanup();
  };

  const cleanup = () => {
    // Clear pending chunk timers
    if (resumeWindowTimerRef.current) {
      clearTimeout(resumeWindowTimerRef.current);
      resumeWindowTimerRef.current = null;
    }

    // Cleanup pending chunks
    pendingChunkRef.current = null;
    pendingChunkTimestampRef.current = null;
    pendingChunkDurationRef.current = null;

    // Cleanup resources
    if (vadRef.current) {
      vadRef.current.dispose();
      vadRef.current = null;
    }

    if (audioManagerRef.current) {
      audioManagerRef.current.dispose();
      audioManagerRef.current = null;
    }

    vadProcessorRef.current = null;
    setIsListening(false);
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
