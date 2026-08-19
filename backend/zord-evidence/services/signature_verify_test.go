package services

import (
	"crypto/ed25519"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"zord-evidence/models"
	"zord-evidence/utils"
)

var testTime = time.Date(2024, 1, 15, 10, 30, 0, 0, time.UTC)

func TestTestVectorDeterminism(t *testing.T) {
	// Create a test pack
	pack := &models.EvidencePack{
		EvidencePackID: "determinism-test",
		TenantID:       "tenant-1",
		Mode:           "INTELLIGENCE_ATTACH",
		IntentID:       "intent-1",
		RulesetVersion: "1.0.0",
		MerkleRoot:     "test-merkl",
		CreatedAt:      testTime,
		SchemaVersions: map[string]string{
			"raw_settlement_line": "v1",
		},
		Items: []models.EvidenceItem{
			{
				Type:        "RAW_SETTLEMENT_LINE",
				Ref:         "ref-1",
				Hash:        "hash-1",
				SchemaVersion: "v1",
				LeafHash:    "leaf-hash-1",
			},
		},
	}

	// Generate test vector twice
	vector1, err := utils.TestVector(pack, nil, "v1")
	require.NoError(t, err)

	vector2, err := utils.TestVector(pack, nil, "v1")
	require.NoError(t, err)

	// Vectors should be identical
	require.Equal(t, vector1, vector2, "TestVector should produce deterministic output")

	// Verify required fields present
	require.Contains(t, vector1, "evidence_pack_id")
	require.Contains(t, vector1, "tenant_id")
	require.Contains(t, vector1, "merkle_root")
	require.Contains(t, vector1, "ruleset_version")
	require.Contains(t, vector1, "canonicalization_version")
	require.Contains(t, vector1, "signatures")
	require.Contains(t, vector1, "manifest")

	// Verify canonicalization_version
	require.Equal(t, "v1", vector1["canonicalization_version"])
	require.Equal(t, "v1", vector2["canonicalization_version"])
}

func TestTestVectorV2(t *testing.T) {
	// Create a test pack with v2 fields
	pack := &models.EvidencePack{
		EvidencePackID: "v2-test",
		TenantID:       "tenant-1",
		Mode:           "INTELLIGENCE_ATTACH",
		IntentID:       "intent-1",
		RulesetVersion: "2.0.0",
		MerkleRoot:     "test-merkl-v2",
		CreatedAt:      testTime,
		SchemaVersions: map[string]string{
			"raw_settlement_line": "v2",
		},
		Items: []models.EvidenceItem{
			{
				Type:        "RAW_SETTLEMENT_LINE",
				Ref:         "ref-1",
				Hash:        "hash-1",
				SchemaVersion: "v2",
				LeafHash:    "leaf-hash-1",
				HashType:    "SHA256",
				Version:     "v2",
			},
		},
	}

	// Generate v2 test vector
	vector, err := utils.TestVector(pack, nil, "v2")
	require.NoError(t, err)

	// Verify canonicalization_version is "v2"
	require.Equal(t, "v2", vector["canonicalization_version"])

	// Verify manifest contains canonicalization_version
	// The manifest is a JSON string in the vector
	vectorMap := make(map[string]interface{})
	json.Unmarshal([]byte(vector["manifest"].(string)), &vectorMap)
	// The manifest's canonicalization_version matches what was passed to TestVector
	require.Contains(t, vectorMap, "canonicalization_version")
	require.Equal(t, "v2", vectorMap["canonicalization_version"])
}

func TestVerifyPackSignature(t *testing.T) {
	// Generate Key A
	pubA, privA, _ := ed25519.GenerateKey(nil)
	signerA := &Signer{private: privA}
	svcWithA := &EvidenceService{signer: signerA}

	// Generate Key B
	pubB, privB, _ := ed25519.GenerateKey(nil)
	signerB := &Signer{private: privB}
	svcWithB := &EvidenceService{signer: signerB}

	// Ignore unused variables for now, just to use ed25519
	_ = pubA
	_ = pubB

	pack := &models.EvidencePack{
		EvidencePackID: "pack-1",
		TenantID:       "tenant-1",
		MerkleRoot:     "root-1",
		IntentID:       "intent-1",
		CreatedAt:      time.Now(),
		RulesetVersion: "1.0",
	}

	// 1. Pack with no signatures fails
	err := svcWithA.VerifyPackSignature(pack)
	require.ErrorIs(t, err, ErrSignatureVerificationFailed)

	// 2. Sign with Key A
	manifest := reconstructPackManifest(pack)
	canonicalVersion := "v1"
	canonicalBytes := []byte(strings.Join([]string{
		canonicalVersion,
		pack.EvidencePackID,
		pack.MerkleRoot,
		manifest.ScopeID,
		pack.CreatedAt.Format(time.RFC3339Nano),
		pack.RulesetVersion,
	}, "|"))
	computedHash := utils.SHA256Hex(string(canonicalBytes))
	payload := string(canonicalBytes)
	sigVal := signerA.Sign(payload)

	pack.Signatures = []models.Signature{
		{
			Alg:                     "ed25519",
			Sig:                     sigVal,
			SignedPayload:           payload,
			SignedPayloadHash:       computedHash,
			CanonicalizationVersion: "v1",
		},
	}

	// Verify with Key A should pass
	err = svcWithA.VerifyPackSignature(pack)
	require.NoError(t, err, "Signature created with Key A should verify with Key A")

	// Verify with Key B should fail
	err = svcWithB.VerifyPackSignature(pack)
	require.ErrorIs(t, err, ErrSignatureVerificationFailed, "Signature from Key A must not verify with Key B")

	// 3. Tamper with the pack metadata (which alters the computed hash in VerifyPackSignature)
	pack.MerkleRoot = "tampered-root"
	err = svcWithA.VerifyPackSignature(pack)
	require.ErrorIs(t, err, ErrSignatureVerificationFailed, "Tampered pack metadata should fail verification")

	// 4. Restore metadata, tamper with the payload itself
	pack.MerkleRoot = "root-1"
	pack.Signatures[0].SignedPayload = "tampered payload"
	err = svcWithA.VerifyPackSignature(pack)
	require.ErrorIs(t, err, ErrSignatureVerificationFailed, "Tampered payload should fail verification")
}