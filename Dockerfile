FROM python:3.11-slim

WORKDIR /app

# Copy the entire project into the container
COPY . /app

# Move into the backend directory
WORKDIR /app/backend

# Install the Python dependencies
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install langgraph PyMuPDF

# Expose port 7860 (Hugging Face default)
EXPOSE 7860

# Run the FastAPI server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
