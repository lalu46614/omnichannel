from typing import Dict, List, Optional
from datetime import datetime
from collections import defaultdict

class InMemoryHistoryStore:

    def __init__(self):
        
        self._sessions: Dict[str, Dict] = defaultdict(lambda: {
            'inputs': [],
            'responses': [],
            'clusters': [],
            'topics': [],
            'user_preferences': {},
            'created_at': datetime.now(),
            'last_updated': datetime.now()
        })
    
    def add_input(self, session_id: str, input_data: Dict):
        
        if not session_id:
            return
        
        self._sessions[session_id]['inputs'].append({
            **input_data,
            'timestamp': datetime.now()
        })
        self._sessions[session_id]['last_updated'] = datetime.now()
    
    def add_response(self, session_id: str, response_data: Dict):
        
        if not session_id:
            return
        
        self._sessions[session_id]['responses'].append({
            **response_data,
            'timestamp': datetime.now()
        })
        self._sessions[session_id]['last_updated'] = datetime.now()
    
    def get_clusters(self, session_id: Optional[str]) -> List[Dict]:
        """Get previous clusters for a session"""
        if not session_id or session_id not in self._sessions:
            return []
        return self._sessions[session_id]['clusters']
    
    def save_clusters(self, session_id: str, clusters: List[Dict]):
        """Save clusters for a session"""
        if session_id:
            self._sessions[session_id]['clusters'] = clusters
            self._sessions[session_id]['last_updated'] = datetime.now()
    
    def get_history(self, session_id: Optional[str], limit: int = 10) -> Dict:
        
        if not session_id or session_id not in self._sessions:
            return {
                'previous_inputs': [],
                'previous_responses': [],
                'session_summary': None,
                'topics_discussed': [],
                'user_preferences': {}
            }
        
        session = self._sessions[session_id]
        
        # Get last N inputs and responses
        recent_inputs = session['inputs'][-limit:]
        recent_responses = session['responses'][-limit:]
        
        # Generate simple summary
        summary = self._generate_summary(session)
        
        return {
            'previous_inputs': recent_inputs,
            'previous_responses': recent_responses,
            'session_summary': summary,
            'topics_discussed': session['topics'],
            'user_preferences': session['user_preferences']
        }
    
    def _generate_summary(self, session: Dict) -> Optional[str]:
      
        if not session['inputs']:
            return None
        
        input_count = len(session['inputs'])
        response_count = len(session['responses'])
        
        return f"Session with {input_count} input(s) and {response_count} response(s)"
    
    def add_topic(self, session_id: str, topic: str):
        
        if session_id and topic:
            if topic not in self._sessions[session_id]['topics']:
                self._sessions[session_id]['topics'].append(topic)
    
    def update_preferences(self, session_id: str, preferences: Dict):
        
        if session_id:
            self._sessions[session_id]['user_preferences'].update(preferences)
    
    def clear_session(self, session_id: str):

        if session_id in self._sessions:
            del self._sessions[session_id]
    
    def get_all_sessions(self) -> List[str]:
        
        return list(self._sessions.keys())
        

    def add_paralinguistic_tags(
        self, 
        session_id: str, 
        input_id: str,
        tags: Dict[str, any]
    ):
        """Store tone, pitch, sentiment tags with input"""
        # tags: {tone, pitch_trend, sentiment, etc.}
        # Store alongside input history

# Global singleton instance
history_store = InMemoryHistoryStore()