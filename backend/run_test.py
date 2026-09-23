import subprocess
import time
import httpx
from fpdf import FPDF
import os
import json

print("1. Generating dummy PDF...")
pdf = FPDF()
pdf.add_page()
pdf.set_font("Arial", size=12)
pdf.cell(200, 10, txt="Confidentiality Agreement", ln=1, align='C')
pdf.multi_cell(0, 10, txt="This Non-Disclosure Agreement (NDA) is entered into by the parties. The receiving party shall not disclose any confidential information. The penalty for breach of this agreement is an immediate fine of $50,000. Employee John Doe (SSN: 123-45-6789) is bound by this contract. Contact john@example.com for questions. The employee retains the right to report illegal activities to the authorities.")
pdf.output("test_contract.pdf")

print("2. Starting FastAPI server in the background...")
# Run uvicorn in the background
server_process = subprocess.Popen(["uvicorn", "main:app", "--port", "8000"])
time.sleep(4)  # Wait for server to fully spin up

try:
    print("\n3. Testing API Root (GET /)...")
    root_res = httpx.get("http://127.0.0.1:8000/")
    print(f"Root response: {root_res.json()}")

    print("\n4. Testing AI Analysis Endpoint (POST /analyze)...")
    print("Sending test_contract.pdf to Groq LLM...")
    with open("test_contract.pdf", "rb") as f:
        files = {'file': ('test_contract.pdf', f, 'application/pdf')}
        # Increased timeout because LLM generation can take a few seconds
        res = httpx.post("http://127.0.0.1:8000/analyze", files=files, timeout=45.0)
    
    print(f"\nResponse Status: {res.status_code}")
    if res.status_code == 200:
        print("\nSUCCESS! Extracted JSON:")
        print(json.dumps(res.json(), indent=2))
    else:
        print("\nERROR:")
        print(res.text)

finally:
    print("\n5. Shutting down test server...")
    server_process.terminate()
