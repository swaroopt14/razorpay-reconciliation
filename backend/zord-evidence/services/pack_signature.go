package services

import (
	"time"
	"zord-evidence/models"
	"zord-evidence/utils"
)

// buildPackSignature creates a fully-populated Signature row for evidence_pack_signatures.
func buildPackSignature(signer *Signer, canonicalVersion, payload string, signedAt time.Time) models.Signature {
	return models.Signature{
		Signer:                  models.SignerIDZordEvidence,
		Alg:                     "ed25519",
		Sig:                     signer.Sign(payload),
		SignedAt:                signedAt,
		KeyID:                   signer.KeyID(),
		SignedPayloadHash:       utils.SHA256Hex(payload),
		SignedPayload:           payload,
		CanonicalizationVersion: canonicalVersion,
		VerificationStatus:      models.SignatureVerificationNotVerified,
	}
}
