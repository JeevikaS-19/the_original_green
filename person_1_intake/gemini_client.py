"""Gemini client for the estimation step. Reads the key from the environment, never from a file.

Set GEMINI_API_KEY in your environment (for example: setx GEMINI_API_KEY "your-key").
Optional: GEMINI_MODEL (default below). Nothing here runs unless a caller asks for it.
"""

import json
import os
import urllib.request

DEFAULT_MODEL = "gemini-2.5-flash"  # change with GEMINI_MODEL if your account uses another model
ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class GeminiNotConfigured(RuntimeError):
    """GEMINI_API_KEY is not set in the environment."""


def gemini_client_from_env(timeout=30):
    """Return a callable prompt -> text, or raise GeminiNotConfigured if no key is set."""
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
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = json.loads(response.read().decode("utf-8"))
        return data["candidates"][0]["content"]["parts"][0]["text"]

    return call
