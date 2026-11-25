import logging
from time import perf_counter
from typing import Annotated

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from .clustering import cluster_embeddings
from .embeddings import MODEL_NAME, MODEL_REVISION, get_embeddings

logger = logging.getLogger(__name__)
DEFAULT_THRESHOLD = 0.65

app = FastAPI(title="Vocabulary Pro API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8001", "http://127.0.0.1:8001"],
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)

NonBlank = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class Entry(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: NonBlank
    text: NonBlank


class ClusterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    entries: list[Entry] = Field(max_length=500)
    distance_threshold: float = Field(default=DEFAULT_THRESHOLD, gt=0, le=2, strict=True)

    @model_validator(mode="after")
    def unique_ids(self):
        if len({entry.id for entry in self.entries}) != len(self.entries):
            raise ValueError("Entry IDs must be unique")
        return self


@app.get("/")
def root():
    return {"message": "Vocabulary Pro API is running"}


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/api/cluster")
def cluster(request: ClusterRequest):
    ids = [entry.id for entry in request.entries]
    start = perf_counter()
    groups = []
    singles = ids
    if len(ids) > 1:
        try:
            vectors = get_embeddings([entry.text for entry in request.entries])
        except Exception as error:
            logger.exception("Embedding model unavailable")
            raise HTTPException(503, "Модель недоступна. Проверьте кэш и инструкции запуска.") from error
        groups, singles = cluster_embeddings(ids, vectors, request.distance_threshold)
    return {
        "groups": groups,
        "ungrouped": singles,
        "processed_count": len(ids),
        "parameters": {
            "model": MODEL_NAME, "revision": MODEL_REVISION,
            "metric": "cosine", "linkage": "average",
            "distance_threshold": request.distance_threshold,
        },
        "elapsed_ms": round((perf_counter() - start) * 1000, 1),
    }
