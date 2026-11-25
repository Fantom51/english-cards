
import os
from pathlib import Path
from threading import Lock

from sentence_transformers import SentenceTransformer

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
MODEL_REVISION = "8b3219a92973c328a8e22fadcfa821b5dc75636a"
CACHE_DIR = Path(__file__).resolve().parents[1] / ".venv" / "huggingface" / "hub"

_model = None
_model_lock = Lock()


def get_model():
    global _model
    with _model_lock:
        if _model is None:
            _model = SentenceTransformer(
                MODEL_NAME,
                revision=MODEL_REVISION,
                device="cpu",
                cache_folder=str(CACHE_DIR),
                local_files_only=os.getenv("HF_HUB_OFFLINE") == "1",
            )
        return _model


def get_embeddings(words: list[str]):
    return get_model().encode(
        words,
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    )


if __name__ == "__main__":
    vectors = get_embeddings(["cat", "dog", "computer"])
    print(f"{MODEL_NAME} on CPU: {vectors.shape}")
