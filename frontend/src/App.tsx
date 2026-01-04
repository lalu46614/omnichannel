import { useState } from 'react';
import { UnifiedInput } from './components/UnifiedInput';
import './styles/index.css';

function App() {
  const [lastResponse, setLastResponse] = useState<{
    input_id: string;
    llm_response: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleResponse = (response: { input_id: string; llm_response: string }) => {
    setLastResponse(response);
    setError(null);
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
  };

  return (
    <div className="app">
      <div className="app-container">
        <header className="app-header">
          <h1>OmniChannel</h1>
        </header>
        
        <main className="app-main">
          {error && (
            <div className="error-banner">
              <strong>Error:</strong> {error}
            </div>
          )}
          
          {lastResponse && (
            <div className="response-container">
              <h2>Response</h2>
              <div className="response-content">
                <p><strong>Input ID:</strong> {lastResponse.input_id}</p>
                <div className="llm-response">
                  <strong>LLM Response:</strong>
                  <pre>{lastResponse.llm_response}</pre>
                </div>
              </div>
            </div>
          )}
          
          <UnifiedInput
            channel="web"
            onResponse={handleResponse}
            onError={handleError}
          />
        </main>
      </div>
    </div>
  );
}

export default App;

