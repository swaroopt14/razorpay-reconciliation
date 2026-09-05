FROM golang:1.25-bookworm AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
ENV CGO_ENABLED=1 GOOS=linux
RUN go mod tidy
RUN go build -trimpath -ldflags "-s -w" -o /out/zord-prompt-layer ./cmd/main.go

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -r -u 10001 app

WORKDIR /app
COPY --from=builder /out/zord-prompt-layer /app/zord-prompt-layer

USER 10001

EXPOSE 8086
CMD ["/app/zord-prompt-layer"]
