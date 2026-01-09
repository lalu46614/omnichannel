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
from context.constructor import ContextEnvelopeConstructor
from elicitation.resolver import ElicitationResolver
from history.memory_store import history_store

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

    # Execute processing FIRST
    results = await asyncio.gather(process_text(),
                                   process_audio(),
                                   process_document())
    
    input_items = [item for item in results if item is not None]

    # Get previous clusters from history
    previous_clusters = []
    if session_id:
        previous_clusters = history_store.get_clusters(str(session_id))
    
    # Cluster with history awareness
    from semantic.clustering import cluster_inputs_with_history
    clusters = await cluster_inputs_with_history(input_items, previous_clusters)
    
    # Save clusters to history for next request
    if session_id:
        history_store.save_clusters(str(session_id), clusters)

    # Check if clarification needed
    elicitation = ElicitationResolver()
    history_data = None
    if session_id:
        history_data = history_store.get_history(str(session_id))

    resolved_clusters, _, _, needs_clarification, questions = await elicitation.analyze_and_resolve(
        input_items=input_items,
        clusters=clusters,
        conversation_history=history_data
    )
    
    # If clarification needed, return questions
    if needs_clarification:
        return {
            "input_id": input_id,
            "needs_clarification": True,
            "clarification_questions": questions,
            "clusters": resolved_clusters
        }

    constructor = ContextEnvelopeConstructor()

    context_envelope = await constructor.construct_envelope(input_items=input_items,clusters=resolved_clusters,metadata=metadata,input_id=input_id)
    all_responses = []

    for cluster in resolved_clusters:
        # Extract text directly from cluster items (includes previous requests)
        cluster_texts = []
        for cluster_item in cluster.get('items', []):
            if 'text_preview' in cluster_item:
                cluster_texts.append(cluster_item['text_preview'])
            elif 'original_data' in cluster_item and 'gateway_output' in cluster_item['original_data']:
                gw_output = cluster_item['original_data']['gateway_output']
                if 'raw_text' in gw_output:
                    cluster_texts.append(gw_output['raw_text'])
        
        combined_text = "\n\n".join(cluster_texts) if cluster_texts else ""
        
        llm_response = await call_llm(combined_text,context_envelope.model_dump())
        
        all_responses.append({
            "bucket_id": cluster['bucket_id'],
            "input_types": cluster['input_types'],
            "item_count": cluster['item_count'],
            "llm_response": llm_response
        })
    if session_id:
        # Store input
        history_store.add_input(
            str(session_id),
            {
                "input_id": input_id,
                "text": text if text else None,
                "has_audio": audio is not None,
                "has_document": document is not None,
                "channel": channel,
                "timestamp": datetime.now().isoformat()
            }
        )
        
        # Store response (if not clarification needed)
        if not needs_clarification:
            history_store.add_response(
                str(session_id),
                {
                    "input_id": input_id,
                    "clusters": len(resolved_clusters),
                    "responses_count": len(all_responses) if 'all_responses' in locals() else 0,
                    "timestamp": datetime.now().isoformat()
                }
            )
    return {
        "input_id": input_id,
        "clusters": resolved_clusters,  # Metadata about clusters
        "responses": all_responses,  # LLM responses per cluster
        "total_clusters": len(resolved_clusters),
        "context_envelope": context_envelope.model_dump()  # Serialize Pydantic model to dict
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

