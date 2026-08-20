package main

import (
	"crypto/ed25519"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"

	"zord-evidence/services"
	"zord-evidence/utils"
)

func main() {
	archivePath := flag.String("archive", "", "Path to encrypted archive pack")
	pubKeyPath := flag.String("public-key", "", "Path to public key PEM")
	decryptKeyBase64 := flag.String("decrypt-key", "", "Base64 encoded AES-256 decryption key")
	flag.Parse()

	if *archivePath == "" || *pubKeyPath == "" || *decryptKeyBase64 == "" {
		flag.Usage()
		os.Exit(1)
	}

	// 1. Initialize Decryptor
	archiveCrypto, err := services.NewArchiveCrypto(*decryptKeyBase64)
	if err != nil {
		log.Fatalf("Failed to initialize archive crypto: %v", err)
	}

	// 2. Load Public Key
	pubKeyPEM, err := os.ReadFile(*pubKeyPath)
	if err != nil {
		log.Fatalf("Failed to read public key: %v", err)
	}
	block, _ := pem.Decode(pubKeyPEM)
	if block == nil {
		log.Fatalf("Failed to decode PEM block from public key")
	}
	parsedKey, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		log.Fatalf("Failed to parse public key: %v", err)
	}
	ed25519Key, ok := parsedKey.(ed25519.PublicKey)
	if !ok {
		log.Fatalf("Public key is not ed25519")
	}

	// 3. Decrypt Archive
	blob, err := os.ReadFile(*archivePath)
	if err != nil {
		log.Fatalf("Failed to read archive: %v", err)
	}
	plaintext, err := archiveCrypto.Decrypt(blob)
	if err != nil {
		log.Fatalf("Failed to decrypt archive (corruption or wrong key): %v", err)
	}

	// 4. Parse Manifest
	var manifest services.ArchiveManifest
	if err := json.Unmarshal(plaintext, &manifest); err != nil {
		log.Fatalf("Failed to unmarshal archive manifest: %v", err)
	}

	if len(manifest.Signatures) == 0 {
		log.Fatalf("Invalid archive: No signatures present in manifest")
	}
	sig := manifest.Signatures[0]

	// 5. Verify Signature
	if !strings.HasPrefix(sig.Sig, "ZORD") {
		log.Fatalf("Invalid signature prefix")
	}
	sigBytes, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(sig.Sig, "ZORD"))
	if err != nil {
		log.Fatalf("Failed to base64 decode signature: %v", err)
	}

	if !ed25519.Verify(ed25519Key, []byte(sig.SignedPayload), sigBytes) {
		log.Fatalf("Signature verification failed: unauthorized or tampered payload")
	}

	// 6. Verify Merkle Root
	var leaves []utils.MerkleLeaf
	for i, item := range manifest.Items {
		leaves = append(leaves, utils.MerkleLeaf{
			Index:    i,
			LeafHash: item.LeafHash,
		})
	}

	// We must support both V1 and V2 to verify older archives
	var recalculatedRoot string
	// Depending on SchemaVersions or Version, but actually we can just try both and see if either matches.
	// We could also inspect if canonicalization version was set, but since it's a verifier, checking both is safe.
	v2Root := utils.BuildMerkleRoot(leaves)
	v1Root := utils.BuildMerkleRootV1(leaves)
	
	if manifest.MerkleRoot == v2Root {
		recalculatedRoot = v2Root
	} else if manifest.MerkleRoot == v1Root {
		recalculatedRoot = v1Root
	} else {
		log.Fatalf("Merkle root verification failed: expected %s, got neither V1 (%s) nor V2 (%s)", manifest.MerkleRoot, v1Root, v2Root)
	}

	fmt.Printf("✅ Verification Successful!\n")
	fmt.Printf("Evidence Pack ID: %s\n", manifest.EvidencePackID)
	fmt.Printf("Tenant ID: %s\n", manifest.TenantID)
	fmt.Printf("Merkle Root: %s\n", recalculatedRoot)
	fmt.Printf("Leaf Count: %d\n", manifest.LeafCount)
}
