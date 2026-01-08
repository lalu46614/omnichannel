import axios from 'axios';
import type { ApiResponse, SubmitTextParams, SubmitFileParams } from '../types';

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

