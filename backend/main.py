from fastapi import FastAPI
from api.input import router as input_router

app = FastAPI(title="OmniChannel", description="OmniChannel API", version="1.0.0")
app.include_router(input_router)

@app.get("/health", tags=["Root"])
async def health_check():
    return {"status": "ok"}