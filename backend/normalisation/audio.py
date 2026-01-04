import whisper
from schemas.models import GatewayOutput

model = whisper.load_model("base")

async def normalize_audio(gateway_output: GatewayOutput) -> str:
    path = gateway_output.raw_payload_ref.replace("local://", "")
    result = model.transcribe(path)
    return result["text"]