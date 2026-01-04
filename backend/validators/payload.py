from fastapi import UploadFile, HTTPException

MAX_TEXT_LENGTH = 10000
MAX_AUDIO_SIZE_MB = 20
MAX_DOC_SIZE_MB = 20

ALLOWED_AUDIO_FORMATS = {"audio/mpeg", "audio/wav", "audio/webm"}
ALLOWED_DOC_FORMATS = {"application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"}

def validate_text_payload(text: str) -> None:
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Text is required")
    if len(text) > MAX_TEXT_LENGTH:
        raise HTTPException(status_code=413, detail="Text is too long")

def _validate_file_size(file: UploadFile, max_size_mb: int) -> None:
    if file.size is None:
        return
    if file.size > max_size_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File is too large. Max size is {max_size_mb} MB")

def validate_audio_file(file: UploadFile) -> None:
    if file.content_type:
        # Handle MIME types with codecs (e.g., "audio/webm;codecs=opus")
        content_type_base = file.content_type.split(';')[0].strip()
        if content_type_base not in ALLOWED_AUDIO_FORMATS:
            raise HTTPException(status_code=415, detail="Invalid audio format")
    else:
        raise HTTPException(status_code=415, detail="Invalid audio format")
    _validate_file_size(file, MAX_AUDIO_SIZE_MB)

def validate_document_file(file: UploadFile) -> None:
    if file.content_type not in ALLOWED_DOC_FORMATS:
        raise HTTPException(status_code=415, detail="Invalid document format")
    _validate_file_size(file, MAX_DOC_SIZE_MB)
