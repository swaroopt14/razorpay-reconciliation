# Build stage
FROM golang:1.25.0-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git gcc musl-dev

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./

# Copy source code first to allow go mod tidy to see all imports
RUN go mod download

# Download and tidy dependencies
COPY . .

# Build the application
RUN CGO_ENABLED=1 GOOS=linux go build -a -installsuffix cgo -o main ./cmd/main.go

# Final stage
FROM alpine:latest

# Install runtime dependencies
RUN apk --no-cache add ca-certificates postgresql-client wget

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/main /app/main
COPY --from=builder /app/db/migrations /app/db/migrations

# Create directory for logs if needed
RUN addgroup -S app && adduser -S app -G app \
    && mkdir -p /app/logs \
    && chown -R app:app /app

# Expose port
EXPOSE 8081

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:8081/v1/health || exit 1

# Run application
USER app
CMD ["./main"]
