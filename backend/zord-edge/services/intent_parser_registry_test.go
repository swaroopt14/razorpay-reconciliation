package services

import "testing"

func TestGetParserByTypeDoesNotStaticParseTally(t *testing.T) {
	if _, err := GetParserByType("TALLY"); err == nil {
		t.Fatal("expected TALLY to use profile-driven pass-through, not a static parser")
	}
}
