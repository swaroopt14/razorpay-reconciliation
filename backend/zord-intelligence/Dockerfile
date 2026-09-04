FROM golang:1.25-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN go mod tidy

ARG TARGETOS=linux
ARG TARGETARCH=amd64
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags "-s -w" -o /out/zord-intelligence ./cmd/main.go

FROM alpine:3.19

RUN apk add --no-cache wget ca-certificates \
    && adduser -D -u 65532 nonroot

WORKDIR /app

COPY --from=builder /out/zord-intelligence /app/zord-intelligence
COPY --from=builder /src/db/migrations /app/db/migrations

ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
USER 65532:65532

EXPOSE 8089

ENTRYPOINT ["/app/zord-intelligence"]
