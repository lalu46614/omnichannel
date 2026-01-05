import { useState } from 'react';
import { TextInput } from './TextInput';
import { AttachmentButton, FilePreview } from './AttachmentButton';
import { AudioRecorder } from './AudioRecorder';

import { SendIcon } from './Icons';
import { submitUnified } from '../services/api';

interface UnifiedInputProps {
  channel: string;
  user_id?: string;
  session_id?: string;
  onResponse?: (response: { 
    input_id: string; 
    clusters: any[];
    responses: any[];
    total_clusters: number;
  }) => void;
  onError?: (error: string) => void;
}

export const UnifiedInput = ({
  channel,
  user_id,
  session_id,
  onResponse,
  onError,
}: UnifiedInputProps) => {
  const [text, setText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Remove the clearing logic - allow all inputs to coexist
  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    // Don't clear audio - allow both to exist
  };

  const handleFileRemove = () => {
    setSelectedFile(null);
  };

  const handleAudioComplete = (blob: Blob) => {
    setAudioBlob(blob);
    // Don't clear file - allow both to exist
  };

  const handleAudioCancel = () => {
    setAudioBlob(null);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
  
    const hasText = text.trim().length > 0;
    const hasFile = selectedFile !== null;
    const hasAudio = audioBlob !== null;
  
    if (!hasText && !hasFile && !hasAudio) {
      onError?.('Please enter text, attach a file, or record audio');
      return;
    }
  
    setIsSubmitting(true);
  
    try {
      // Convert audio blob to file if needed
      let audioFile: File | undefined;
      if (hasAudio && audioBlob) {
        audioFile = new File([audioBlob], 'recording.webm', {
          type: audioBlob.type || 'audio/webm',
        });
      }
  
      // Use unified endpoint instead of parallel calls
      const response = await submitUnified({
        channel,
        text: hasText ? text.trim() : undefined,
        audio: audioFile,
        document: hasFile ? selectedFile : undefined,
        user_id,
        session_id,
      });
  
      // Reset form
      setText('');
      setSelectedFile(null);
      setAudioBlob(null);
  
      // Pass the full response with clusters
      onResponse?.(response);
    } catch (error) {
      console.error('Submission error:', error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Failed to submit. Please try again.';
      onError?.(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSubmit = !isSubmitting && (text.trim() || selectedFile || audioBlob);
  const showSendButton = text.trim().length > 0 || selectedFile || audioBlob;

  return (
    <div className="unified-input-wrapper">
      {(selectedFile || audioBlob) && (
        <div className="preview-area">
          {selectedFile && (
            <FilePreview file={selectedFile} onRemove={handleFileRemove} />
          )}
          {audioBlob && (
            <div className="audio-preview-chip">
              <span className="audio-indicator">🎤 Audio recorded</span>
              <button
                type="button"
                onClick={() => setAudioBlob(null)}
                className="remove-audio-chip-button"
                title="Remove audio"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}
      <div className="unified-input-box">
        <AttachmentButton
          onFileSelect={handleFileSelect}
          selectedFile={selectedFile}
        />
        <TextInput
          value={text}
          onChange={setText}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
        />
        <AudioRecorder
          onRecordingComplete={handleAudioComplete}
          onRecordingCancel={handleAudioCancel}
        />
        {showSendButton && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`send-button ${isSubmitting ? 'submitting' : ''}`}
            title="Send message"
          >
            <SendIcon className="icon" />
          </button>
        )}
      </div>
    </div>
  );
};