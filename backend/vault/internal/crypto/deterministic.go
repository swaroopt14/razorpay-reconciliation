package crypto

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strings"

	"golang.org/x/text/unicode/norm"
)

// TOK-08: "Use field-kind-specific normalization and versioned token
// semantics." CurrentNormalizationVersion is the version every ACTIVE
// tokenize call uses today -- its rule for every kind is defined to be
// EXACTLY strings.ToLower(strings.TrimSpace(v)), bit-for-bit identical to
// this package's original blanket NormalizeValue, so this ticket changes
// NO existing token_id for ANY kind. A real, correct, field-kind-specific
// ruleset exists as "v2" (see normalizationRulesV2 below) -- built, unit-
// tested, documented, but deliberately NOT wired into any active call
// path. Activating v2 is a separate, future, coordinated decision: this
// service's DetokenizeFields looks tokens up by their token_id primary
// key rather than recomputing the HMAC, so existing ciphertext stays
// readable regardless -- but zord-intent-engine's duplicate-detection
// fingerprint (computeBeneficiaryFingerprint, business_idempotency_registry)
// hashes the raw token VALUES for account_number/ifsc/vpa, so any change
// to what those three kinds compute for already-seen real data would
// silently break existing duplicate matches the moment it went live.
const CurrentNormalizationVersion = "v1"

// CurrentSecretVersion is a placeholder satisfying the audit's literal
// "store token policy/secret version" wording -- there is currently only
// one TOKEN_SECRET and no rotation mechanism for it, so this is always 1
// today. A future secret-rotation ticket must follow the SAME versioned-
// rotation discipline this ticket establishes for normalization: secret
// rotation carries the identical stable-matching risk, for the identical
// reason (token lookups are by token_id, never a recomputed HMAC).
const CurrentSecretVersion = 1

// normalizationRule is a pure function from a raw PII value to its
// canonical form for one (version, kind) pair.
type normalizationRule func(string) string

func lowerTrim(v string) string {
	return strings.ToLower(strings.TrimSpace(v))
}

// normalizationRulesV1 -- every kind maps to the SAME lowerTrim rule,
// written out per-kind (not one shared blanket call) specifically so
// "bit-identical to the original NormalizeValue, for every kind" is
// auditable directly in this table, not merely implied.
var normalizationRulesV1 = map[string]normalizationRule{
	"account_number": lowerTrim,
	"name":           lowerTrim,
	"ifsc":           lowerTrim,
	"vpa":            lowerTrim,
	"phone":          lowerTrim,
	"email":          lowerTrim,
}

// normalizationRulesV2 -- the audit's actually-intended per-kind rules.
// NOT wired into any active call path yet (see CurrentNormalizationVersion).
//
// account_number / phone: routing/account identifiers and phone numbers
// are compared by their DIGITS, not their formatting -- "123-456" and
// "123 456" and "123456" are the same account. Strips every non-digit
// character (drops separators, spaces, a leading "+" country-code marker)
// rather than just trimming, so formatting differences that don't change
// the underlying digits don't produce different tokens.
//
// ifsc: bank routing codes are conventionally uppercase
// (^[A-Z]{4}0[A-Z0-9]{6}$, per zord-intent-engine's own validation regex)
// -- canonicalizing to uppercase (not lowercase) matches the real-world
// convention instead of an arbitrary case choice.
//
// vpa / email: unchanged from v1 (lowercase+trim) -- both are
// conventionally treated case-insensitively by the systems that issue
// them, so v1's existing rule was already correct for these two kinds.
//
// name: the one kind where v1's plain lowercase+trim is least correct --
// Unicode text can represent the same visible name as different byte
// sequences (combining vs. precomposed accents), and free-text names
// often carry irregular internal whitespace (tabs, double spaces, non-
// breaking spaces from copy-paste). NFC-normalizes first (canonical
// composition, so "é" as combining-accent and "é" as one precomposed
// codepoint become identical), then lowercases, then collapses any run
// of whitespace to a single space and trims the ends.
var normalizationRulesV2 = map[string]normalizationRule{
	"account_number": stripNonDigits,
	"phone":          stripNonDigits,
	"ifsc":           upperTrim,
	"vpa":            lowerTrim,
	"email":          lowerTrim,
	"name":           normalizeNameV2,
}

func upperTrim(v string) string {
	return strings.ToUpper(strings.TrimSpace(v))
}

func stripNonDigits(v string) string {
	var b strings.Builder
	for _, r := range v {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func normalizeNameV2(v string) string {
	composed := norm.NFC.String(v)
	lowered := strings.ToLower(composed)
	collapsed := strings.Join(strings.Fields(lowered), " ")
	return collapsed
}

var normalizationRuleSets = map[string]map[string]normalizationRule{
	"v1": normalizationRulesV1,
	"v2": normalizationRulesV2,
}

// NormalizeValueForKind performs canonicalization for one PII value,
// dispatched by (version, kind). Falls back to today's blanket
// lowercase+trim rule for a version or kind it doesn't recognize --
// required because token_handler.go's HTTP endpoint accepts an arbitrary
// map[string]string PII payload with no server-side kind allowlist; an
// unrecognized kind (a future field, or a typo) must degrade safely
// rather than panic or error the whole tokenize call.
func NormalizeValueForKind(version, kind, value string) string {
	if rules, ok := normalizationRuleSets[version]; ok {
		if rule, ok := rules[kind]; ok {
			return rule(value)
		}
	}
	return lowerTrim(value)
}

// NormalizeValue is the original, pre-TOK-08 blanket normalization --
// kept unchanged (not kind-aware) so any existing caller/reference
// continues to compile and behave identically. Equivalent to
// NormalizeValueForKind("v1", anyKind, val) for every one of the 6 known
// kinds (proven directly in tok08_normalization_vectors_test.go).
func NormalizeValue(val string) string {
	return lowerTrim(val)
}

// GenerateDeterministicToken creates a stable token ID scoped to a specific
// tenant, token kind, and normalization version. Identical values across
// tenants, kinds, or versions produce different token IDs.
//
// Input to HMAC:
//
//	tenantID || "|" || tokenKind || "|" || version || "|" || normalizedValue
//
// version is an explicit parameter (not read from an internal constant)
// specifically so a real "v2" -- or any future version -- can actually
// exist: baking the version into the function itself would mean no
// caller could ever produce anything but a "v1" HMAC, defeating
// "versioned token semantics" entirely.
func GenerateDeterministicToken(secret []byte, tenantID, tokenKind, version, normalizedValue string) string {
	h := hmac.New(sha256.New, secret)
	h.Write([]byte(tenantID))
	h.Write([]byte("|"))
	h.Write([]byte(tokenKind))
	h.Write([]byte("|"))
	h.Write([]byte(version))
	h.Write([]byte("|"))
	h.Write([]byte(normalizedValue))
	return hex.EncodeToString(h.Sum(nil))
}
