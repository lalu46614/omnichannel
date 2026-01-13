import axios from 'axios';
import type { ApiResponse, SubmitTextParams, SubmitFileParams } from '../types';
import type { ProsodySettings } from './ttsEnhancer';
import { preprocessTextForTts } from './ttsEnhancer';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
});

export const submitUnified = async (params: {
  channel: string;
  text?: string;
  audio?: File;
  document?: File;
  user_id?: string;
  session_id?: string;
}): Promise<{
  input_id: string;
  clusters: any[];
  responses?: any[];
  total_clusters?: number;
  needs_clarification?: boolean;
  clarification_questions?: string[];
  context_envelope?: any;
}> => {
  const formData = new FormData();
  formData.append('channel', params.channel);
  
  if (params.text) {
    formData.append('text', params.text);
  }
  if (params.audio) {
    formData.append('audio', params.audio);
  }
  if (params.document) {
    formData.append('document', params.document);
  }
  
  if (params.user_id) {
    formData.append('user_id', params.user_id);
  }
  if (params.session_id) {
    formData.append('session_id', params.session_id);
  }

  const response = await api.post('/input/unified', formData);
  return response.data;
};

export const submitText = async (params: SubmitTextParams): Promise<ApiResponse> => {
  const formData = new FormData();
  formData.append('channel', params.channel);
  formData.append('text', params.text);
  
  if (params.user_id) {
    formData.append('user_id', params.user_id);
  }
  if (params.session_id) {
    formData.append('session_id', params.session_id);
  }

  const response = await api.post<ApiResponse>('/input/text', formData);
  return response.data;
};

export const submitAudio = async (params: SubmitFileParams): Promise<ApiResponse> => {
  const formData = new FormData();
  formData.append('channel', params.channel);
  formData.append('audio', params.file);
  
  if (params.user_id) {
    formData.append('user_id', params.user_id);
  }
  if (params.session_id) {
    formData.append('session_id', params.session_id);
  }

  const response = await api.post<ApiResponse>('/input/audio', formData);
  return response.data;
};

export const submitDocument = async (params: SubmitFileParams): Promise<ApiResponse> => {
  const formData = new FormData();
  formData.append('channel', params.channel);
  formData.append('document', params.file);
  
  if (params.user_id) {
    formData.append('user_id', params.user_id);
  }
  if (params.session_id) {
    formData.append('session_id', params.session_id);
  }

  const response = await api.post<ApiResponse>('/input/document', formData);
  return response.data;
};

/**
 * ElevenLabs TTS helper
 * Returns an audio Blob (e.g. audio/mpeg) for the given text.
 * Supports optional prosody settings for enhanced voice modulation.
 */
export const generateTtsAudio = async (
  text: string,
  prosodySettings?: ProsodySettings
): Promise<Blob> => {
  const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY as string | undefined;
  const voiceId =
    (import.meta.env.VITE_ELEVENLABS_VOICE_ID as string | undefined) ??
    'EXAVITQu4vr4xnSDxMaL'; // Default voice ID (can be overridden via env)

  if (!apiKey) {
    throw new Error('Missing ElevenLabs API key. Set VITE_ELEVENLABS_API_KEY in your environment.');
  }

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  
  const processedText = preprocessTextForTts(text);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: processedText,
      model_id: 'eleven_flash_v2',
      voice_settings: {
        stability: prosodySettings?.stability ?? 0.5,
        similarity_boost: 0.75,
        ...(prosodySettings?.style && { style: 0.5 }),
        use_speaker_boost: true,
      },
      // Add prosody parameters if supported by ElevenLabs API
      ...(prosodySettings && {
        ...(prosodySettings.speed !== undefined && { speed: prosodySettings.speed }),
        ...(prosodySettings.pitch !== undefined && { pitch: prosodySettings.pitch }),
      }),
    }),
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs TTS failed with status ${response.status}`);
  }

  return await response.blob();
};


