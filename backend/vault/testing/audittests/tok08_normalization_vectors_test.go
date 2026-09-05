package audittests

// TOK-08: "Use field-kind-specific normalization and versioned token
// semantics."
//
// This is a NO-ACTIVE-BEHAVIOR-CHANGE ticket: CurrentNormalizationVersion
// ("v1") is defined to be bit-for-bit identical to the original blanket
// NormalizeValue for every one of the 6 PII kinds, so no existing token_id
// changes for anyone. A real, correct, field-kind-specific ruleset exists
// as "v2" -- built, tested, documented here -- but deliberately NOT wired
// into any active call path (see internal/crypto/deterministic.go's
// package comment for why: zord-intent-engine's duplicate-detection
// fingerprint hashes raw token VALUES for account_number/ifsc/vpa, so
// activating a version that changes those tokens for already-seen data
// would silently break existing duplicate matches).
//
// Run with: go test ./testing/... -run TestTOK08_ -v

import (
	"testing"

	"zord-token-enclave/internal/crypto"
)

// allSixKinds mirrors the exact PII kinds zord-intent-engine sends for
// tokenization (confirmed against its canonical-payload builder).
var allSixKinds = []string{"account_number", "name", "ifsc", "vpa", "phone", "email"}

// TestTOK08_V1MatchesOriginalNormalizeValue is the direct, mechanical proof
// that nothing broke: for every kind, the new versioned dispatch produces
// EXACTLY the same output as the original (pre-TOK-08) blanket
// NormalizeValue, for a representative set of real-shaped values including
// the exact Unicode/case/spacing edge cases the acceptance test asks about.
func TestTOK08_V1MatchesOriginalNormalizeValue(t *testing.T) {
	values := []string{
		"  1234567890  ",
		"Hello World",
		"HDFC0001234",
		"user@bank",
		"+91 98765-43210",
		"  Person@Example.COM  ",
		"",
		"MiXeD CaSe VaLue",
		"\ttabbed\tvalue\t",
	}

	for _, kind := range allSixKinds {
		for _, v := range values {
			originalResult := crypto.NormalizeValue(v)
			v1Result := crypto.NormalizeValueForKind("v1", kind, v)
			if originalResult != v1Result {
				t.Fatalf("kind=%q value=%q: NormalizeValue()=%q but NormalizeValueForKind(v1)=%q -- v1 must be bit-identical to the original blanket rule for every kind", kind, v, originalResult, v1Result)
			}
		}
	}

	t.Logf("CONFIRMED: NormalizeValueForKind(\"v1\", kind, v) == the original NormalizeValue(v) for all %d kinds across %d representative values -- zero behavior change.", len(allSixKinds), len(values))
}

// TestTOK08_V1GoldenVectorsPerKind pins v1's actual output (== today's
// production behavior) for one representative value per kind, so a future
// change to v1 itself (which must never happen -- v1 is frozen by
// definition) fails a test immediately rather than silently drifting.
func TestTOK08_V1GoldenVectorsPerKind(t *testing.T) {
	cases := []struct {
		kind  string
		value string
		want  string
	}{
		{"account_number", "  1234567890  ", "1234567890"},
		{"name", "  Jane Q. Public  ", "jane q. public"},
		{"ifsc", "hdfc0001234", "hdfc0001234"},
		{"vpa", "  User@Bank  ", "user@bank"},
		{"phone", "+91 98765-43210", "+91 98765-43210"},
		{"email", "  Person@Example.COM  ", "person@example.com"},
	}

	for _, c := range cases {
		got := crypto.NormalizeValueForKind("v1", c.kind, c.value)
		if got != c.want {
			t.Errorf("v1 kind=%q value=%q: got %q, want %q", c.kind, c.value, got, c.want)
		}
	}
}

// TestTOK08_V2GoldenVectorsPerKind proves the NEW, correct, per-kind rules
// -- inert today, but real and tested -- covering the exact Unicode/case/
// spacing behavior the acceptance test asks to be documented.
//
// The Unicode accent cases are built from explicit \uXXXX escapes (not
// typed literal characters) so the exact byte sequence under test is
// unambiguous: precomposedName uses é (e-acute) / í (i-acute) as
// single codepoints; combiningName spells the same visible text with a
// plain "e"/"i" followed by ́ (COMBINING ACUTE ACCENT) -- a
// genuinely different byte sequence for an identical visible name.
func TestTOK08_V2GoldenVectorsPerKind(t *testing.T) {
	precomposedName := "José García"
	combiningName := "José García"
	wantNormalizedName := "josé garcía"

	cases := []struct {
		name  string
		kind  string
		value string
		want  string
	}{
		{"account number with punctuation/spaces -> digits only", "account_number", "  1234-5678 90  ", "1234567890"},
		{"phone with country code and formatting -> digits only", "phone", "+91 98765-43210", "919876543210"},
		{"IFSC mixed case -> uppercase, not lowercase", "ifsc", "hdfc0001234", "HDFC0001234"},
		{"IFSC already uppercase -> unchanged (idempotent)", "ifsc", "HDFC0001234", "HDFC0001234"},
		{"VPA uppercase domain -> lowercase (unchanged from v1)", "vpa", "User@BANK", "user@bank"},
		{"email mixed case -> lowercase (unchanged from v1)", "email", "  Person@Example.COM  ", "person@example.com"},
		{"name with double/irregular spaces -> collapsed to one", "name", "Jane    Q.   Public", "jane q. public"},
		{"name with precomposed accents -> lowercase, NFC is a no-op", "name", precomposedName, wantNormalizedName},
		{"name with combining accents -> NFC-composed to match precomposed form", "name", combiningName, wantNormalizedName},
		{"name with tabs/newlines -> collapsed to single spaces", "name", "Jane\tQ.\nPublic", "jane q. public"},
	}

	for _, c := range cases {
		got := crypto.NormalizeValueForKind("v2", c.kind, c.value)
		if got != c.want {
			t.Errorf("%s: v2 kind=%q value=%q: got %q, want %q", c.name, c.kind, c.value, got, c.want)
		}
	}

	// The two accent-form cases above must converge to the IDENTICAL
	// normalized string -- this is the entire point of NFC normalization:
	// two visually-identical names entered via different input methods
	// (combining diacritic vs. precomposed codepoint) must tokenize to the
	// SAME value under v2, unlike v1 which would treat them as different
	// byte sequences and produce different tokens.
	combining := crypto.NormalizeValueForKind("v2", "name", combiningName)
	precomposed := crypto.NormalizeValueForKind("v2", "name", precomposedName)
	if combining != precomposed {
		t.Fatalf("v2 name normalization: combining-accent form (%q) and precomposed form (%q) did not converge -- NFC normalization is not working", combining, precomposed)
	}
	t.Log("CONFIRMED: v2's name rule NFC-normalizes so combining and precomposed Unicode accent forms of the same name converge to an identical canonical value.")
}

// TestTOK08_V1AndV2DivergeForKindsWhereTheRuleActuallyChanged proves v1 and
// v2 are genuinely DIFFERENT rulesets where the audit says they should be
// (account_number, phone, ifsc, name) -- not an accidental no-op rename.
func TestTOK08_V1AndV2DivergeForKindsWhereTheRuleActuallyChanged(t *testing.T) {
	cases := []struct {
		kind  string
		value string
	}{
		{"account_number", "1234-5678"},
		{"phone", "+91 98765-43210"},
		{"ifsc", "hdfc0001234"},
		{"name", "José"}, // combining accent -- v1 leaves bytes as-is, v2 NFC-composes
	}
	for _, c := range cases {
		v1 := crypto.NormalizeValueForKind("v1", c.kind, c.value)
		v2 := crypto.NormalizeValueForKind("v2", c.kind, c.value)
		if v1 == v2 {
			t.Errorf("kind=%q value=%q: v1 and v2 produced the SAME output (%q) -- expected them to genuinely differ for this kind", c.kind, c.value, v1)
		}
	}
}

// TestTOK08_V1AndV2AgreeForKindsWhereTheRuleDidNotChange proves vpa/email
// are UNCHANGED between v1 and v2, exactly as designed (both were already
// correct under the old blanket lowercase+trim rule).
func TestTOK08_V1AndV2AgreeForKindsWhereTheRuleDidNotChange(t *testing.T) {
	cases := []struct {
		kind  string
		value string
	}{
		{"vpa", "  User@BANK  "},
		{"email", "  Person@Example.COM  "},
	}
	for _, c := range cases {
		v1 := crypto.NormalizeValueForKind("v1", c.kind, c.value)
		v2 := crypto.NormalizeValueForKind("v2", c.kind, c.value)
		if v1 != v2 {
			t.Errorf("kind=%q value=%q: v1=%q v2=%q -- expected these to agree (vpa/email rules are unchanged between versions)", c.kind, c.value, v1, v2)
		}
	}
}

// TestTOK08_UnknownKindAndVersionFallBackSafely proves NormalizeValueForKind
// degrades to the safe blanket rule rather than panicking or erroring for
// an unrecognized kind or version -- required since token_handler.go's
// HTTP endpoint accepts an arbitrary map[string]string PII payload with no
// server-side kind allowlist.
func TestTOK08_UnknownKindAndVersionFallBackSafely(t *testing.T) {
	cases := []struct {
		name    string
		version string
		kind    string
	}{
		{"unknown kind, known version", "v1", "totally_unknown_field"},
		{"known kind, unknown version", "v99", "email"},
		{"unknown kind AND unknown version", "v99", "totally_unknown_field"},
	}
	for _, c := range cases {
		got := crypto.NormalizeValueForKind(c.version, c.kind, "  MiXeD Case Value  ")
		want := "mixed case value"
		if got != want {
			t.Errorf("%s: NormalizeValueForKind(%q, %q, ...) = %q, want safe fallback %q", c.name, c.version, c.kind, got, want)
		}
	}
	t.Log("CONFIRMED: an unrecognized kind or version falls back to the safe blanket lowercase+trim rule instead of panicking or erroring.")
}

// TestTOK08_GenerateDeterministicTokenVersionIsReal proves the version
// parameter genuinely changes the HMAC output -- the entire point of
// "versioned token semantics": the SAME secret/tenant/kind/value under two
// different version strings must produce two different token IDs.
func TestTOK08_GenerateDeterministicTokenVersionIsReal(t *testing.T) {
	secret := []byte("tok08-version-test-secret")
	tokenV1 := crypto.GenerateDeterministicToken(secret, "tenant-1", "email", "v1", "same@example.com")
	tokenV2 := crypto.GenerateDeterministicToken(secret, "tenant-1", "email", "v2", "same@example.com")
	if tokenV1 == tokenV2 {
		t.Fatal("GenerateDeterministicToken produced the SAME token for two different version strings -- versioning is not actually affecting the HMAC")
	}
	t.Log("CONFIRMED: GenerateDeterministicToken's version parameter genuinely changes the token output.")
}
