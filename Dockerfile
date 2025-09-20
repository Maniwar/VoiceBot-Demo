# Multi-stage build for optimized image size
FROM python:3.11-slim as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# Production stage
FROM python:3.11-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy Python packages from builder
COPY --from=builder /root/.local /root/.local

# Make sure scripts in .local are usable
ENV PATH=/root/.local/bin:$PATH

# Copy application code
COPY src/ ./src/
COPY public/ ./public/
COPY data/api_config.json ./data/api_config.json

# Create necessary directories
RUN mkdir -p /app/logs /app/data/chroma_db /app/data/uploads

# Copy any Python scripts in root
COPY *.py ./

# Set environment variables
ENV PORT=3000 \
    HOST=0.0.0.0 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Expose port
EXPOSE 3000

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Run the application
CMD ["python", "src/server.py"]