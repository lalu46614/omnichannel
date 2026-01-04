from pathlib import Path
from typing import Union
import pdfplumber
from docx import Document
from schemas.models import GatewayOutput

def _extract_text_from_pdf(path: str) -> str:
    text_chunks =[]
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_chunks.append(page_text)
    return "\n".join(text_chunks)

def _extract_text_from_doc(path: str) -> str:
    doc = Document(path)
    text_chunks =[]
    for para in doc.paragraphs:
        if para.text.strip():
            text_chunks.append(para.text)
    return "\n".join(text_chunks)

def _extract_text_from_txt(path: str) -> str:
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()

async def normalize_document(gateway_output: GatewayOutput) -> str:
    path = gateway_output.raw_payload_ref.replace("local://", "")
    suffix = Path(path).suffix.lower()
    
    if suffix == ".pdf":
        return _extract_text_from_pdf(path)
    elif suffix == ".doc" or suffix == ".docx":
        return _extract_text_from_doc(path)
    elif suffix == ".txt":
        return _extract_text_from_txt(path)
    else:
        raise ValueError(f"Unsupported file type: {suffix}")