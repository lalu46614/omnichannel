import { useState } from 'react';
import { TextInput } from './TextInput';
import { AttachmentButton, FilePreview } from './AttachmentButton';
import { AudioRecorder } from './AudioRecorder';
import { submitText, submitAudio, submitDocument } from '../services/api';
import { SendIcon } from './Icons';
import type { InputType } from '../types';

interface UnifiedInputProps {
  channel: string;
  user_id?: string;
  session_id?: string;
  onResponse?: (response: { input_id: string; llm_response: string }) => void;
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

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setAudioBlob(null);
  };

  const handleFileRemove = () => {
    setSelectedFile(null);
  };

  const handleAudioComplete = (blob: Blob) => {
    setAudioBlob(blob);
    setSelectedFile(null);
  };

  const handleAudioCancel = () => {
    setAudioBlob(null);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    // Determine submission type based on available inputs
    let type: InputType | null = null;
    
    if (audioBlob) {
      type = 'audio';
    } else if (selectedFile) {
      type = 'document';
    } else if (text.trim()) {
      type = 'text';
    }

    if (!type) {
      onError?.('Please enter text, attach a file, or record audio');
      return;
    }

    setIsSubmitting(true);

    try {
      let response;

      if (type === 'text') {
        response = await submitText({
          channel,
          text: text.trim(),
          user_id,
          session_id,
        });
      } else if (type === 'audio' && audioBlob) {
        // Convert blob to File
        const audioFile = new File([audioBlob], 'recording.webm', {
          type: audioBlob.type || 'audio/webm',
        });
        response = await submitAudio({
          channel,
          file: audioFile,
          user_id,
          session_id,
        });
      } else if (type === 'document' && selectedFile) {
        response = await submitDocument({
          channel,
          file: selectedFile,
          user_id,
          session_id,
        });
      } else {
        throw new Error('Invalid input type');
      }

      // Reset form
      setText('');
      setSelectedFile(null);
      setAudioBlob(null);

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
