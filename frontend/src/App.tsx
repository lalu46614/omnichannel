import { useState } from 'react';
import { UnifiedInput } from './components/UnifiedInput';
import './styles/index.css';

function App() {
  const [lastResponse, setLastResponse] = useState<{
    input_id: string;
    clusters: any[];
    responses: any[];
    total_clusters: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleResponse = (response: { 
    input_id: string; 
    clusters: any[];
    responses: any[];
    total_clusters: number;
  }) => {
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
                <p><strong>Total Clusters:</strong> {lastResponse.total_clusters}</p>
                
                {/* Display clusters */}
                <div className="clusters-section">
                  <h3>Clusters ({lastResponse.clusters.length})</h3>
                  {lastResponse.clusters.map((cluster, idx) => (
                    <div key={idx} className="cluster-item">
                      <h4>Bucket {cluster.bucket_id}</h4>
                      <p>Items: {cluster.item_count}</p>
                      <p>Types: {cluster.input_types.join(', ')}</p>
                      <details>
                        <summary>Items Preview</summary>
                        {cluster.items.map((item: any, itemIdx: number) => (
                          <div key={itemIdx} className="cluster-item-detail">
                            <strong>{item.input_type}:</strong> {item.text_preview}
                          </div>
                        ))}
                      </details>
                    </div>
                  ))}
                </div>

                {/* Display LLM responses per cluster */}
                <div className="responses-section">
                  <h3>LLM Responses</h3>
                  {lastResponse.responses.map((resp, idx) => (
                    <div key={idx} className="response-item">
                      <h4>Bucket {resp.bucket_id} Response</h4>
                      <p>Input Types: {resp.input_types.join(', ')}</p>
                      <div className="llm-response">
                        <pre>{resp.llm_response}</pre>
                      </div>
                    </div>
                  ))}
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

