package services

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
	"zord-prompt-layer/client"
	"zord-prompt-layer/utils"
)

type LLMService struct {
	gemini *client.GeminiClient
}

func NewLLMService(g *client.GeminiClient) *LLMService {
	return &LLMService{gemini: g}
}

func (s *LLMService) ExtractQueryScope(userQuery string) (utils.QueryScope, error) {
	nowUTC := time.Now().UTC().Format(time.RFC3339)

	tenantTZ := time.Local.String()

	prompt :=
		"You are Zord's time-scope extraction engine.\n" +
			"Return strict JSON only.\n" +
			"Do not include markdown.\n" +
			"Do not include extra keys.\n\n" +
			"Reference:\n" +
			fmt.Sprintf("- now_utc: %s\n", nowUTC) +
			fmt.Sprintf("- tenant_timezone: %s\n", tenantTZ) +
			"- Use tenant_timezone for interpreting today/yesterday/this week/this month/last month/current quarter/financial year.\n" +
			"- Convert final start_utc and end_utc to RFC3339 UTC.\n" +
			"- Use half-open windows: [start_utc, end_utc).\n\n" +
			"Extract:\n" +
			"{\"wants_visualization\": boolean, \"time_phrase\": string, \"start_utc\": string, \"end_utc\": string, \"scope_granularity\": \"none | day | week | month | quarter | year | custom\", \"needs_clarification\": boolean, \"clarification_reason\": string}\n\n" +
			"Rules:\n" +
			"1. wants_visualization=true only if user explicitly asks chart/graph/trend/visualization/month-wise/day-wise/week-wise/comparison over time/visual breakdown.\n" +
			"2. If user gives a clear time scope, fill start_utc and end_utc.\n" +
			"3. If user says today, use tenant local day start to next local day start.\n" +
			"4. If user says this month, use tenant local calendar month.\n" +
			"5. If user says last month, use previous tenant local calendar month.\n" +
			"6. If user says this week, use Monday 00:00 tenant local time to next Monday 00:00.\n" +
			"7. If user says last 7 days, use now minus 7 days to now.\n" +
			"8. If user says FY/financial year but fiscal calendar is missing, set needs_clarification=true.\n" +
			"9. If no explicit time scope, leave start_utc and end_utc empty and scope_granularity=none.\n" +
			"10. If time phrase is ambiguous, do not guess; set needs_clarification=true.\n\n" +
			"USER QUERY:\n" + userQuery

	raw, err := s.gemini.Generate(prompt)
	if err != nil {
		return utils.QueryScope{}, err
	}

	clean := strings.TrimSpace(raw)
	clean = strings.TrimPrefix(clean, "```json")
	clean = strings.TrimPrefix(clean, "```")
	clean = strings.TrimSuffix(clean, "```")
	clean = strings.TrimSpace(clean)

	var out struct {
		WantsVisualization bool   `json:"wants_visualization"`
		TimePhrase         string `json:"time_phrase"`
		StartUTC           string `json:"start_utc"`
		EndUTC             string `json:"end_utc"`
	}
	if err := json.Unmarshal([]byte(clean), &out); err != nil {
		return utils.QueryScope{}, nil
	}

	scope := utils.QueryScope{
		WantsVisualization: out.WantsVisualization,
		TimePhrase:         out.TimePhrase,
	}

	// Guardrail parse: only accept valid RFC3339 UTC window
	if strings.TrimSpace(out.StartUTC) != "" && strings.TrimSpace(out.EndUTC) != "" {
		start, err1 := time.Parse(time.RFC3339, strings.TrimSpace(out.StartUTC))
		end, err2 := time.Parse(time.RFC3339, strings.TrimSpace(out.EndUTC))
		if err1 == nil && err2 == nil && end.After(start) {
			scope.HasExplicitTime = true
			scope.StartUTC = start.UTC()
			scope.EndUTC = end.UTC()
		}
	}

	return scope, nil
}

func (s *LLMService) GenerateFromContextScoped(userQuery string, context string, wantsVisualization bool) (string, error) {
	visRule := "Do not include visualization section."
	if wantsVisualization {
		visRule = "Include a small visualization-ready section (text summary only)."
	}

	prompt :=
		"You are Zord Prompt Layer assistant.\n" +
			"Rules:\n" +
			"1) Use only CONTEXT. Do not infer facts that are not present in CONTEXT.\n" +
			"Copy numeric and money values exactly as shown in CONTEXT. Do not divide, multiply, round, add commas, remove decimals, add decimals, or change the numeric representation.\n" +
			"2) If CONTEXT is insufficient, clearly say: \"I don't have enough information in current data to answer that confidently.\"\n" +
			"3) Use plain, simple language that anyone can understand, even without technical or finance background.\n" +
			"4) Talk like a helpful teammate or friend, not like a system log.\n" +
			"5) Translate technical states into everyday language. Examples: pending/queued/received -> in process, success/completed/canonicalized -> done, failed/rejected/dlq -> did not go through.\n" +
			"6) Never say words like context, evidence, tenant-scoped, idempotency, envelope, trace, schema, outbox, projection, canonicalized, or dlq in the final answer.\n" +
			"7) If the records only show upload or intake progress, say that the payments were received or uploaded, but final payout progress is not visible yet.\n" +
			"8) Answer only what is asked. Keep it short, direct, and to the point.\n" +
			"9) The answer must be clean markdown, not plain prose.\n" +
			"10) Preferred structure:\n" +
			"   - Start with a bold one-line takeaway.\n" +
			"   - Follow with 2 to 5 short bullet points.\n" +
			"   - Add a tiny markdown table only when comparing values helps.\n" +
			"11) Avoid long, monotonous paragraphs. Prefer short sections and crisp lines.\n" +
			"12) Keep paragraphs to at most 2 sentences.\n" +
			"13) Do not use jargon like SQL or infrastructure internals.\n" +
			"14) Do not mention table names, schema names, SQL, pipelines, or infrastructure internals.\n" +
			"15) Never reveal identifiers or sensitive fields (tenant_id, intent_id, trace_id, envelope_id, outbox_id, idempotency_key, account_number, iban, ifsc, swift, pan, api keys, tokens, secrets).\n" +
			"16) Do NOT include recommendations, action items, or mitigation steps in answer text.\n" +

			"17) " + visRule + "\n\n" +
			"CONTEXT:\n" + context + "\n\n" +
			"USER QUERY:\n" + userQuery + "\n\n" +
			"Return a concise, well-structured markdown answer."

	return s.gemini.Generate(prompt)
}

type AnswerWithConfidence struct {
	Answer            string  `json:"answer"`
	Confidence        string  `json:"confidence"`         // high|medium|low
	ConfidenceScore   float64 `json:"confidence_score"`   // 0.0 - 1.0 (LLM raw)
	EvidenceCoverage  float64 `json:"evidence_coverage"`  // 0.0 - 1.0
	ScopeAdherence    float64 `json:"scope_adherence"`    // 0.0 - 1.0
	ContradictionRisk float64 `json:"contradiction_risk"` // 0.0 - 1.0
	Ambiguity         float64 `json:"ambiguity"`          // 0.0 - 1.0
}

type QueryClassDecision struct {
	Class              string  `json:"class"` // operational_data_query | product_explanation | navigation_or_how_to | evidence_or_dispute_query | out_of_scope
	Confidence         float64 `json:"confidence"`
	NeedsData          bool    `json:"needs_data"`
	NeedsVisualization bool    `json:"needs_visualization"`
	Reason             string  `json:"reason"`
}
type ScopeExtractionDecision struct {
	WantsVisualization  bool   `json:"wants_visualization"`
	TimePhrase          string `json:"time_phrase"`
	StartUTC            string `json:"start_utc"`
	EndUTC              string `json:"end_utc"`
	ScopeGranularity    string `json:"scope_granularity"`
	NeedsClarification  bool   `json:"needs_clarification"`
	ClarificationReason string `json:"clarification_reason"`
}

type OperationalPromptResult struct {
	Answer            string   `json:"answer"`
	Status            string   `json:"status"`
	Confidence        string   `json:"confidence"`
	ConfidenceScore   float64  `json:"confidence_score"`
	EvidenceCoverage  float64  `json:"evidence_coverage"`
	ScopeAdherence    float64  `json:"scope_adherence"`
	ContradictionRisk float64  `json:"contradiction_risk"`
	Ambiguity         float64  `json:"ambiguity"`
	MissingData       []string `json:"missing_data"`
	NextSteps         []string `json:"next_steps"`
	SafeDisplayRefs   []string `json:"safe_display_refs"`
	Visualization     struct {
		Needed bool   `json:"needed"`
		Type   string `json:"type"`
		Title  string `json:"title"`
		XAxis  string `json:"x_axis"`
		YAxis  string `json:"y_axis"`
		Series []struct {
			Label string  `json:"label"`
			Value float64 `json:"value"`
		} `json:"series"`
	} `json:"visualization"`
}

type EvidencePromptResult struct {
	Answer              string   `json:"answer"`
	ProofStatus         string   `json:"proof_status"`
	Confidence          string   `json:"confidence"`
	ConfidenceScore     float64  `json:"confidence_score"`
	AvailableProofItems []string `json:"available_proof_items"`
	MissingProofItems   []string `json:"missing_proof_items"`
	ExportOptions       []string `json:"export_options"`
	NextSteps           []string `json:"next_steps"`
	SafeDisplayRefs     []string `json:"safe_display_refs"`
}

func (s *LLMService) GenerateFromContextScopedWithConfidence(userQuery string, context string, wantsVisualization bool) (AnswerWithConfidence, error) {
	visRule := "Do not include visualization section."
	if wantsVisualization {
		visRule = "Include a small visualization-ready section (text summary only)."
	}

	prompt :=
		"You are Zord Prompt Layer assistant.\n" +
			"Rules:\n" +
			"1) Use only CONTEXT. Do not infer facts that are not present in CONTEXT.\n" +
			"2) If CONTEXT is insufficient, clearly say what is missing in plain language.\n" +
			"3) Use plain, simple language suitable for any user, even without a finance or technical background.\n" +
			"4) Talk like a helpful teammate or friend, not like a system log.\n" +
			"5) Translate technical states into everyday language. Examples: pending/queued/received -> in process, success/completed/canonicalized -> done, failed/rejected/dlq -> did not go through.\n" +
			"6) Never say words like context, evidence, tenant-scoped, idempotency, envelope, trace, schema, outbox, projection, canonicalized, or dlq in the answer field.\n" +
			"7) If the records only show upload or intake progress, say that the payments were received or uploaded, but final payout progress is not visible yet.\n" +
			"8) Answer only what is asked. Keep it short, direct, and to the point.\n" +
			"9) The answer field must contain clean markdown, not plain prose.\n" +
			"10) Preferred structure inside answer:\n" +
			"   - Start with a bold one-line takeaway.\n" +
			"   - Follow with 2 to 5 short bullet points.\n" +
			"   - Add a tiny markdown table only when comparing values helps.\n" +
			"11) Avoid long, monotonous paragraphs. Use short sections and crisp lines.\n" +
			"12) Keep paragraphs to at most 2 sentences.\n" +
			"13) Do not use jargon like SQL or infrastructure internals.\n" +
			"14) Do not mention table names, schema names, SQL, pipelines, or infrastructure internals.\n" +
			"15) Never reveal identifiers or sensitive fields (tenant_id, intent_id, trace_id, envelope_id, outbox_id, idempotency_key, account_number, iban, ifsc, swift, pan, hashes, signatures, encrypted fields, api keys, tokens, secrets).\n" +
			"16) Do NOT include recommendations, action items, or mitigation steps in answer text.\n" +
			"17) " + visRule + "\n" +
			"18) Return strict JSON only with keys: answer, confidence, confidence_score, evidence_coverage, scope_adherence, contradiction_risk, ambiguity.\n" +
			"19) The answer field should contain markdown-formatted text only.\n" +
			"20) confidence must be one of high|medium|low.\n" +
			"21) All numeric scores must be between 0 and 1.\n" +
			"22) confidence_score must reflect reliability based only on provided context.\n\n" +
			"CONTEXT:\n" + context + "\n\n" +
			"USER QUERY:\n" + userQuery + "\n\n" +
			"Return strict JSON with the answer field in markdown format."

	raw, err := s.gemini.Generate(prompt)
	if err != nil {
		return AnswerWithConfidence{}, err
	}

	clean := strings.TrimSpace(raw)
	clean = strings.TrimPrefix(clean, "```json")
	clean = strings.TrimPrefix(clean, "```")
	clean = strings.TrimSuffix(clean, "```")
	clean = strings.TrimSpace(clean)

	var out AnswerWithConfidence
	if err := json.Unmarshal([]byte(clean), &out); err != nil {
		return AnswerWithConfidence{}, err
	}
	out.ConfidenceScore = clamp01(out.ConfidenceScore)
	out.EvidenceCoverage = clamp01(out.EvidenceCoverage)
	out.ScopeAdherence = clamp01(out.ScopeAdherence)
	out.ContradictionRisk = clamp01(out.ContradictionRisk)
	out.Ambiguity = clamp01(out.Ambiguity)

	if out.Confidence != "high" && out.Confidence != "medium" && out.Confidence != "low" {
		out.Confidence = "medium"
	}

	return out, nil
}
func (s *LLMService) ClassifyQueryIntent(userQuery string) (QueryClassDecision, error) {
	prompt := "You are the strict intent classifier for the Zord payment-operations assistant.\n" +
		"Return strict JSON only.\n" +
		"Do not include markdown.\n" +
		"Do not include extra keys.\n\n" +
		"Allowed classes:\n" +
		"1. operational_data_query\n" +
		"2. product_explanation\n" +
		"3. navigation_or_how_to\n" +
		"4. evidence_or_dispute_query\n" +
		"5. out_of_scope\n\n" +
		"Rules:\n" +
		"- needs_visualization=true only if user explicitly asks chart/graph/trend/visualization/comparison over time/visual breakdown.\n" +
		"- needs_data=true for operational_data_query and evidence_or_dispute_query.\n" +
		"- needs_data=false for product_explanation and navigation_or_how_to unless user asks about current data.\n" +
		"- confidence must be between 0 and 1.\n\n" +
		"Return JSON schema:\n" +
		"{\"class\":\"operational_data_query | product_explanation | navigation_or_how_to | evidence_or_dispute_query | out_of_scope\",\"confidence\":0.0,\"needs_data\":true,\"needs_visualization\":false,\"reason\":\"short plain reason\"}\n\n" +
		"USER QUERY:\n" + userQuery

	raw, err := s.gemini.Generate(prompt)
	if err != nil {
		return QueryClassDecision{}, err
	}

	clean := strings.TrimSpace(raw)
	clean = strings.TrimPrefix(clean, "```json")
	clean = strings.TrimPrefix(clean, "```")
	clean = strings.TrimSuffix(clean, "```")
	clean = strings.TrimSpace(clean)

	var out QueryClassDecision
	if err := json.Unmarshal([]byte(clean), &out); err != nil {
		return QueryClassDecision{}, err
	}

	out.Confidence = clamp01(out.Confidence)
	switch out.Class {
	case "operational_data_query", "product_explanation", "navigation_or_how_to", "evidence_or_dispute_query", "out_of_scope":
	default:
		out.Class = "product_explanation"
	}
	return out, nil
}
func (s *LLMService) GenerateOperationalJSON(userQuery, context, visRule string) (OperationalPromptResult, error) {
	prompt :=
		"You are Zord's payment-operations assistant.\n\n" +
			"Your job:\n" +
			"Explain Zord payment data in plain business language for finance, operations, compliance, and leadership users.\n\n" +
			"You are not a generic chatbot.\n" +
			"You are not a technical debugger.\n" +
			"You are not allowed to invent facts.\n\n" +
			"Use only CONTEXT.\n" +
			"If CONTEXT does not contain enough data, say what is missing in simple business language.\n\n" +
			"Never reveal internal identifiers or sensitive fields:\n" +
			"tenant_id, internal intent_id, trace_id, envelope_id, outbox_id, idempotency_key, raw account numbers, IBAN, IFSC, SWIFT, PAN, API keys, tokens, secrets, hashes, signatures, encrypted fields.\n\n" +
			"Do not mention:\n" +
			"database tables, SQL, schema names, service names, queues, Kafka, pipelines, internal APIs, raw endpoint names, backend metric names, or infrastructure internals.\n\n" +
			"Language rules:\n" +
			"- Use simple business English.\n" +
			"- Avoid technical words unless necessary.\n" +
			"- Do not use backend metric names.\n" +
			"- Copy numeric and money values exactly as shown in CONTEXT. Do not divide, multiply, round, add commas, remove decimals, add decimals, or change the numeric representation.\n" +
			"- If CONTEXT says INR 13146, answer INR 13146 exactly. Do not write INR 131.46 or INR 13,146.\n" +
			"- Do not say \"leakage\" unless context clearly says money is actually lost. Prefer \"payment gap\", \"value needing review\", or \"unclear value\".\n" +
			"- Do not say \"confirmed\" unless bank/settlement/outcome data is available.\n" +
			"- Do not say \"proof-ready\" unless evidence data is available.\n" +
			"- Do not say \"clean\" if required source data is missing.\n\n" +
			"Business meaning rules:\n" +
			"- If intent data is missing but settlement data exists, say settlement data is available but original payment instruction data is missing.\n" +
			"- If intent data exists but settlement data is missing, say payment instructions are available but bank/settlement confirmation is missing.\n" +
			"- If both are available, explain matched value, unmatched value, review value, and confidence if present.\n" +
			"- If data_available=false for any section, explain missing data in plain language.\n" +
			"- If denominator is zero/unavailable, do not present 0% as real performance; say not available yet.\n\n" +
			"Count and aggregate rules:\n" +
			"- For count questions, use only aggregate summary values from CONTEXT.\n" +
			"- Never estimate totals by counting sample records or citations.\n" +
			"- Clearly distinguish payment instructions received, payment instructions processed, failed payment instructions, DLQ entries, and unique payment instructions affected by DLQ.\n" +
			"- If CONTEXT includes a status breakdown, explain the most important status groups in business language.\n" +
			"- If aggregate summary is missing for a count question, say the total cannot be calculated from current data.\n\n" +
			"Policy rules:\n" +
			"- Follow the policy facts provided in CONTEXT. Do not invent policy outcomes.\n" +
			"- If a policy summary is present, treat it as more reliable than sample records.\n\n" +

			"Payment count policy:\n" +
			"- For count questions, use only aggregate summary values from CONTEXT.\n" +
			"- Never estimate totals by counting sample records or citations.\n" +
			"- Clearly distinguish payment instructions received, payment instructions processed, pending payment instructions, and failed payment instructions.\n" +
			"- If CONTEXT includes a status breakdown, explain the key status groups in business language.\n" +
			"- If aggregate summary is missing for a count question, say the total cannot be calculated from current data.\n\n" +

			"Settlement ETA policy:\n" +
			"- If CONTEXT includes Settlement ETA policy, use it to answer settlement arrival questions.\n" +
			"- T+1_day means settlement is normally expected one day after the latest relevant payment instruction timestamp.\n" +
			"- Use words like expected or estimated unless settlement evidence is already available.\n" +
			"- Do not claim an exact or guaranteed settlement arrival time unless settlement confirmation exists in CONTEXT.\n\n" +

			"DLQ failure policy:\n" +
			"- Clearly distinguish DLQ entries from unique payment instructions affected by DLQ.\n" +
			"- Do not call every DLQ entry a failed payment instruction unless CONTEXT says the affected payment instruction failed.\n" +
			"- If reason or stage breakdown is present, explain the main failure concentration in business language.\n" +
			"- If DLQ aggregate data is missing, do not estimate failure totals from sample records.\n\n" +

			"Duplicate check policy:\n" +
			"- Use duplicate-control or idempotency evidence from CONTEXT when answering duplicate processing questions.\n" +
			"- Explain duplicate risk as no indication, possible duplicate-control conflict, or needs review based only on CONTEXT.\n" +
			"- Do not expose idempotency keys, hashes, request fingerprints, or internal IDs.\n\n" +

			"Upload progress policy:\n" +
			"- For upload or batch progress questions, compare received/upload evidence with payment instruction counts when available.\n" +
			"- If only upload intake data is available, say the file was received but final payment progress is not visible yet.\n" +
			"- Do not say all payments are processed unless payment instruction or downstream status data supports it.\n\n" +

			"Follow-up resolution policy:\n" +
			"- If CONTEXT includes RESOLVED_QUERY_CONTEXT, answer the resolved business query while keeping the response natural for the original user query.\n" +
			"- Use previous conversation context only to resolve references like those, that, them, these, or same ones.\n" +
			"- Do not guess what a follow-up refers to if the resolved context is missing or unclear.\n\n" +
			"Action rules:\n" +
			"- Include next steps only when user asks what to do, or context includes available_actions, or context clearly shows missing data/review items.\n" +
			"- Do not invent actions.\n\n" +
			"Answer style:\n" +
			"- Start with direct answer.\n" +
			"- Then operational meaning.\n" +
			"- Then missing data/limitations if any.\n" +
			"- Then next steps only if allowed.\n\n" +
			"Return strict JSON only.\n" +
			"Do not include markdown.\n" +
			"Do not include extra keys.\n\n" +
			"Output schema:\n" +
			"{\"answer\":\"\",\"status\":\"clear | partial | needs_review | insufficient_data\",\"confidence\":\"high | medium | low\",\"confidence_score\":0.0,\"evidence_coverage\":0.0,\"scope_adherence\":0.0,\"contradiction_risk\":0.0,\"ambiguity\":0.0,\"key_numbers\":[],\"missing_data\":[],\"next_steps\":[],\"safe_display_refs\":[],\"visualization\":{\"needed\":false,\"type\":\"none | line | bar | stacked_bar | table | timeline\",\"title\":\"\",\"x_axis\":\"\",\"y_axis\":\"\",\"series\":[]}}\n\n" +
			"VISUALIZATION RULE:\n" + visRule + "\n\n" +
			"CONTEXT:\n" + context + "\n\n" +
			"USER QUERY:\n" + userQuery

	raw, err := s.gemini.Generate(prompt)
	if err != nil {
		return OperationalPromptResult{}, err
	}

	clean := strings.TrimSpace(raw)
	clean = strings.TrimPrefix(clean, "```json")
	clean = strings.TrimPrefix(clean, "```")
	clean = strings.TrimSuffix(clean, "```")
	clean = strings.TrimSpace(clean)

	var out OperationalPromptResult
	if err := json.Unmarshal([]byte(clean), &out); err != nil {
		return OperationalPromptResult{}, err
	}
	out.ConfidenceScore = clamp01(out.ConfidenceScore)
	out.EvidenceCoverage = clamp01(out.EvidenceCoverage)
	out.ScopeAdherence = clamp01(out.ScopeAdherence)
	out.ContradictionRisk = clamp01(out.ContradictionRisk)
	out.Ambiguity = clamp01(out.Ambiguity)

	if out.Confidence != "high" && out.Confidence != "medium" && out.Confidence != "low" {
		out.Confidence = "medium"
	}
	return out, nil
}

func (s *LLMService) GenerateEvidenceJSON(userQuery, context string) (EvidencePromptResult, error) {
	prompt :=
		"You are Zord's evidence and dispute-resolution assistant.\n" +
			"Use only CONTEXT.\n" +
			"Do not reveal raw hashes, signatures, encrypted values, internal IDs, account numbers, PAN, tokens, API keys, or secrets.\n" +
			"Copy numeric and money values exactly as shown in CONTEXT. Do not divide, multiply, round, add commas, remove decimals, add decimals, or change the numeric representation.\n" +
			"You may say proof root available/verified if context says so, but do not print raw proof root unless marked safe.\n\n" +
			"Explain:\n" +
			"- whether evidence pack exists,\n" +
			"- what proof items are available,\n" +
			"- what proof items are missing,\n" +
			"- whether proof is ready or partial,\n" +
			"- whether export is available.\n\n" +
			"Return strict JSON only.\n" +
			"Do not include markdown.\n" +
			"Do not include extra keys.\n\n" +
			"Output schema:\n" +
			"{\"answer\":\"\",\"proof_status\":\"proof_ready | partial_proof | missing_intent | missing_settlement | missing_match_decision | missing_governance | needs_review | insufficient_data\",\"confidence\":\"high | medium | low\",\"confidence_score\":0.0,\"available_proof_items\":[],\"missing_proof_items\":[],\"export_options\":[],\"next_steps\":[],\"safe_display_refs\":[]}\n\n" +
			"CONTEXT:\n" + context + "\n\n" +
			"USER QUERY:\n" + userQuery

	raw, err := s.gemini.Generate(prompt)
	if err != nil {
		return EvidencePromptResult{}, err
	}

	clean := strings.TrimSpace(raw)
	clean = strings.TrimPrefix(clean, "```json")
	clean = strings.TrimPrefix(clean, "```")
	clean = strings.TrimSuffix(clean, "```")
	clean = strings.TrimSpace(clean)

	var out EvidencePromptResult
	if err := json.Unmarshal([]byte(clean), &out); err != nil {
		return EvidencePromptResult{}, err
	}
	out.ConfidenceScore = clamp01(out.ConfidenceScore)
	if out.Confidence != "high" && out.Confidence != "medium" && out.Confidence != "low" {
		out.Confidence = "medium"
	}
	return out, nil
}

func (s *LLMService) GenerateProductExplanation(userQuery string) (string, error) {
	prompt :=
		"You are Zord's product explainer.\n" +
			"Explain Zord in simple business language.\n" +
			"Do not reveal internal architecture.\n" +
			"Do not mention backend services, schemas, pipelines, cryptographic implementation details, or proprietary logic.\n\n" +
			"Core explanation:\n" +
			"Zord is a non-custodial payment proof and governance layer. It does not replace banks, PSPs, payment gateways, UPI, NEFT, RTGS, IMPS, Tally, SAP, or ERP systems. It works around existing payment systems to create a clearer source of truth from payment instruction to settlement outcome.\n\n" +
			"Return plain answer, not JSON.\n\n" +
			"USER QUERY:\n" + userQuery

	return s.gemini.Generate(prompt)
}

func (s *LLMService) GenerateNavigationHowTo(userQuery, context string) (string, error) {
	prompt :=
		"You are Zord's in-product guide.\n" +
			"Use only CONTEXT.\n" +
			"Explain where the user should go and what they should click.\n" +
			"Copy numeric and money values exactly as shown in CONTEXT. Do not divide, multiply, round, add commas, remove decimals, add decimals, or change the numeric representation.\n" +
			"Do not mention backend systems or internal IDs.\n" +
			"Do not invent unavailable screens.\n\n" +
			"Answer format:\n" +
			"1. Direct instruction\n" +
			"2. What user will see\n" +
			"3. Expected result\n\n" +
			"If required page/action is not present in CONTEXT, say exactly:\n" +
			"\"I don't see that action available in the current workspace.\"\n\n" +
			"CONTEXT:\n" + context + "\n\n" +
			"USER QUERY:\n" + userQuery + "\n\n" +
			"Return a short, clear answer."

	return s.gemini.Generate(prompt)
}
func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}
