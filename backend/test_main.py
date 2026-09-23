import os
import pytest
from fastapi.testclient import TestClient
from main import app, redact_pii

client = TestClient(app)

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert "status" in response.json()

def test_pii_redaction():
    text = "Contact me at john.doe@email.com or 555-123-4567. My SSN is 000-00-0000."
    safe_text = redact_pii(text)
    assert "john.doe@email.com" not in safe_text
    assert "555-123-4567" not in safe_text
    assert "000-00-0000" not in safe_text
    assert "[REDACTED_EMAIL]" in safe_text
    assert "[REDACTED_PHONE]" in safe_text
    assert "[REDACTED_SSN]" in safe_text

def test_chat_without_doc_id():
    # Ensures the general chat endpoint handles missing doc_ids properly
    payload = {
        "query": "Hello",
        "doc_id": None
    }
    response = client.post("/chat", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "answer" in data
    assert len(data["answer"]) > 0

def test_anomaly_check():
    # Test the standalone legacy endpoint
    payload = {
        "clause": "The provider shall have zero liability in the event of any damages whatsoever."
    }
    response = client.post("/anomaly-check", json=payload)
    assert response.status_code == 200
    assert "analysis" in response.json()

def test_analyze_invalid_file_extension():
    # Verify security blocks non-PDFs
    response = client.post(
        "/analyze",
        files={"file": ("test.txt", b"dummy content", "text/plain")}
    )
    assert response.status_code == 400
    assert "Security Error" in response.json()["detail"]

def test_simplify_clause():
    payload = {
        "clause": "Notwithstanding anything to the contrary herein..."
    }
    response = client.post("/simplify", json=payload)
    assert response.status_code == 200
    assert "simplified_explanation" in response.json()

def test_rate_limiter():
    # Rapidly hit the health endpoint to trigger the 10/minute rate limit
    for _ in range(10):
        client.get("/api/health")
    response = client.get("/api/health")
    assert response.status_code == 429  # Too Many Requests
