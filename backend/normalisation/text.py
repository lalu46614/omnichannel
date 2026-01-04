from schemas.models import GatewayOutput

def normalize_text(gateway_output: GatewayOutput) -> str:
    if not gateway_output.raw_text:
        raise ValueError("raw_text is not set")

    return gateway_output.raw_text