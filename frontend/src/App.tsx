import { useState } from 'react';
import { UnifiedInput } from './components/UnifiedInput';
import { VoiceMode } from './components/VoiceMode';
import './styles/index.css';

function App() {
  // Generate session_id once on mount, persist in localStorage
  const [sessionId] = useState<string>(() => {
    // Try to get from localStorage first
    const stored = localStorage.getItem('omni_channel_session_id');
    if (stored) {
      return stored;
    }
    // Generate new UUID
    const newSessionId = crypto.randomUUID();
    localStorage.setItem('omni_channel_session_id', newSessionId);
    return newSessionId;
  });

  const [lastResponse, setLastResponse] = useState<{
    input_id: string;
    clusters?: any[];
    responses?: any[];
    total_clusters?: number;
    needs_clarification?: boolean;
    clarification_questions?: string[];
    context_envelope?: any;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleResponse = (response: any) => {
    console.log('Response received:', response); // Debug log
    setLastResponse(response);
    setError(null);
  };

  const handleError = (errorMessage: string) => {
    console.error('Error:', errorMessage); // Debug log
    setError(errorMessage);
  };  
  const handleChunkProcessed = (response: any) => {
    console.log('Chunk processed:', response);
  };

  return (
    <div className="app">
      <div className="app-container">
        <header className="app-header">
          <h1>OmniChannel</h1>
          <p style={{ fontSize: '12px', color: '#666' }}>
            Session: {sessionId.substring(0, 8)}...
          </p>
        </header>
        {
          <VoiceMode
            channel="web"
            session_id={sessionId}
            onChunkProcessed={handleChunkProcessed}
            onError={handleError}
          />
        }
        <main className="app-main">
          {error && (
            <div className="error-banner" style={{
              padding: '15px',
              backgroundColor: '#f8d7da',
              border: '1px solid #f5c6cb',
              borderRadius: '8px',
              marginBottom: '20px',
              color: '#721c24'
            }}>
              <strong>Error:</strong> {error}
            </div>
          )}
          
          {lastResponse && (
            <div className="response-container" style={{
              marginBottom: '20px',
              padding: '20px',
              backgroundColor: '#fff',
              border: '1px solid #ddd',
              borderRadius: '8px'
            }}>
              <h2>Response</h2>
              <div className="response-content">
                <p><strong>Input ID:</strong> {lastResponse.input_id}</p>
                
                {/* Show clarification questions if needed */}
                {lastResponse.needs_clarification && (
                  <div className="clarification-section" style={{
                    padding: '20px',
                    backgroundColor: '#fff3cd',
                    border: '1px solid #ffc107',
                    borderRadius: '8px',
                    marginBottom: '20px'
                  }}>
                    <h3 style={{ color: '#856404', marginTop: 0 }}>
                      ⚠️ Clarification Needed
                    </h3>
                    <p style={{ color: '#856404', marginBottom: '10px' }}>
                      Your input needs clarification. Please answer:
                    </p>
                    <ul style={{ color: '#856404', paddingLeft: '20px' }}>
                      {lastResponse.clarification_questions?.map((question, idx) => (
                        <li key={idx} style={{ marginBottom: '8px' }}>{question}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {/* Show normal response if no clarification needed */}
                {!lastResponse.needs_clarification && (
                  <>
                    <p><strong>Total Clusters:</strong> {lastResponse.total_clusters || 0}</p>
                    
                    {/* Display clusters */}
                    {lastResponse.clusters && lastResponse.clusters.length > 0 && (
                      <div className="clusters-section" style={{ marginTop: '15px' }}>
                        <h3>Clusters ({lastResponse.clusters.length})</h3>
                        {lastResponse.clusters.map((cluster, idx) => (
                          <div key={idx} className="cluster-item" style={{
                            padding: '10px',
                            marginBottom: '10px',
                            backgroundColor: '#f8f9fa',
                            borderRadius: '4px'
                          }}>
                            <h4>Bucket {cluster.bucket_id}</h4>
                            <p>Items: {cluster.item_count}</p>
                            <p>Types: {cluster.input_types?.join(', ') || 'N/A'}</p>
                            <details>
                              <summary>Items Preview</summary>
                              {cluster.items?.map((item: any, itemIdx: number) => (
                                <div key={itemIdx} className="cluster-item-detail">
                                  <strong>{item.input_type}:</strong> {item.text_preview}
                                </div>
                              ))}
                            </details>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Display LLM responses per cluster */}
                    {lastResponse.responses && lastResponse.responses.length > 0 && (
                      <div className="responses-section" style={{ marginTop: '20px' }}>
                        <h3>LLM Responses</h3>
                        {lastResponse.responses.map((resp, idx) => (
                          <div key={idx} className="response-item" style={{
                            padding: '15px',
                            marginBottom: '15px',
                            backgroundColor: '#e7f3ff',
                            borderRadius: '8px',
                            border: '1px solid #b3d9ff'
                          }}>
                            <h4>Bucket {resp.bucket_id} Response</h4>
                            <p>Input Types: {resp.input_types?.join(', ') || 'N/A'}</p>
                            <div className="llm-response" style={{
                              marginTop: '10px',
                              padding: '10px',
                              backgroundColor: '#fff',
                              borderRadius: '4px',
                              whiteSpace: 'pre-wrap',
                              wordWrap: 'break-word'
                            }}>
                              {resp.llm_response}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Display Context Envelope */}
                    {lastResponse.context_envelope && (
                      <div className="context-envelope-section" style={{
                        marginTop: '20px',
                        padding: '15px',
                        backgroundColor: '#f8f9fa',
                        border: '1px solid #dee2e6',
                        borderRadius: '8px'
                      }}>
                        <h3>Context Envelope</h3>
                        <details>
                          <summary>View Details</summary>
                          <div style={{ marginTop: '10px' }}>
                            <p><strong>Complexity:</strong> {lastResponse.context_envelope.estimated_complexity}</p>
                            <p><strong>Urgency:</strong> {lastResponse.context_envelope.urgency}</p>
                            <p><strong>Requires Tools:</strong> {lastResponse.context_envelope.requires_tools ? 'Yes' : 'No'}</p>
                            
                            {/* Conversation History */}
                            {lastResponse.context_envelope.conversation_history && (
                              <div style={{ marginTop: '15px' }}>
                                <h4>Conversation History</h4>
                                <p><strong>Previous Inputs:</strong> {lastResponse.context_envelope.conversation_history.previous_inputs?.length || 0}</p>
                                <p><strong>Previous Responses:</strong> {lastResponse.context_envelope.conversation_history.previous_responses?.length || 0}</p>
                                {lastResponse.context_envelope.conversation_history.session_summary && (
                                  <p><strong>Summary:</strong> {lastResponse.context_envelope.conversation_history.session_summary}</p>
                                )}
                                {lastResponse.context_envelope.conversation_history.previous_inputs && lastResponse.context_envelope.conversation_history.previous_inputs.length > 0 && (
                                  <details style={{ marginTop: '10px' }}>
                                    <summary>View Previous Inputs</summary>
                                    <ul>
                                      {lastResponse.context_envelope.conversation_history.previous_inputs.map((inp: any, idx: number) => (
                                        <li key={idx}>
                                          {inp.text || `Input ${idx + 1}`} ({inp.timestamp ? new Date(inp.timestamp).toLocaleTimeString() : 'N/A'})
                                        </li>
                                      ))}
                                    </ul>
                                  </details>
                                )}
                              </div>
                            )}
                          </div>
                        </details>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
          
          <UnifiedInput
            channel="web"
            session_id={sessionId}
            onResponse={handleResponse}
            onError={handleError}
          />
        </main>
      </div>
    </div>
  );
}

export default App;
