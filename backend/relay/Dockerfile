# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — builder
# ─────────────────────────────────────────────────────────────────────────────
FROM golang:1.25.5-bookworm AS builder

WORKDIR /build

# Cache dependency downloads separately from source changes.
COPY go.mod go.sum ./
RUN go mod download

# Copy source.
COPY . .

# Build a statically linked binary.
# CGO_ENABLED=1 is required by confluent-kafka-go (librdkafka).
RUN CGO_ENABLED=1 go build \
    -ldflags="-s -w -extldflags '-static'" \
    -trimpath \
    -o /relay \
    ./cmd

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — runtime (Debian slim for librdkafka compatibility)
# ─────────────────────────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

# Install CA certs (required for TLS to Kafka) and nothing else.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Non-root user.
RUN useradd --uid 10001 --no-create-home --shell /bin/false relay
USER relay

# Copy the relay binary and config from the builder stage
COPY --from=builder /relay /relay
COPY --from=builder /build/config.yaml /config.yaml

# Expose the relay metrics and health server port used by Kubernetes.
EXPOSE 8082

# Entry point to run the relay service (it will read Kafka config from ENV vars)
ENTRYPOINT ["/relay"]
