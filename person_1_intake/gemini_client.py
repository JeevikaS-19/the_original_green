"""Gemini client for the estimation step. Reads the key from the environment, never from a file.

Set GEMINI_API_KEY in a .env file at the repo root (git-ignored), or in your environment.
Optional: GEMINI_MODEL (default below). Nothing here runs unless a caller asks for it.
"""

import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parents[1] / ".env"  # repo root; git-ignored

DEFAULT_MODEL = "gemini-3.8-flash"  # older models are retired for new keys; change with GEMINI_MODEL
RETRIES = 3
RETRY_SECONDS = 5
ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class GeminiNotConfigured(RuntimeError):
    """GEMINI_API_KEY is not set in the environment."""


def load_env_file(path=ENV_FILE):
    """Read KEY=VALUE lines into os.environ. Existing environment variables win."""
    if not Path(path).exists():
        return
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        os.environ.setdefault(name.strip(), value.strip().strip('"').strip("'"))


def gemini_client_from_env(timeout=30):
    """Return a callable prompt -> text, or raise GeminiNotConfigured if no key is set."""
    load_env_file()
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise GeminiNotConfigured("GEMINI_API_KEY is not set in the environment")
    model = os.environ.get("GEMINI_MODEL", DEFAULT_MODEL)
    url = ENDPOINT.format(model=model)

    def call(prompt):
        body = json.dumps({
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2},
        }).encode("utf-8")
        request = urllib.request.Request(url, data=body, method="POST", headers={
            "Content-Type": "application/json",
            "x-goog-api-key": key,
        })
        for attempt in range(RETRIES + 1):
            try:
                with urllib.request.urlopen(request, timeout=timeout) as response:
                    data = json.loads(response.read().decode("utf-8"))
                return data["candidates"][0]["content"]["parts"][0]["text"]
            except urllib.error.HTTPError as error:
                # Busy or rate-limited: wait and try again. Other errors are raised at once.
                if error.code not in (429, 503) or attempt == RETRIES:
                    raise
                time.sleep(RETRY_SECONDS * (attempt + 1))

    return call
