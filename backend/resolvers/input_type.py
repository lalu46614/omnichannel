def detect_input_type(content_type: str) -> str:
    if content_type.startswith("text"):
        return "text"
    if content_type.startswith("audio"):
        return "audio"
    return "document"