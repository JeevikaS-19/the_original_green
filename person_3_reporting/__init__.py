"""Public Person 3 reporting API."""

from importlib import import_module

__all__ = [
    "calculate_grade",
    "format_inr",
    "format_inr_short",
    "generate_report",
    "normalize_calc_results",
    "render_html",
    "render_markdown",
    "render_text",
    "run",
]


def __getattr__(name):
    if name not in __all__:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    try:
        module = import_module(".reporting", __name__)
    except ImportError:
        module = import_module("reporting")
    return getattr(module, name)
