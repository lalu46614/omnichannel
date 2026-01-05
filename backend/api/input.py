from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Optional
from uuid import UUID, uuid4
from datetime import datetime
import asyncio

from schemas.models import GatewayOutput
from metadata.enrich import add_metadata
from validators.payload import validate_text_payload, validate_audio_file, validate_document_file
from resolvers.input_type import detect_input_type
from storage.disk import save_file
from normalisation.dispatcher import normalize_input
from llm.groq_client import call_llm
from semantic.clustering import InputItem, cluster_inputs_advanced

router = APIRouter(prefix="/input", tags=["Input Gateway"])
@router.post("/unified")
async def input_unified(
    text: Optional[str] = Form(None),
    audio: Optional[UploadFile] = File(None),
    document: Optional[UploadFile] = File(None),
    channel: str = Form(...),
    user_id: Optional[UUID] = Form(None),
    session_id: Optional[UUID] = Form(None)
):

    if not text and not audio and not document:
        raise HTTPException(status_code=400, detail="At least one input is required")

    input_id = str(uuid4())
    metadata = add_metadata(channel=channel, user_id=user_id, session_id=session_id)

 
    input_items = []

    async def process_text():
        if not text:
            return None
        validate_text_payload(text)
        content_type = "plain/text"
        input_type = detect_input_type(content_type)
        gateway_output = GatewayOutput(input_id=input_id,input_type=input_type,raw_payload_ref="inline",content_type=content_type,metadata=metadata,raw_text=text)
        
        normalized_text = await normalize_input(gateway_output)
        return InputItem(input_type="text",normalized_text=normalized_text,original_data={"gateway_output": gateway_output})

    async def process_audio():
        if not audio:
            return None
        validate_audio_file(audio)
        input_type = detect_input_type(audio.content_type)
        raw_payload_ref = await save_file(audio, input_id=input_id, category="audio")
        gateway_output = GatewayOutput(input_id=input_id,input_type=input_type,raw_payload_ref=raw_payload_ref,content_type=audio.content_type,metadata=metadata)
        
        normalized_text = await normalize_input(gateway_output)
        return InputItem(input_type="audio",normalized_text=normalized_text,original_data={"gateway_output": gateway_output})

    async def process_document():
        if not document:
            return None
        validate_document_file(document)
        input_type = detect_input_type(document.content_type)
        raw_payload_ref = await save_file(document, input_id=input_id, category="document")
        gateway_output = GatewayOutput(input_id=input_id,input_type=input_type,raw_payload_ref=raw_payload_ref,content_type=document.content_type,metadata=metadata)
        
        normalized_text = await normalize_input(gateway_output)
        return InputItem(input_type="document",normalized_text=normalized_text,original_data={"gateway_output": gateway_output})

    results = await asyncio.gather(process_text(),
                                   process_audio(),
                                   process_document())
    
    input_items = [item for item in results if item is not None]
    clusters = await cluster_inputs_advanced(input_items)
    
    all_responses = []

    for cluster in clusters:
        cluster_texts = [
            item.normalized_text 
            for item in input_items 
            if any(
                item.input_type == cluster_item['input_type'] 
                for cluster_item in cluster['items']
            )
        ]
        combined_text = "\n\n".join(cluster_texts)
        
        llm_response = await call_llm(combined_text)
        
        all_responses.append({
            "bucket_id": cluster['bucket_id'],
            "input_types": cluster['input_types'],
            "item_count": cluster['item_count'],
            "llm_response": llm_response
        })
    return {
        "input_id": input_id,
        "clusters": clusters,  # Metadata about clusters
        "responses": all_responses,  # LLM responses per cluster
        "total_clusters": len(clusters)
    }

    
# TEXT
@router.post("/text")
async def input_text(text: str = Form(...), channel: str = Form(...), user_id: Optional[UUID] = Form(None), session_id: Optional[UUID] = Form(None)):
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

