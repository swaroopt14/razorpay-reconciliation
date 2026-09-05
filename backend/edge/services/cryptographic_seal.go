package services

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"time"

	"zord-edge/model"
)

func BuildEnvelopeHash(msg model.RawIntentMessage, ack *model.AckMessage) []byte {
	builder := bytes.NewBuffer(make([]byte, 0, 256))

	builder.WriteString(fmt.Sprintf("%d:%s", len(ack.EnvelopeId), ack.EnvelopeId))
	builder.WriteString("|")

	builder.WriteString(fmt.Sprintf("%d:%s", len(msg.TenantID), msg.TenantID))
	builder.WriteString("|")

	builder.WriteString(fmt.Sprintf("%d:%s", len(msg.TraceID), msg.TraceID))
	builder.WriteString("|")

	builder.WriteString(ack.ReceivedAt.UTC().Format(time.RFC3339Nano))
	builder.WriteString("|")

	builder.WriteString(fmt.Sprintf("%d:%s", len(msg.ContentType), msg.ContentType))
	builder.WriteString("|")

	builder.WriteString(fmt.Sprintf("%d:%s", len(msg.SourceType), msg.SourceType))
	builder.WriteString("|")

	builder.WriteString(fmt.Sprintf("%d:", len(msg.PayloadHash)))
	builder.Write(msg.PayloadHash)
	builder.WriteString("|")

	builder.WriteString(ack.ObjectRef)

	HashedEnvelope := sha256.Sum256(builder.Bytes())
	return HashedEnvelope[:]
}
