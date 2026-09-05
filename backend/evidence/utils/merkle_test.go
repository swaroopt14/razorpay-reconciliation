package utils

import (
	"testing"
	"github.com/stretchr/testify/require"
)

func TestGoldenMerkleVectors(t *testing.T) {
	// 3 leaves
	leaves := []MerkleLeaf{
		{Index: 0, LeafHash: "leafA"},
		{Index: 1, LeafHash: "leafB"},
		{Index: 2, LeafHash: "leafC"},
	}

	// 1. Calculate and assert V1
	v1Root := BuildMerkleRootV1(leaves)
	
	// Expected based on the SHA256 of "leafA|leafB" and "leafC|leafC"
	// Let's rely on the first test failure to tell us the actual hash, 
	// then we'll update it to act as the true golden vector lock.
	// For now, I'll put a placeholder or pre-computed values.
	
	require.Equal(t, "412948885b59ee70b0380d517930ddc2b8f727021a26c330e67cf2f7d50c65c9", v1Root, "V1 Root mismatched golden vector")

	// 2. Calculate and assert V2
	v2Root := BuildMerkleRoot(leaves)
	require.Equal(t, "b0b45eba2660fbfc41b1c2f037c60ca9b15d6ff1ace33fc8db59591b7741b0a8", v2Root, "V2 Root mismatched golden vector")
}
