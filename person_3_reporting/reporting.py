"""Person 3: suggestion ranking, carbon grade, and report formatting.

Input contract: ../shared/contracts/calc_output.example.json
Output contract: ../shared/contracts/report_output.example.json
"""


def rank_suggestions(calculation_results):
    """Query the knowledge base and return the top 5 actions ranked by tCO2e saved per ₹ lakh."""
    raise NotImplementedError


def calculate_grade(co2e_tons, tier):
    """Return a grade from A to F against tier benchmarks."""
    raise NotImplementedError


def format_report_json(calc_results, suggestions, grade):
    """Return the report as a JSON-serialisable dict."""
    raise NotImplementedError


def format_report_markdown(calc_results, suggestions, grade):
    """Return the report as readable text."""
    raise NotImplementedError


def format_report_html(calc_results, suggestions, grade):
    """Optional: HTML for PDF export."""
    raise NotImplementedError
