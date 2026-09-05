# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

# Install build tools required by some wheels (confluent-kafka needs librdkafka)
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc \
        librdkafka-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

# Install only the runtime shared library for librdkafka
RUN apt-get update && apt-get install -y --no-install-recommends \
        librdkafka1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy service source
COPY main.py .
COPY app/ app/
COPY healthcheck.py .
COPY scripts/ scripts/
COPY model_artifacts/ model_artifacts/

# Copy entrypoint (auto-trains RCA model on first deploy if no .pkl exists)
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create data directory for model persistence
RUN mkdir -p /data && chmod 777 /data

# Run as non-root
RUN useradd -r -u 1001 mluser
USER mluser

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 8091

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
    CMD python /app/healthcheck.py

ENTRYPOINT ["/entrypoint.sh"]
