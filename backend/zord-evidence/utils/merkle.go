package utils

import (
	"sort"
	"zord-evidence/models"
)

// MerkleSchemeVersion identifies the hashing scheme used to build a Merkle root.
// The version is stored alongside packs so old packs remain verifiable after
// the scheme is upgraded.
//
// MerkleSchemeV1 — original scheme: parent = SHA256(left + "|" + right).
//   No domain separation — vulnerable to second-preimage attacks because an
//   internal node hash and a leaf hash occupy the same hash space.
//
// MerkleSchemeV2 — current scheme: domain-separated per blueprint P1-08:
//   leaf_hash    = SHA256(0x00 || raw_leaf_data)  [applied externally, before this package]
//   internal     = SHA256(0x01 || left || "|" || right)
//
//   The 0x00/0x01 prefix ensures a leaf node and an internal node that share
//   the same raw bytes produce different hashes, closing the second-preimage
//   window. New packs use V2. Old packs were sealed with V1 and must be
//   verified with V1 (see RecomputeMerkleRootV1 in services/verify.go).
const (
	MerkleSchemeV1 = "merkle_v1" // legacy — no domain separation
	MerkleSchemeV2 = "merkle_v2" // current — domain-separated internal nodes
)

// domainLeaf is the 0x00 prefix byte reserved for leaf hashes (informational —
// leaf hashes must already be prefixed before reaching BuildMerkleRoot).
const domainLeaf = byte(0x00)

// domainInternal is the 0x01 prefix byte for internal node hashes.
const domainInternal = byte(0x01)

type MerkleLeaf struct {
	Index    int
	LeafHash string
}

// BuildMerkleRoot builds a deterministic Merkle root from a set of leaf hashes
// using MerkleSchemeV2 (domain-separated internal node hashing).
//
// Sorting: leaves are sorted by leaf_hash ascending; ties broken by original
// index. This is the canonical ordering used since service inception so that
// root computation is deterministic regardless of the order leaves are received.
//
// FIX P1-08: Internal nodes are now hashed as SHA256(0x01 || left || "|" || right)
// instead of SHA256(left || "|" || right). This prevents a second-preimage
// attack where an adversary could craft a crafted internal node whose hash
// matches a leaf hash, allowing proof forgery without altering the root.
//
// IMPORTANT: This function produces a DIFFERENT root than the V1 scheme for
// the same leaf set. All packs sealed after this change use V2. Old packs
// that were sealed with V1 must be verified using RecomputeMerkleRootV1.
func BuildMerkleRoot(leaves []MerkleLeaf) string {
	return buildRoot(leaves, true)
}

// BuildMerkleRootV1 recomputes a root using the legacy V1 scheme (no domain
// separation). Used exclusively for verifying packs that were sealed before
// the V2 upgrade. Do not use for new packs.
func BuildMerkleRootV1(leaves []MerkleLeaf) string {
	return buildRoot(leaves, false)
}

func buildRoot(leaves []MerkleLeaf, domainSeparated bool) string {
	if len(leaves) == 0 {
		return SHA256Hex("empty")
	}

	sorted := make([]MerkleLeaf, len(leaves))
	copy(sorted, leaves)
	sort.Slice(sorted, func(i, j int) bool {
		if sorted[i].LeafHash == sorted[j].LeafHash {
			return sorted[i].Index < sorted[j].Index
		}
		return sorted[i].LeafHash < sorted[j].LeafHash
	})

	level := make([]string, len(sorted))
	for i, l := range sorted {
		level[i] = l.LeafHash
	}

	for len(level) > 1 {
		next := make([]string, 0, (len(level)+1)/2)
		for i := 0; i < len(level); i += 2 {
			left := level[i]
			right := left // duplicate last node if odd count
			if i+1 < len(level) {
				right = level[i+1]
			}
			next = append(next, hashInternal(left, right, domainSeparated))
		}
		level = next
	}

	return level[0]
}

// hashInternal computes the hash of two child nodes.
// With domainSeparated=true: SHA256(0x01 || left || "|" || right)
// With domainSeparated=false: SHA256(left || "|" || right)  [V1 legacy]
func hashInternal(left, right string, domainSeparated bool) string {
	if !domainSeparated {
		return SHA256Hex(left + "|" + right)
	}
	// Prepend domain byte 0x01 to distinguish internal nodes from leaf nodes.
	data := make([]byte, 0, 1+len(left)+1+len(right))
	data = append(data, domainInternal)
	data = append(data, []byte(left)...)
	data = append(data, '|')
	data = append(data, []byte(right)...)
	return SHA256Bytes(data)
}

// BuildInclusionProofs returns, for each leaf, the ordered list of sibling
// hashes needed to reconstruct the root (§14.4 selective disclosure).
// Uses V2 domain-separated internal node hashing by default.
// Verifiers must use the same scheme version as was used to build the root.
func BuildInclusionProofs(leaves []MerkleLeaf) map[int][]models.ProofNode {
	return buildInclusionProofs(leaves, true)
}

// BuildInclusionProofsV1 builds inclusion proofs using the legacy V1 scheme.
// Used only for packs sealed before the V2 upgrade.
func BuildInclusionProofsV1(leaves []MerkleLeaf) map[int][]models.ProofNode {
	return buildInclusionProofs(leaves, false)
}

func buildInclusionProofs(leaves []MerkleLeaf, domainSeparated bool) map[int][]models.ProofNode {
	if len(leaves) == 0 {
		return nil
	}

	sorted := make([]MerkleLeaf, len(leaves))
	copy(sorted, leaves)
	sort.Slice(sorted, func(i, j int) bool {
		if sorted[i].LeafHash == sorted[j].LeafHash {
			return sorted[i].Index < sorted[j].Index
		}
		return sorted[i].LeafHash < sorted[j].LeafHash
	})

	// Build all tree levels so we can trace sibling paths.
	var levels [][]string
	level := make([]string, len(sorted))
	for i, l := range sorted {
		level[i] = l.LeafHash
	}
	levels = append(levels, level)

	for len(level) > 1 {
		next := make([]string, 0, (len(level)+1)/2)
		for i := 0; i < len(level); i += 2 {
			left := level[i]
			right := left
			if i+1 < len(level) {
				right = level[i+1]
			}
			next = append(next, hashInternal(left, right, domainSeparated))
		}
		level = next
		levels = append(levels, level)
	}

	proofs := make(map[int][]models.ProofNode, len(sorted))
	for idx, l := range sorted {
		var path []models.ProofNode
		pos := idx
		for lvl := 0; lvl < len(levels)-1; lvl++ {
			row := levels[lvl]
			if pos%2 == 0 {
				// right sibling
				siblingHash := row[pos] // duplicate (odd-count padding)
				if pos+1 < len(row) {
					siblingHash = row[pos+1]
				}
				path = append(path, models.ProofNode{Hash: siblingHash, IsLeft: false})
			} else {
				// left sibling
				path = append(path, models.ProofNode{Hash: row[pos-1], IsLeft: true})
			}
			pos /= 2
		}
		proofs[l.Index] = path
	}
	return proofs
}
