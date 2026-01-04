def detect_input_type(input_type: str) -> str:
    if input_type == "text":
        return "text"
    elif input_type == "audio":
        return "audio"
    elif input_type == "document":
        return "document"
    else:
        raise ValueError("Invalid input type")