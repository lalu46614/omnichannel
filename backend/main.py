from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.input import router as input_router


app = FastAPI(title="OmniChannel", description="OmniChannel API", version="1.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(input_router)


@app.get("/health", tags=["Root"])
async def health_check():
    return {"status": "ok"}