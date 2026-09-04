package model

import "time"

type AckMessage struct {
	ArtifactId        string
	ArtifactVersionId string
	EnvelopeId        string
	ReceivedAt        time.Time
	ObjectRef         string
}
