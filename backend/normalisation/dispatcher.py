from schemas.models import GatewayOutput
from normalisation.text import normalize_text
from normalisation.audio import normalize_audio
from normalisation.document import normalize_document

async def normalize_input(gateway_output: GatewayOutput) -> str:
    if gateway_output.input_type == "text":
        return normalize_text(gateway_output)
    elif gateway_output.input_type == "audio":
        return await normalize_audio(gateway_output)
    elif gateway_output.input_type == "document":
        return await normalize_document(gateway_output)

    raise ValueError(f"Unsupported input type: {gateway_output.input_type}")