import whisper
from schemas.models import GatewayOutput
import asyncio

_model = None

def get_whisper_model():
    """Lazy load Whisper model"""
    global _model
    if _model is None:
        print("Loading Whisper model (first time only, this may take a minute)...")
        _model = whisper.load_model("tiny")
        print("Whisper model loaded!")
    return _model

async def normalize_audio(gateway_output: GatewayOutput) -> str:
    path = gateway_output.raw_payload_ref.replace("local://", "")
    model = get_whisper_model()
    # Run CPU-bound transcription in thread pool
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: model.transcribe(path)
    )
    return result["text"]