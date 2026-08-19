package utils

import (
	"regexp"
	"strings"

	"zord-prompt-layer/dto"
)

var (
	uuidRe = regexp.MustCompile(`(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b`)

	keyValIDRe          = regexp.MustCompile(`(?i)\b(user_id|intent_id|trace_id|tenant_id|session_id|envelope_id|contract_id|action_id|record_id|chunk_id|batch_id|corridor_id|idempotency[_\s]?key|account(_id|_number)?)\b\s*[:=]\s*[^,\s]+`)
	jsonSensitivePairRe = regexp.MustCompile(`(?i)"(user_id|intent_id|trace_id|tenant_id|session_id|envelope_id|contract_id|action_id|record_id|chunk_id|batch_id|corridor_id|idempotency_key|account_id|account_number|iban|ifsc|swift|pan|vault_object_ref|payload_hash|salient_hash|request_fingerprint|provider_request_fingerprint|envelope_hash|envelope_signature|signature_value|archive_hash|encrypted_payload)"\s*:\s*"[^"]*"`)
	sensitiveValRe      = regexp.MustCompile(`(?i)\b(api[_\s-]?key|jwt[_\s-]?token|token|secret|password|idempotency[_\s]?key|account(_id|_number)?|iban|ifsc|swift|pan|vault_object_ref|payload_hash|salient_hash|request_fingerprint|provider_request_fingerprint|envelope_hash|envelope_signature|signature_value|archive_hash|encrypted_payload)\b\s*[:=]?\s*[^,\n]*`)
	sensitiveWordRe     = regexp.MustCompile(`(?i)\b(api[_\s-]?key|jwt[_\s-]?token|secret|password|token|hash|encrypted|signature|cipher|vault|tenant_id|user_id|session_id|intent_id|trace_id)\b`)
	multiSpaceRe        = regexp.MustCompile(`[^\S\n]{2,}`)
	blankLineBlockRe    = regexp.MustCompile(`\n{3,}`)
)

func SanitizeAnswerText(s string) string {
	out := strings.ReplaceAll(s, "\r\n", "\n")
	lines := strings.Split(out, "\n")
	inFence := false

	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "```") {
			inFence = !inFence
			lines[i] = strings.TrimRight(line, " \t")
			continue
		}

		sanitized := uuidRe.ReplaceAllString(line, "[redacted-id]")
		sanitized = keyValIDRe.ReplaceAllString(sanitized, "")
		sanitized = jsonSensitivePairRe.ReplaceAllString(sanitized, "")
		sanitized = sensitiveValRe.ReplaceAllString(sanitized, "")
		sanitized = sensitiveWordRe.ReplaceAllString(sanitized, "[redacted-sensitive]")
		sanitized = strings.ReplaceAll(sanitized, "\t", "  ")

		if inFence {
			lines[i] = strings.TrimRight(sanitized, " \t")
			continue
		}

		leading := sanitized[:len(sanitized)-len(strings.TrimLeft(sanitized, " "))]
		content := strings.TrimLeft(sanitized, " ")
		content = multiSpaceRe.ReplaceAllString(content, " ")
		lines[i] = leading + strings.TrimRight(content, " ")
	}

	out = strings.Join(lines, "\n")
	out = blankLineBlockRe.ReplaceAllString(out, "\n\n")
	return strings.TrimSpace(out)
}

func SanitizeCitations(in []dto.Citation) []dto.Citation {
	out := make([]dto.Citation, 0, len(in))
	for _, c := range in {
		c.RecordID = ""
		c.ChunkID = ""
		c.Snippet = SanitizeAnswerText(c.Snippet)
		out = append(out, c)
	}
	return out
}

func SanitizeActions(in []string) []string {
	out := make([]string, 0, len(in))
	for _, a := range in {
		x := SanitizeAnswerText(a)
		if strings.TrimSpace(x) != "" {
			out = append(out, x)
		}
	}
	return out
}

var actionSectionRe = regexp.MustCompile(`(?is)(^|\n)#+\s*(recommended actions?|next actions?|action items?|what to do next)\b.*$`)

func StripActionLikeSections(s string) string {
	out := actionSectionRe.ReplaceAllString(s, "")
	return strings.TrimSpace(out)
}
