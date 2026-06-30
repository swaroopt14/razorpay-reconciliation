package utils

import (
	"sort"
	"zord-evidence/models"
)

type MerkleLeaf struct {
	Index    int
	LeafHash string
}

// BuildMerkleRoot deterministically sorts leaves by leaf_hash (ties broken by
// original index), then pairs and hashes upward until one root remains.
// Formula per spec §11.4: parent = SHA256(left || right)
func BuildMerkleRoot(leaves []MerkleLeaf) string {
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
			next = append(next, SHA256Hex(left+"|"+right))
		}
		level = next
	}

	return level[0]
}

// BuildInclusionProofs returns, for each leaf, the ordered list of sibling
// hashes needed to reconstruct the root (§14.4 selective disclosure).
// The leaves slice should already be deterministically sorted for consistency.
func BuildInclusionProofs(leaves []MerkleLeaf) map[int][]models.ProofNode {
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

	// Build each tree level so we can trace sibling paths.
	levels := [][]string{}
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
			next = append(next, SHA256Hex(left+"|"+right))
		}
		level = next
		levels = append(levels, level)
	}

	proofs := make(map[int][]models.ProofNode, len(sorted))
	for idx, l := range sorted {
		path := []models.ProofNode{}
		pos := idx
		for lvl := 0; lvl < len(levels)-1; lvl++ {
			row := levels[lvl]
			if pos%2 == 0 {
				// right sibling
				siblingHash := row[pos] // duplicate
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
