from datetime import datetime
from schemas.models import Metadata

def add_metadata(channel: str, user_id: str, session_id: str) -> Metadata:
    return Metadata(
        channel=channel,
        user_id=user_id,
        session_id=str(session_id) if session_id else None,
        timestamp=datetime.now(),
    )