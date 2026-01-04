from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Optional
from uuid import UUID, uuid4
from datetime import datetime

from schemas.models import GatewayOutput
from metadata.enrich import add_metadata
from validators.payload import validate_text_payload, validate_audio_file, validate_document_file
from resolvers.input_type import detect_input_type
from storage.disk import save_file
from normalisation.dispatcher import normalize_input
from llm.groq_client import call_llm

router = APIRouter(prefix="/input", tags=["Input Gateway"])

# TEXT
@router.post("/text")
async def input_text(text: str, channel: str = Form(...), user_id: Optional[UUID] = Form(None), session_id: Optional[UUID] = Form(None)):
    validate_text_payload(text)

    input_id = str(uuid4())
    content_type = "text/plain"
    input_type = detect_input_type(content_type)
    raw_payload_ref = "inline"
    metadata = add_metadata(channel=channel, user_id=user_id, session_id=session_id)

    gateway_output = GatewayOutput(input_id=input_id, input_type=input_type, raw_payload_ref=raw_payload_ref, content_type=content_type, metadata=metadata, raw_text=text)
    normalize_text = await normalize_input(gateway_output)
    llm_response = await call_llm(normalize_text)
    return {
        "input_id": input_id,
        "llm_response": llm_response
    }

# AUDIO
@router.post("/audio")
async def input_audio(audio: UploadFile = File(...), channel: str = Form(...), user_id: Optional[UUID] = Form(None), session_id: Optional[UUID] = Form(None)):
    validate_audio_file(audio)

    input_id = str(uuid4())
    input_type = detect_input_type(audio.content_type)
    raw_payload_ref = await save_file(audio, input_id=input_id, category="audio")
    metadata = add_metadata(channel=channel, user_id=user_id, session_id=session_id)

    gateway_output = GatewayOutput(input_id=input_id, input_type=input_type, raw_payload_ref=raw_payload_ref, content_type=audio.content_type, metadata=metadata)
    normalize_text = await normalize_input(gateway_output)
    llm_response = await call_llm(normalize_text)
    return {
        "input_id": input_id,
        "llm_response": llm_response
    }

# DOCUMENT
@router.post("/document")
async def input_document(document: UploadFile = File(...), channel: str = Form(...), user_id: Optional[UUID] = Form(None), session_id: Optional[UUID] = Form(None)):
    validate_document_file(document)

    input_id = str(uuid4())
    input_type = detect_input_type(document.content_type)
    raw_payload_ref = await save_file(document, input_id=input_id, category="document")
    metadata = add_metadata(channel=channel, user_id=user_id, session_id=session_id)

    gateway_output = GatewayOutput(input_id=input_id, input_type=input_type, raw_payload_ref=raw_payload_ref, content_type=document.content_type, metadata=metadata)
    normalize_text = await normalize_input(gateway_output)
    llm_response = await call_llm(normalize_text)
    return {
        "input_id": input_id,
        "llm_response": llm_response
    }