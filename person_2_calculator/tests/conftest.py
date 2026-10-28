"""Make the calculator modules importable whether pytest runs from the repo root or this folder."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
