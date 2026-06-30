package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"regexp"
	"sort"
	"strings"
	"time"
	"zord-prompt-layer/client"
	"zord-prompt-layer/dto"
	"zord-prompt-layer/model"
	"zord-prompt-layer/utils"
)

type RAGService interface {
	Query(req dto.QueryRequest) (dto.QueryResponse, error)
}

var uuidLeakRe = regexp.MustCompile(`(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b`)

var sensitiveExtractionRe = regexp.MustCompile(`(?i)\b(api[_\s-]?key|password|secret|access[_\s-]?token|private[_\s-]?key)\b`)
var corridorIDRe = regexp.MustCompile(`(?i)\bcorridor[_\s-]?id\s*[:=]?\s*([A-Za-z0-9._-]+)\b`)
var rowCountEstimateRe = regexp.MustCompile(`(?i)\brow_count_estimate=(\d+)\b`)
var outboxStatusRe = regexp.MustCompile(`(?i)\bstatus=([A-Z_]+)\b`)

type DefaultRAGService struct {
	model        string
	retriever    EvidenceRetriever
	llm          *LLMService
	defaultK     int
	intelligence *client.IntelligenceClient
	memory       ChatMemoryStore
}
type vizKind string

const (
	vizCorridorHealth vizKind = "corridor_health"
	vizTopFailures    vizKind = "top_failures"
	vizSLABreach      vizKind = "sla_breach"
	vizApprovalMix    vizKind = "approval_mix"
)

type queryClass string

const (
	classOperational queryClass = "operational_data_query"
	classProduct     queryClass = "product_explanation"
	classNavigation  queryClass = "navigation_or_how_to"
	classEvidence    queryClass = "evidence_or_dispute_query"
	classOutOfScope  queryClass = "out_of_scope"
	classUnknown     queryClass = "unknown"
)

func detectVizKind(q string) vizKind {
	s := strings.ToLower(q)
	switch {
	case strings.Contains(s, "failure") || strings.Contains(s, "error"):
		return vizTopFailures
	case strings.Contains(s, "sla") || strings.Contains(s, "breach"):
		return vizSLABreach
	case strings.Contains(s, "approval") || strings.Contains(s, "severity") || strings.Contains(s, "pending action"):
		return vizApprovalMix
	default:
		return vizCorridorHealth
	}
}
func NewDefaultRAGService(model string, defaultK int, retriever EvidenceRetriever, llm *LLMService, intelligence *client.IntelligenceClient, memory ChatMemoryStore) *DefaultRAGService {
	return &DefaultRAGService{
		model:        model,
		defaultK:     defaultK,
		retriever:    retriever,
		llm:          llm,
		intelligence: intelligence,
		memory:       memory,
	}
}

func isGreetingOnly(s string) bool {
	switch strings.TrimSpace(s) {
	case "hi", "hello", "hey", "good morning", "good afternoon", "good evening":
		return true
	default:
		return false
	}
}

func isProductExplanationQuery(s string) bool {
	productPhrases := []string{
		"what is zord",
		"how does zord work",
		"how zord works",
		"what does zord do",
		"explain zord",
		"what is payment intent",
		"what are payment intents",
		"what is proof readiness",
		"what is match confidence",
		"what does unmatched mean",
	}
	return containsAnyPhrase(s, productPhrases)
}

func isNavigationQuery(s string) bool {
	actionSignals := []string{"where", "how do i", "how to", "show me where", "open", "click", "upload", "export", "download", "review"}
	zordSurfaceSignals := []string{"dashboard", "workspace", "batch", "file", "proof", "evidence", "report", "page", "screen"}

	return containsAnyPhrase(s, actionSignals) && containsAnyPhrase(s, zordSurfaceSignals)
}

func isEvidenceQuery(s string) bool {
	strongEvidenceSignals := []string{
		"proof pack",
		"evidence pack",
		"audit export",
		"export proof",
		"dispute",
		"dispute resolution",
		"defend",
		"defended",
		"verification",
		"verify evidence",
		"missing evidence",
		"missing proof",
		"proof items",
		"evidence items",
	}

	return containsAnyPhrase(s, strongEvidenceSignals)
}

func isClearlyOperationalQuery(s string) bool {
	questionSignals := []string{
		"how many",
		"count",
		"total",
		"status",
		"pending",
		"failed",
		"failure",
		"delayed",
		"delay",
		"stuck",
		"received",
		"processed",
		"uploaded",
		"arrive",
		"arrival",
		"when will",
		"unmatched",
		"matched",
		"settled",
		"settlement",
		"short settled",
		"review",
		"risk",
		"duplicate",
		"double",
		"twice",
		"gap",
		"value",
		"amount",
		"trend",
		"graph",
		"chart",
		"visual",
	}
	businessSignals := []string{
		"payment",
		"payments",
		"payout",
		"payouts",
		"instruction",
		"instructions",
		"intent",
		"intents",
		"batch",
		"batches",
		"csv",
		"file",
		"settlement",
		"bank",
		"psp",
		"confirmation",
		"callback",
		"proof",
		"evidence",
		"reconciliation",
	}

	return containsAnyPhrase(s, questionSignals) && containsAnyPhrase(s, businessSignals)
}

func isClearlyOutOfScopeQuery(s string) bool {
	outOfScopeSignals := []string{
		"movie",
		"song",
		"weather",
		"cricket",
		"football",
		"joke",
		"recipe",
		"travel",
	}

	return containsAnyPhrase(s, outOfScopeSignals) &&
		!containsAnyPhrase(s, []string{"payment", "payout", "zord", "batch", "settlement", "proof", "evidence"})
}

func containsAnyPhrase(s string, phrases []string) bool {
	for _, p := range phrases {
		if strings.Contains(s, p) {
			return true
		}
	}
	return false
}

func hasTimeScopeSignal(q string) bool {
	s := strings.ToLower(strings.TrimSpace(q))
	timeSignals := []string{
		"today",
		"yesterday",
		"tomorrow",
		"this week",
		"last week",
		"this month",
		"last month",
		"this quarter",
		"last quarter",
		"this year",
		"last year",
		"last 7 days",
		"last seven days",
		"last 24 hours",
		"last hour",
		"recent",
		"recently",
		"current",
		"currently",
		"till now",
		"until now",
		"so far",
		"between",
		"from ",
		"since ",
		"financial year",
		"fy",
		"month-wise",
		"day-wise",
		"week-wise",
	}

	if containsAnyPhrase(s, timeSignals) {
		return true
	}

	dateLike := regexp.MustCompile(`(?i)\b(\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{2,4}|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*)\b`)
	return dateLike.MatchString(s)
}

func mapLLMClass(c string) queryClass {
	switch c {
	case "operational_data_query":
		return classOperational
	case "product_explanation":
		return classProduct
	case "navigation_or_how_to":
		return classNavigation
	case "evidence_or_dispute_query":
		return classEvidence
	case "out_of_scope":
		return classOutOfScope
	default:
		return classProduct
	}
}

func buildGeneralResponse() dto.QueryResponse {
	return dto.QueryResponse{
		Answer:        "**What I can help with**\n- Payout operations, intent flow, delays, failures, and retries.\n- Proof readiness, confirmation gaps, and tenant-scoped trends.\n- Ask a specific business question and I will keep the answer short and clear.",
		Confidence:    "high",
		EntitiesFound: dto.EntitiesFound{},
		Citations:     []dto.Citation{},
		NextActions:   []string{},
	}
}

func buildOutOfScopeResponse() dto.QueryResponse {
	return dto.QueryResponse{
		Answer:        "**That question is outside this workspace scope**\n- I can help with payout operations, intent behavior, callbacks, failures, and readiness insights.\n- Try asking about delays, pending items, confirmations, retries, or manual review.",
		Confidence:    "high",
		EntitiesFound: dto.EntitiesFound{},
		Citations:     []dto.Citation{},
		NextActions:   []string{},
	}
}

func shouldReturnCitations(class queryClass, chunks []model.RetrievedChunk, confidence string) bool {
	if class != classOperational {
		return false
	}
	if len(chunks) == 0 {
		return false
	}
	return confidence == "high" || confidence == "medium"
}

func buildRCAContextBlock(rca *client.RCAClustersResponse) string {
	if rca == nil {
		return "RCA: unavailable"
	}
	modelVersion := "-"
	if rca.ModelVersion != nil && strings.TrimSpace(*rca.ModelVersion) != "" {
		modelVersion = strings.TrimSpace(*rca.ModelVersion)
	}
	return fmt.Sprintf(
		"RCA tenant summary: data_available=%t model_version=%s cluster_count=%d clustered_points=%d noise_points=%d total_points=%d returned_clusters=%d reason=%s",
		rca.DataAvailable, modelVersion, rca.ClusterCount, rca.ClusteredPoints, rca.NoisePoints, rca.TotalPoints, rca.ReturnedClusters, strings.TrimSpace(rca.Reason),
	)
}

func (s *DefaultRAGService) Query(req dto.QueryRequest) (dto.QueryResponse, error) {
	ctx := context.Background()
	topK := req.TopK
	if topK <= 0 {
		topK = s.defaultK
	}
	if strings.TrimSpace(req.TenantID) == "" {
		return dto.QueryResponse{}, fmt.Errorf("missing tenant context")
	}

	if sensitiveExtractionRe.MatchString(req.Query) {
		return dto.QueryResponse{
			Answer:        "I cannot provide secrets or credential material. I can still help with safe operational status and trends.",
			Confidence:    "low",
			EntitiesFound: dto.EntitiesFound{},
			Citations:     []dto.Citation{},
			NextActions:   []string{},
		}, nil
	}
	resolvedQuery := req.Query
	historyContext := ""
	memorySummary := ""
	memoryContext := ""
	var history []ChatTurn

	if s.memory != nil {
		var memErr error
		memorySummary, memErr = s.memory.GetSummary(ctx, req.TenantID, req.UserID, req.SessionID)
		if memErr != nil {
			log.Printf("[prompt-layer][memory] summary read failed tenant=%s user=%s session=%s err=%v", req.TenantID, req.UserID, req.SessionID, memErr)
		}

		history, memErr = s.memory.GetRecent(ctx, req.TenantID, req.UserID, req.SessionID)
		if memErr != nil {
			log.Printf("[prompt-layer][memory] turns read failed tenant=%s user=%s session=%s err=%v", req.TenantID, req.UserID, req.SessionID, memErr)
		} else if len(history) > 0 {
			var hb strings.Builder
			for i, t := range history {
				hb.WriteString(fmt.Sprintf("[%d] at=%s user=%s assistant=%s\n",
					i+1,
					t.Timestamp.UTC().Format(time.RFC3339),
					utils.SanitizeAnswerText(t.UserMessage),
					utils.SanitizeAnswerText(t.AssistantSummary),
				))
			}
			historyContext = hb.String()
		}

		memoryContext = buildMemoryContext(memorySummary, historyContext)
		resolvedQuery = resolveFollowupQuery(req.Query, history, memorySummary)

		if !strings.EqualFold(strings.TrimSpace(resolvedQuery), strings.TrimSpace(req.Query)) {
			log.Printf("[prompt-layer][memory] followup resolved tenant=%s user=%s session=%s", req.TenantID, req.UserID, req.SessionID)
		}
	}
	log.Printf("[prompt-layer][llm] call=classifier tenant=%s", req.TenantID)

	dec, err := s.llm.ClassifyQueryIntent(resolvedQuery, memoryContext)
	if err != nil {
		log.Printf("[prompt-layer][classify] llm-classifier failed tenant=%s err=%v; defaulting general", req.TenantID, err)
		return buildGeneralResponse(), nil
	}

	class := mapLLMClass(dec.Class)
	if dec.Confidence < 0.50 {
		log.Printf("[prompt-layer][classify] low confidence tenant=%s class=%s confidence=%.2f; defaulting general", req.TenantID, dec.Class, dec.Confidence)
		class = classProduct
	}

	if class == classOutOfScope && shouldOverrideOutOfScopeForFollowup(req.Query, resolvedQuery, memorySummary, historyContext, history) {
		log.Printf("[prompt-layer][router] followup override from=out_of_scope to=operational_data_query tenant=%s user=%s session=%s confidence=%.2f", req.TenantID, req.UserID, req.SessionID, dec.Confidence)
		class = classOperational
		dec.NeedsData = true
	}

	log.Printf("[prompt-layer][router] route=%s source=llm confidence=%.2f tenant=%s", class, dec.Confidence, req.TenantID)
	log.Printf("[prompt-layer][classify] class=%s tenant=%s", class, req.TenantID)

	if class == classProduct {

		log.Printf("[prompt-layer][llm] call=product_explanation tenant=%s", req.TenantID)

		txt, err := s.llm.GenerateProductExplanation(req.Query)
		if err != nil {
			return dto.QueryResponse{}, fmt.Errorf("generation failed: %w", err)
		}
		answer := utils.SanitizeAnswerText(txt)
		if strings.TrimSpace(answer) == "" || uuidLeakRe.MatchString(answer) {
			answer = buildGeneralResponse().Answer
		}
		s.persistConversationMemory(ctx, req, memorySummary, answer)
		return dto.QueryResponse{
			Answer:        answer,
			Confidence:    "high",
			EntitiesFound: dto.EntitiesFound{},
			Citations:     []dto.Citation{},
			NextActions:   []string{},
		}, nil
	}
	if class == classOutOfScope {
		resp := buildOutOfScopeResponse()
		s.persistConversationMemory(ctx, req, memorySummary, resp.Answer)
		return resp, nil
	}
	intentID := req.IntentID
	traceID := req.TraceID
	if intentID == "" {
		intentID = utils.ExtractIntentID(req.Query)
	}
	if traceID == "" {
		traceID = utils.ExtractTraceID(req.Query)
	}
	rawScope := utils.QueryScope{}

	if hasTimeScopeSignal(req.Query) {
		log.Printf("[prompt-layer][llm] call=scope_extraction tenant=%s", req.TenantID)

		extractedScope, scopeErr := s.llm.ExtractQueryScope(req.Query)
		if scopeErr != nil {
			log.Printf("[prompt-layer][scope] llm-scope failed tenant=%s err=%v; using empty tenant-wide scope", req.TenantID, scopeErr)
			rawScope = utils.QueryScope{}
		} else {
			rawScope = extractedScope
		}

		if !rawScope.HasExplicitTime && strings.TrimSpace(rawScope.TimePhrase) == "" {
			rawScope.TimePhrase = utils.ExtractTimePhraseHeuristic(req.Query)
		}

		log.Printf("[prompt-layer][scope] source=llm time_phrase=%s explicit=%t tenant=%s", rawScope.TimePhrase, rawScope.HasExplicitTime, req.TenantID)
	} else {
		log.Printf("[prompt-layer][scope] source=local_no_time tenant=%s", req.TenantID)
	}

	scope := utils.NormalizeScope(rawScope, time.Now(), time.Local)

	retrievalReq := req
	retrievalReq.Query = buildSelectedUIContextQuery(req, resolvedQuery)

	if req.UIContext != nil {
		log.Printf(
			"[prompt-layer][ui-context] scope=%s level=%s source=%s tenant=%s",
			req.UIContext.Scope,
			req.UIContext.ScopeLevel,
			req.UIContext.SourcePage,
			req.TenantID,
		)
	}

	chunks, err := s.retriever.Retrieve(retrievalReq, intentID, traceID, topK, scope)
	if err != nil {
		return dto.QueryResponse{}, fmt.Errorf("retrieval failed: %w", err)
	}

	// Retry once with heuristic scope only when LLM explicit scope produced no evidence.
	if len(chunks) == 0 && rawScope.HasExplicitTime {
		fallbackRaw := rawScope
		fallbackRaw.HasExplicitTime = false
		fallbackRaw.StartUTC = time.Time{}
		fallbackRaw.EndUTC = time.Time{}
		fallbackRaw.TimePhrase = utils.ExtractTimePhraseHeuristic(req.Query)

		if strings.TrimSpace(fallbackRaw.TimePhrase) != "" {
			fallbackScope := utils.NormalizeScope(fallbackRaw, time.Now(), time.Local)
			if fallbackScope.HasExplicitTime {
				retryChunks, retryErr := s.retriever.Retrieve(retrievalReq, intentID, traceID, topK, fallbackScope)
				if retryErr == nil && len(retryChunks) > 0 {
					chunks = retryChunks
					scope = fallbackScope
				}
			}
		}
	}

	entities := dto.EntitiesFound{}
	citations := toCitations(chunks)
	citations = utils.SanitizeCitations(citations)
	citations = filterReadableCitations(citations)
	conf := "medium"
	confScore := 0.5

	nextActions := []string{}

	nextActions = utils.SanitizeActions(nextActions)

	if len(chunks) == 0 {
		answer := "**I can't see enough payment progress yet**\n- I don't have clear payment status records for this question right now.\n- If you just uploaded a file, I may only be able to see that it was received, not whether each payment is done yet."

		resp := dto.QueryResponse{
			Answer:        answer,
			Confidence:    "low",
			EntitiesFound: entities,
			Citations:     []dto.Citation{},
			NextActions:   nextActions,
		}

		s.persistConversationMemory(ctx, req, memorySummary, answer)
		return resp, nil
	}
	if edgeOnlyResp, ok := buildLatestUploadEdgeOnlyResponse(req.Query, chunks); ok {
		edgeOnlyResp.EntitiesFound = entities
		if shouldReturnCitations(class, chunks, edgeOnlyResp.Confidence) {
			edgeOnlyResp.Citations = citations
		}
		edgeOnlyResp.NextActions = nextActions

		s.persistConversationMemory(ctx, req, memorySummary, edgeOnlyResp.Answer)
		return edgeOnlyResp, nil
	}
	rcaContext := ""
	var rcaClusters *client.RCAClustersResponse
	var rcaErr error
	if s.intelligence != nil {
		log.Printf("[prompt-layer][rca] fetching tenant RCA clusters tenant=%s", req.TenantID)

		rcaClusters, rcaErr = s.intelligence.FetchRCAClusters(req.TenantID)
		if rcaErr != nil {
			log.Printf("[prompt-layer][rca] clusters fetch failed tenant=%s err=%v", req.TenantID, rcaErr)
		} else {
			log.Printf("[prompt-layer][rca] clusters fetched tenant=%s data_available=%t clusters=%d", req.TenantID, rcaClusters.DataAvailable, rcaClusters.ReturnedClusters)

			parts := []string{buildRCAContextBlock(rcaClusters)}
			if len(rcaClusters.Clusters) > 0 {
				parts = append(parts, "RCA clusters payload="+string(mustJSON(rcaClusters.Clusters)))
			}
			rcaContext = strings.Join(parts, "\n")
		}
	}
	context := ""
	if strings.TrimSpace(memorySummary) != "" {
		context += "[CONVERSATION_SUMMARY]\n" + utils.SanitizeAnswerText(memorySummary) + "\n"
	}
	if strings.TrimSpace(historyContext) != "" {
		context += "[CHAT_HISTORY_CONTEXT]\n" + historyContext + "\n"
	}
	if !strings.EqualFold(strings.TrimSpace(resolvedQuery), strings.TrimSpace(req.Query)) {
		context += "[RESOLVED_QUERY_CONTEXT]\n"
		context += "Original user query: " + utils.SanitizeAnswerText(req.Query) + "\n"
		context += "Resolved business query: " + utils.SanitizeAnswerText(resolvedQuery) + "\n"
	}
	if selectedContext := buildSelectedUIContextBlock(req.UIContext); selectedContext != "" {
		context += "[SELECTED_UI_CONTEXT]\n" + selectedContext + "\n"
	}
	context += buildBusinessContext(chunks)
	if strings.TrimSpace(rcaContext) != "" {
		context += "\n[RCA_CONTEXT]\n" + rcaContext + "\n"
	}
	var llmOut AnswerWithConfidence
	if class == classNavigation {
		log.Printf("[prompt-layer][llm] call=navigation_answer tenant=%s", req.TenantID)
		txt, navErr := s.llm.GenerateNavigationHowTo(req.Query, context)
		if navErr != nil {
			return dto.QueryResponse{}, fmt.Errorf("generation failed: %w", navErr)
		}
		answer := utils.SanitizeAnswerText(txt)
		answer = utils.StripActionLikeSections(answer)
		if uuidLeakRe.MatchString(answer) || strings.TrimSpace(answer) == "" {
			answer = "I don't see that action available in the current workspace."
		}
		resp := dto.QueryResponse{
			Answer:        answer,
			Confidence:    "high",
			EntitiesFound: entities,
			Citations:     []dto.Citation{},
			NextActions:   nextActions,
		}

		s.persistConversationMemory(ctx, req, memorySummary, answer)
		return resp, nil
	}
	if class == classEvidence {
		log.Printf("[prompt-layer][llm] call=evidence_answer tenant=%s", req.TenantID)
		ev, evErr := s.llm.GenerateEvidenceJSON(req.Query, context)
		if evErr != nil {
			return dto.QueryResponse{}, fmt.Errorf("generation failed: %w", evErr)
		}
		answer := utils.SanitizeAnswerText(ev.Answer)
		answer = utils.StripActionLikeSections(answer)
		if uuidLeakRe.MatchString(answer) || strings.TrimSpace(answer) == "" {
			safeAnswer := "**I can share a safe proof-status summary only**\n- Sensitive identifiers or secure values were removed from the response.\n- Ask for available proof items, missing proof items, and export readiness."

			resp := dto.QueryResponse{
				Answer:        safeAnswer,
				Confidence:    "low",
				EntitiesFound: dto.EntitiesFound{},
				Citations:     []dto.Citation{},
				NextActions:   []string{},
			}

			s.persistConversationMemory(ctx, req, memorySummary, safeAnswer)
			return resp, nil
		}
		resp := dto.QueryResponse{
			Answer:        answer,
			Confidence:    ev.Confidence,
			EntitiesFound: entities,
			Citations:     []dto.Citation{},
			NextActions:   utils.SanitizeActions(ev.NextSteps),
		}

		s.persistConversationMemory(ctx, req, memorySummary, answer)
		return resp, nil
	}

	visRule := "needed=false"
	if scope.WantsVisualization {
		visRule = "needed=true"
	}
	log.Printf("[prompt-layer][llm] call=operational_answer tenant=%s", req.TenantID)
	op, opErr := s.llm.GenerateOperationalJSON(req.Query, context, visRule)
	if opErr != nil {
		return dto.QueryResponse{}, fmt.Errorf("generation failed: %w", opErr)
	}
	llmOut = AnswerWithConfidence{
		Answer:            op.Answer,
		Confidence:        op.Confidence,
		ConfidenceScore:   op.ConfidenceScore,
		EvidenceCoverage:  op.EvidenceCoverage,
		ScopeAdherence:    op.ScopeAdherence,
		ContradictionRisk: op.ContradictionRisk,
		Ambiguity:         op.Ambiguity,
	}

	answer := utils.SanitizeAnswerText(llmOut.Answer)
	answer = utils.StripActionLikeSections(answer)
	if uuidLeakRe.MatchString(answer) || strings.TrimSpace(answer) == "" {
		safeAnswer := "**I can share a safe operational summary only**\n- Sensitive identifiers or secure values were removed from the response.\n- Ask for status, counts, delays, or trends instead of record-level identifiers."

		resp := dto.QueryResponse{
			Answer:        safeAnswer,
			Confidence:    "low",
			EntitiesFound: dto.EntitiesFound{},
			Citations:     []dto.Citation{},
			NextActions:   []string{},
		}

		s.persistConversationMemory(ctx, req, memorySummary, safeAnswer)
		return resp, nil
	}

	conf, confScore = calibrateConfidence(llmOut, chunks)
	rounded := round2(confScore)
	for i := range citations {
		citations[i].Score = rounded
	}
	var viz *dto.Visualization
	if scope.WantsVisualization {
		kind := detectVizKind(req.Query)
		var vizNarrative string

		if rv, rn, ok := s.buildRCAVisualizationFromClusters(rcaClusters, req, scope, kind, conf); ok {
			viz = rv
			vizNarrative = rn
		} else {
			viz, vizNarrative = s.buildDetailedVisualizationFromChunks(chunks, req, scope, kind, conf)
		}

		if strings.TrimSpace(vizNarrative) != "" {
			answer = strings.TrimSpace(answer + "\n\n**Visualization note:** " + vizNarrative)
		}
	}

	finalCitations := []dto.Citation{}
	if shouldReturnCitations(class, chunks, conf) {
		finalCitations = citations
	}
	s.persistConversationMemory(ctx, req, memorySummary, answer)

	return dto.QueryResponse{
		Answer:        answer,
		Confidence:    conf,
		EntitiesFound: entities,
		Citations:     finalCitations,
		NextActions:   nextActions,
		Visualization: viz,
	}, nil

}
func (s *DefaultRAGService) persistConversationMemory(ctx context.Context, req dto.QueryRequest, previousSummary string, answer string) {
	if s.memory == nil {
		return
	}

	cleanAnswer := utils.SanitizeAnswerText(answer)
	if strings.TrimSpace(cleanAnswer) == "" {
		return
	}

	turnSummary := SummarizeAssistantAnswer(cleanAnswer, 500)
	if err := s.memory.AppendTurn(ctx, req.TenantID, req.UserID, req.SessionID, req.Query, turnSummary, time.Now().UTC()); err != nil {
		log.Printf("[prompt-layer][memory] turn write failed tenant=%s user=%s session=%s err=%v", req.TenantID, req.UserID, req.SessionID, err)
		return
	}

	log.Printf("[prompt-layer][memory] turn stored tenant=%s user=%s session=%s", req.TenantID, req.UserID, req.SessionID)

	updatedSummary, err := s.llm.UpdateConversationSummary(previousSummary, req.Query, cleanAnswer)
	if err != nil {
		log.Printf("[prompt-layer][memory] summary update failed tenant=%s user=%s session=%s err=%v", req.TenantID, req.UserID, req.SessionID, err)
		return
	}

	updatedSummary = utils.SanitizeAnswerText(updatedSummary)
	if strings.TrimSpace(updatedSummary) == "" || uuidLeakRe.MatchString(updatedSummary) {
		log.Printf("[prompt-layer][memory] summary skipped tenant=%s user=%s session=%s reason=empty_or_sensitive", req.TenantID, req.UserID, req.SessionID)
		return
	}

	if err := s.memory.SetSummary(ctx, req.TenantID, req.UserID, req.SessionID, updatedSummary); err != nil {
		log.Printf("[prompt-layer][memory] summary write failed tenant=%s user=%s session=%s err=%v", req.TenantID, req.UserID, req.SessionID, err)
		return
	}

	log.Printf("[prompt-layer][memory] summary stored tenant=%s user=%s session=%s", req.TenantID, req.UserID, req.SessionID)
}
func buildMemoryContext(summary string, recentTurns string) string {
	var b strings.Builder
	if strings.TrimSpace(summary) != "" {
		b.WriteString("Conversation summary: ")
		b.WriteString(utils.SanitizeAnswerText(summary))
		b.WriteString("\n")
	}
	if strings.TrimSpace(recentTurns) != "" {
		b.WriteString("Recent turns:\n")
		b.WriteString(recentTurns)
	}
	return strings.TrimSpace(b.String())
}

func resolveFollowupQuery(query string, history []ChatTurn, memorySummary string) string {
	q := strings.TrimSpace(query)
	if q == "" {
		return q
	}

	if len(history) == 0 && strings.TrimSpace(memorySummary) == "" {
		return q
	}

	lower := strings.ToLower(q)
	isFollowup := strings.Contains(lower, "this") ||
		strings.Contains(lower, "that") ||
		strings.Contains(lower, "those") ||
		strings.Contains(lower, "these") ||
		strings.Contains(lower, "them") ||
		strings.Contains(lower, "it") ||
		strings.Contains(lower, "same ones") ||
		strings.Contains(lower, "is this good") ||
		strings.Contains(lower, "is it good") ||
		strings.Contains(lower, "why") ||
		strings.Contains(lower, "what should i do") ||
		strings.Contains(lower, "what next") ||
		strings.Contains(lower, "explain that")

	if !isFollowup {
		return q
	}

	var prevUser string
	var prevAssistant string
	if len(history) > 0 {
		last := history[len(history)-1]
		prevUser = utils.SanitizeAnswerText(last.UserMessage)
		prevAssistant = utils.SanitizeAnswerText(last.AssistantSummary)
	}

	parts := []string{q}
	if strings.TrimSpace(memorySummary) != "" {
		parts = append(parts, "Conversation summary: "+utils.SanitizeAnswerText(memorySummary))
	}
	if strings.TrimSpace(prevUser) != "" || strings.TrimSpace(prevAssistant) != "" {
		parts = append(parts, "Previous turn: "+prevUser+" "+prevAssistant)
	}

	return strings.Join(parts, " ")
}
func shouldOverrideOutOfScopeForFollowup(query string, resolvedQuery string, memorySummary string, historyContext string, history []ChatTurn) bool {
	if strings.TrimSpace(memorySummary) == "" && strings.TrimSpace(historyContext) == "" && len(history) == 0 {
		return false
	}

	if !isConversationFollowupQuery(query) && strings.EqualFold(strings.TrimSpace(query), strings.TrimSpace(resolvedQuery)) {
		return false
	}

	return hasBusinessRelevantMemory(memorySummary, historyContext, history)
}

func isConversationFollowupQuery(query string) bool {
	q := strings.ToLower(strings.TrimSpace(query))
	if q == "" {
		return false
	}

	followupPhrases := []string{
		"this",
		"that",
		"those",
		"these",
		"them",
		"it",
		"same",
		"same ones",
		"is this good",
		"is it good",
		"is that good",
		"good or bad",
		"should i worry",
		"is it risky",
		"is this risky",
		"why",
		"why so",
		"why is that",
		"what next",
		"next step",
		"what should i do",
		"what does this mean",
		"explain this",
		"explain that",
		"tell me more",
		"how to fix",
		"how can i resolve",
	}

	for _, phrase := range followupPhrases {
		if q == phrase || strings.Contains(q, phrase) {
			return true
		}
	}

	return len(strings.Fields(q)) <= 5 && strings.Contains(q, "?")
}

func hasBusinessRelevantMemory(memorySummary string, historyContext string, history []ChatTurn) bool {
	var b strings.Builder
	b.WriteString(" ")
	b.WriteString(memorySummary)
	b.WriteString(" ")
	b.WriteString(historyContext)

	for _, turn := range history {
		b.WriteString(" ")
		b.WriteString(turn.UserMessage)
		b.WriteString(" ")
		b.WriteString(turn.AssistantSummary)
	}

	text := strings.ToLower(b.String())
	if strings.TrimSpace(text) == "" {
		return false
	}

	businessTerms := []string{
		"payment",
		"payments",
		"payout",
		"payouts",
		"intent",
		"intents",
		"payment instruction",
		"payment instructions",
		"batch",
		"batches",
		"settlement",
		"settlements",
		"bank",
		"psp",
		"confirmation",
		"confirmed",
		"status",
		"processing",
		"created",
		"pending",
		"failed",
		"failure",
		"retry",
		"delayed",
		"delay",
		"unmatched",
		"unresolved",
		"review",
		"manual review",
		"value needing review",
		"proof",
		"evidence",
		"dispute",
		"upload",
		"uploaded",
		"file",
		"received",
		"processed",
		"duplicate",
		"risk",
		"gap",
		"short-settled",
		"unlinked",
	}

	for _, term := range businessTerms {
		if strings.Contains(text, term) {
			return true
		}
	}

	return false
}
func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		return []byte("[]")
	}
	return b
}
func buildSelectedUIContextQuery(req dto.QueryRequest, resolvedQuery string) string {
	if req.UIContext == nil {
		return resolvedQuery
	}

	parts := []string{resolvedQuery}

	if s := strings.TrimSpace(req.UIContext.Scope); s != "" {
		parts = append(parts, "selected_scope="+s)
	}
	if s := strings.TrimSpace(req.UIContext.SourcePage); s != "" {
		parts = append(parts, "selected_source_page="+s)
	}
	if s := strings.TrimSpace(req.UIContext.SectionTitle); s != "" {
		parts = append(parts, "selected_section="+s)
	}
	if s := strings.TrimSpace(req.UIContext.SelectedTitle); s != "" {
		parts = append(parts, "selected_title="+s)
	}
	if s := strings.TrimSpace(req.UIContext.SelectedDescription); s != "" {
		parts = append(parts, "selected_description="+s)
	}
	if s := strings.TrimSpace(req.UIContext.BatchID); s != "" {
		parts = append(parts, "batch_id: "+s)
	}

	return strings.Join(parts, " ")
}

func buildSelectedUIContextBlock(ctx *dto.UIContext) string {
	if ctx == nil {
		return ""
	}

	var b strings.Builder
	b.WriteString("The user opened Ask Zord from a selected UI section. Answer only within this selected business context unless the user clearly asks to broaden the scope.\n")

	writeContextLine := func(label, value string) {
		value = strings.TrimSpace(value)
		if value == "" {
			return
		}
		b.WriteString(label)
		b.WriteString(": ")
		b.WriteString(utils.SanitizeAnswerText(value))
		b.WriteString("\n")
	}

	writeContextLine("Selected scope", ctx.Scope)
	writeContextLine("Scope level", ctx.ScopeLevel)
	writeContextLine("Source page", ctx.SourcePage)
	writeContextLine("Section", ctx.SectionTitle)
	writeContextLine("Selected item", ctx.SelectedTitle)
	writeContextLine("Selected explanation", ctx.SelectedDescription)

	if len(ctx.SelectedMetrics) > 0 {
		b.WriteString("Selected visible metrics:\n")
		for _, metric := range ctx.SelectedMetrics {
			label := strings.TrimSpace(metric.Label)
			value := strings.TrimSpace(metric.Value)
			if label == "" || value == "" {
				continue
			}
			b.WriteString("- ")
			b.WriteString(utils.SanitizeAnswerText(label))
			b.WriteString(": ")
			b.WriteString(utils.SanitizeAnswerText(value))
			b.WriteString("\n")
		}
	}

	return strings.TrimSpace(b.String())
}
func buildContext(chunks []model.RetrievedChunk) string {
	var b strings.Builder
	for i, c := range chunks {
		b.WriteString(fmt.Sprintf("[%d] source=%s score=%.4f\n%s\n\n", i+1, c.SourceType, c.Score, c.Text))
	}
	return b.String()
}
func buildBusinessContext(chunks []model.RetrievedChunk) string {
	raw := buildContext(chunks)
	replacements := map[string]string{
		"ambiguous_intent_count":      "Payments needing match review",
		"ambiguity_rate":              "Review rate",
		"provider_ref_missing_rate":   "Missing bank/PSP reference rate",
		"avg_attachment_confidence":   "Average match confidence",
		"risk_adjusted_leakage_minor": "Value needing review",
		"intent":                      "payment instruction",
		"settlement observation":      "bank/settlement record",
		"defensibility":               "proof readiness",
	}
	out := raw
	for k, v := range replacements {
		out = strings.ReplaceAll(out, k, v)
	}
	return out
}
func toCitations(chunks []model.RetrievedChunk) []dto.Citation {
	out := make([]dto.Citation, 0, len(chunks))
	for _, c := range chunks {
		out = append(out, dto.Citation{
			SourceType: c.SourceType,
			RecordID:   c.RecordID,
			ChunkID:    c.ChunkID,
			Snippet:    formatCitationSnippet(c.SourceType, c.Text),
			Score:      c.Score,
		})
	}
	return out
}

func formatCitationSnippet(sourceType, raw string) string {
	kv := parseKV(raw)
	switch strings.ToLower(strings.TrimSpace(sourceType)) {
	case "intent_payment_intents":
		return joinNonEmpty(" · ",
			"Payment instruction",
			labelValue("Status", pick(kv, "status")),
			labelValue("Type", pick(kv, "type")),
			labelValue("Amount", formatAmountINR(pick(kv, "amount"))),
			labelValue("Received", formatDisplayTime(pick(kv, "created_at"))),
		)
	case "edge_ingress_outbox":
		return joinNonEmpty(" · ",
			"Ingestion handoff",
			labelValue("Status", pick(kv, "status")),
			labelValue("Event", pick(kv, "event_type")),
			labelValue("Attempts", pick(kv, "attempts")),
			labelValue("Created", formatDisplayTime(pick(kv, "created_at"))),
			labelValue("Updated", formatDisplayTime(pick(kv, "updated_at"))),
			labelValue("Published", formatDisplayTime(pick(kv, "published_at"))),
		)
	case "edge_ingress_envelopes":
		return joinNonEmpty(" · ",
			"Envelope received",
			labelValue("Channel", pick(kv, "ingress_channel")),
			labelValue("Source", pick(kv, "source_system")),
			labelValue("Status", pick(kv, "status")),
			labelValue("Rows", pick(kv, "row_count_estimate")),
			labelValue("Received", formatDisplayTime(pick(kv, "received_at"))),
		)
	case "edge_idempotency_keys":
		return joinNonEmpty(" · ",
			"Duplicate-control signal",
			labelValue("Status", pick(kv, "status")),
			labelValue("Resolution", pick(kv, "resolution_type")),
			labelValue("Conflicts", pick(kv, "conflict_count")),
			labelValue("First seen", formatDisplayTime(pick(kv, "first_seen_at"))),
			labelValue("Last seen", formatDisplayTime(pick(kv, "last_seen_at"))),
		)
	default:
		parts := []string{}
		for _, k := range []string{
			"status", "type", "event_type", "source_system", "ingress_channel", "amount",
			"created_at", "updated_at", "published_at", "received_at",
		} {
			v := pick(kv, k)
			if v == "" {
				continue
			}
			if strings.Contains(k, "_at") {
				v = formatDisplayTime(v)
			}
			if k == "amount" {
				v = formatAmountINR(v)
			}
			parts = append(parts, labelValue(humanLabel(k), v))
		}
		if len(parts) == 0 {
			return ""
		}
		return joinNonEmpty(" · ", append([]string{"Operational evidence"}, parts...)...)
	}
}

func parseKV(raw string) map[string]string {
	out := map[string]string{}
	for _, f := range strings.Fields(raw) {
		if !strings.Contains(f, "=") {
			continue
		}
		parts := strings.SplitN(f, "=", 2)
		if len(parts) != 2 {
			continue
		}
		k := strings.TrimSpace(parts[0])
		v := strings.Trim(strings.TrimSpace(parts[1]), ",")
		out[strings.ToLower(k)] = v
	}
	return out
}

func pick(m map[string]string, key string) string {
	v := strings.TrimSpace(m[strings.ToLower(key)])
	switch strings.ToLower(v) {
	case "", "-", "null", "nil", "none", "n/a":
		return ""
	default:
		return v
	}
}

func labelValue(label, value string) string {
	if strings.TrimSpace(value) == "" {
		return ""
	}
	return label + ": " + value
}

func joinNonEmpty(sep string, vals ...string) string {
	clean := make([]string, 0, len(vals))
	for _, v := range vals {
		v = strings.TrimSpace(v)
		if v != "" {
			clean = append(clean, v)
		}
	}
	return strings.Join(clean, sep)
}

func humanLabel(k string) string {
	switch k {
	case "created_at":
		return "Created"
	case "updated_at":
		return "Updated"
	case "published_at":
		return "Published"
	case "received_at":
		return "Received"
	case "source_system":
		return "Source"
	case "ingress_channel":
		return "Channel"
	case "event_type":
		return "Event"
	default:
		return strings.Title(strings.ReplaceAll(k, "_", " "))
	}
}

func formatDisplayTime(s string) string {
	s = strings.TrimSpace(s)
	if s == "" || s == "-" {
		return ""
	}
	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05.999999-07",
		"2006-01-02 15:04:05-07",
		"2006-01-02 15:04:05",
	}
	var t time.Time
	var err error
	for _, l := range layouts {
		t, err = time.Parse(l, s)
		if err == nil {
			loc, _ := time.LoadLocation("Asia/Kolkata")
			return t.In(loc).Format("02 Jan 2006, 03:04 PM MST")
		}
	}
	return s
}

func formatAmountINR(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	return "₹" + s
}
func calibrateConfidence(out AnswerWithConfidence, chunks []model.RetrievedChunk) (string, float64) {
	// Retrieval-backed factors
	evidenceCountFactor := clampByCount(len(chunks), 3) // full score at >=3 chunks
	sourceDiversityFactor := sourceDiversity(chunks)    // 0..1

	// LLM signals (already clamped in llm_service)
	base := 0.45*out.ConfidenceScore +
		0.20*out.EvidenceCoverage +
		0.20*out.ScopeAdherence +
		0.10*(1.0-out.ContradictionRisk) +
		0.05*(1.0-out.Ambiguity)

	// Mild objective calibration so score isn't purely self-reported by LLM
	calibrated := base * (0.80 + 0.20*evidenceCountFactor)
	calibrated = calibrated * (0.85 + 0.15*sourceDiversityFactor)
	calibrated = clamp01(calibrated)

	return confidenceLabel(calibrated), calibrated
}

func confidenceLabel(score float64) string {
	if score >= 0.75 {
		return "high"
	}
	if score >= 0.45 {
		return "medium"
	}
	return "low"
}

func clampByCount(n, fullAt int) float64 {
	if fullAt <= 0 {
		return 1
	}
	v := float64(n) / float64(fullAt)
	if v > 1 {
		return 1
	}
	if v < 0 {
		return 0
	}
	return v
}

func sourceDiversity(chunks []model.RetrievedChunk) float64 {
	if len(chunks) == 0 {
		return 0
	}
	seen := map[string]struct{}{}
	for _, c := range chunks {
		group := sourceGroup(c.SourceType)
		if group != "" {
			seen[group] = struct{}{}
		}
	}
	v := float64(len(seen)) / 6.0 // edge, intent, relay, intelligence, evidence
	if v > 1 {
		return 1
	}
	if v < 0 {
		return 0
	}
	return v
}

func sourceGroup(sourceType string) string {
	s := strings.ToLower(strings.TrimSpace(sourceType))
	switch {
	case strings.HasPrefix(s, "edge_"):
		return "edge"
	case strings.HasPrefix(s, "intent_"):
		return "intent"
	case strings.HasPrefix(s, "relay_"):
		return "relay"
	case strings.HasPrefix(s, "intelligence_"):
		return "intelligence"
	case strings.HasPrefix(s, "evidence_"):
		return "evidence"
	case strings.HasPrefix(s, "outcome_"):
		return "outcome"
	default:
		return ""
	}
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}
func filterReadableCitations(in []dto.Citation) []dto.Citation {
	out := make([]dto.Citation, 0, len(in))
	for _, c := range in {
		s := strings.TrimSpace(c.Snippet)
		if s == "" || s == "-" || s == "—" {
			continue
		}
		if strings.Count(s, ":") == 0 && len(s) < 18 {
			continue
		}
		out = append(out, c)
	}
	return out
}
func extractCorridorID(q string) string {
	m := corridorIDRe.FindStringSubmatch(q)
	if len(m) < 2 {
		return ""
	}
	return strings.TrimSpace(m[1])
}

func buildLatestUploadEdgeOnlyResponse(query string, chunks []model.RetrievedChunk) (dto.QueryResponse, bool) {
	if !isLatestUploadProgressQuery(query) || !hasOnlyEdgeEvidence(chunks) {
		return dto.QueryResponse{}, false
	}

	rowCount := 0
	inProcess := 0
	failed := 0
	uploaded := false

	for _, c := range chunks {
		switch strings.ToLower(strings.TrimSpace(c.SourceType)) {
		case "edge_ingress_envelopes":
			if rowCount == 0 {
				if m := rowCountEstimateRe.FindStringSubmatch(c.Text); len(m) == 2 {
					fmt.Sscanf(m[1], "%d", &rowCount)
				}
			}
			uploaded = true
		case "edge_ingress_outbox":
			m := outboxStatusRe.FindStringSubmatch(strings.ToUpper(c.Text))
			if len(m) != 2 {
				continue
			}
			switch m[1] {
			case "FAILED":
				failed++
			case "PENDING", "SENT":
				inProcess++
			}
		}
	}

	if !uploaded || rowCount <= 0 {
		return dto.QueryResponse{}, false
	}

	if inProcess == 0 && failed == 0 {
		inProcess = rowCount
	}
	if inProcess > rowCount {
		inProcess = rowCount
	}
	if failed > rowCount {
		failed = rowCount
	}

	answer := fmt.Sprintf("**Your latest upload has %d payments, and they are still being processed.**\n- I can see the file was received by Zord.\n- The payments have entered the pipeline, but I do not see final done/not-done updates yet.", rowCount)
	if failed > 0 {
		answer = fmt.Sprintf("**Your latest upload has %d payments. %d are still being processed and %d did not go through.**\n- I can see the file was received by Zord.\n- The latest upload is still mid-flow, so final payment updates may still be catching up.", rowCount, maxInt(inProcess, rowCount-failed), failed)
	}

	return dto.QueryResponse{
		Answer:     answer,
		Confidence: "medium",
	}, true
}

func hasOnlyEdgeEvidence(chunks []model.RetrievedChunk) bool {
	if len(chunks) == 0 {
		return false
	}
	for _, c := range chunks {
		if !strings.HasPrefix(strings.ToLower(strings.TrimSpace(c.SourceType)), "edge_") {
			return false
		}
	}
	return true
}

func isLatestUploadProgressQuery(q string) bool {
	s := strings.ToLower(strings.TrimSpace(q))
	if s == "" {
		return false
	}
	if !(strings.Contains(s, "latest upload") || strings.Contains(s, "recent upload") || strings.Contains(s, "latest batch")) {
		return false
	}
	mentionsPayments := strings.Contains(s, "payment") || strings.Contains(s, "payout") || strings.Contains(s, "disbursement")
	mentionsProgress := strings.Contains(s, "in process") || strings.Contains(s, "pending") || strings.Contains(s, "still") || strings.Contains(s, "status")
	return mentionsPayments && mentionsProgress
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func (s *DefaultRAGService) buildDetailedVisualizationFromChunks(
	chunks []model.RetrievedChunk,
	req dto.QueryRequest,
	scope utils.QueryScope,
	kind vizKind,
	confidence string,
) (*dto.Visualization, string) {
	statusCounts := map[string]float64{}
	sourceCounts := map[string]float64{}

	for _, c := range chunks {
		src := sourceGroup(c.SourceType)
		if src != "" {
			sourceCounts[strings.Title(src)]++
		}
		status := extractStatusToken(c.Text)
		if status != "" {
			statusCounts[status]++
		}
	}

	series := make([]dto.VisualizationPoint, 0)
	title := "Operational Distribution"
	subtitle := "Tenant-scoped operational status from current evidence"
	description := "This view summarizes operational patterns for the selected tenant in business-friendly terms."
	xAxis := "Category"
	yAxis := "Count"
	legend := []string{"Higher bars indicate more observed events in current evidence."}

	switch kind {
	case vizTopFailures:
		title = "Top Failure Categories"
		subtitle = "Most frequent failure-type observations for this tenant"
		description = "This chart highlights where operational issues are concentrating, so teams can prioritize impact."
		xAxis = "Failure Category"
		for k, v := range statusCounts {
			if strings.Contains(strings.ToUpper(k), "FAIL") || strings.Contains(strings.ToUpper(k), "ERROR") {
				series = append(series, dto.VisualizationPoint{Label: utils.SanitizeAnswerText(k), Value: v})
			}
		}
		if len(series) == 0 {
			for k, v := range statusCounts {
				series = append(series, dto.VisualizationPoint{Label: utils.SanitizeAnswerText(k), Value: v})
			}
		}
	case vizSLABreach:
		title = "SLA Breach Risk Snapshot"
		subtitle = "Observed delayed/breached patterns in current tenant evidence"
		description = "This chart gives a business view of likely SLA pressure based on recent processing outcomes."
		xAxis = "SLA State"
		breached := 0.0
		onTime := 0.0
		for k, v := range statusCounts {
			up := strings.ToUpper(k)
			if strings.Contains(up, "FAIL") || strings.Contains(up, "DELAY") || strings.Contains(up, "BREACH") {
				breached += v
			} else {
				onTime += v
			}
		}
		series = append(series, dto.VisualizationPoint{Label: "Breach/Delayed", Value: breached})
		series = append(series, dto.VisualizationPoint{Label: "On Track", Value: onTime})
	case vizApprovalMix:
		title = "Pending Approval Mix"
		subtitle = "Severity-like distribution inferred from current action/evidence context"
		description = "This chart shows relative concentration of pending work to support prioritization."
		xAxis = "Priority Bucket"
		high := 0.0
		medium := 0.0
		low := 0.0
		for k, v := range statusCounts {
			up := strings.ToUpper(k)
			switch {
			case strings.Contains(up, "HIGH"):
				high += v
			case strings.Contains(up, "MEDIUM"):
				medium += v
			default:
				low += v
			}
		}
		series = append(series, dto.VisualizationPoint{Label: "High", Value: high})
		series = append(series, dto.VisualizationPoint{Label: "Medium", Value: medium})
		series = append(series, dto.VisualizationPoint{Label: "Low", Value: low})
	default:
		title = "Source-Wise Evidence Coverage"
		subtitle = "How evidence is distributed across operational domains"
		description = "This chart explains where the current answer evidence is coming from."
		xAxis = "Operational Domain"
		for k, v := range sourceCounts {
			series = append(series, dto.VisualizationPoint{Label: utils.SanitizeAnswerText(k), Value: v})
		}
	}

	if len(series) == 0 {
		return &dto.Visualization{
			VisualizationID:   "viz-" + strings.ToLower(string(kind)),
			ChartType:         "bar",
			Title:             title,
			Subtitle:          subtitle,
			Description:       description,
			XAxis:             xAxis,
			YAxis:             yAxis,
			Series:            []dto.VisualizationPoint{},
			Legend:            legend,
			Insights:          []string{"No sufficient tenant-scoped data was found for a reliable visualization."},
			SummaryMetrics:    []dto.VisualizationMetric{{Key: "Tenant", Value: utils.SanitizeAnswerText(req.TenantID)}, {Key: "Data points", Value: "0"}},
			TimeWindow:        buildVisualizationWindow(scope),
			Confidence:        "low",
			EmptyStateMessage: "No sufficient tenant-scoped data is available for visualization right now.",
		}, "I could not find enough tenant-scoped data to render a detailed visualization right now."
	}

	sort.Slice(series, func(i, j int) bool { return series[i].Value > series[j].Value })

	total := 0.0
	for _, p := range series {
		total += p.Value
	}
	topLabel := series[0].Label
	topValue := series[0].Value

	insight := fmt.Sprintf("The highest concentration is in %s with %.0f observations.", topLabel, topValue)
	insight = utils.SanitizeAnswerText(insight)

	metrics := []dto.VisualizationMetric{
		{Key: "Tenant", Value: utils.SanitizeAnswerText(req.TenantID)},
		{Key: "Data points", Value: fmt.Sprintf("%.0f", total)},
		{Key: "Top category", Value: utils.SanitizeAnswerText(topLabel)},
	}

	return &dto.Visualization{
		VisualizationID: "viz-" + strings.ToLower(string(kind)),
		ChartType:       "bar",
		Title:           title,
		Subtitle:        subtitle,
		Description:     utils.SanitizeAnswerText(description),
		XAxis:           xAxis,
		YAxis:           yAxis,
		Series:          sanitizeVisualizationSeries(series),
		Legend:          sanitizeStringList(legend),
		Insights:        sanitizeStringList([]string{insight}),
		SummaryMetrics:  sanitizeMetrics(metrics),
		TimeWindow:      buildVisualizationWindow(scope),
		Confidence:      confidence,
	}, insight
}

func extractStatusToken(text string) string {
	up := strings.ToUpper(text)
	switch {
	case strings.Contains(up, "STATUS=FAILED"), strings.Contains(up, "STATUS=FAIL"), strings.Contains(up, "ERROR"):
		return "FAILED"
	case strings.Contains(up, "STATUS=PENDING"), strings.Contains(up, "PENDING"):
		return "PENDING"
	case strings.Contains(up, "STATUS=SUCCESS"), strings.Contains(up, "SUCCESS"):
		return "SUCCESS"
	case strings.Contains(up, "RETRY"):
		return "RETRY"
	default:
		return ""
	}
}
func (s *DefaultRAGService) buildRCAVisualizationFromClusters(
	rca *client.RCAClustersResponse,
	req dto.QueryRequest,
	scope utils.QueryScope,
	kind vizKind,
	confidence string,
) (*dto.Visualization, string, bool) {
	if rca == nil || !rca.DataAvailable || len(rca.Clusters) == 0 {
		return nil, "", false
	}

	type agg struct {
		label string
		value float64
	}
	acc := map[string]float64{}

	for _, raw := range rca.Clusters {
		var obj map[string]any
		if err := json.Unmarshal(raw, &obj); err != nil {
			continue
		}

		label := firstString(obj,
			"cluster_name", "label", "reason", "reason_code", "failure_reason", "bucket", "name", "cluster_id")
		if strings.TrimSpace(label) == "" {
			label = "Cluster"
		}
		label = utils.SanitizeAnswerText(label)
		if strings.TrimSpace(label) == "" || uuidLeakRe.MatchString(label) {
			continue
		}

		v := firstNumber(obj,
			"affected_amount_minor", "total_affected_amount_minor", "affected_count", "count", "points")
		if v <= 0 {
			v = 1
		}
		acc[label] += v
	}

	if len(acc) == 0 {
		return nil, "", false
	}

	series := make([]dto.VisualizationPoint, 0, len(acc))
	for k, v := range acc {
		series = append(series, dto.VisualizationPoint{Label: k, Value: v})
	}
	sort.Slice(series, func(i, j int) bool { return series[i].Value > series[j].Value })

	title := "RCA Cluster Distribution"
	subtitle := "Root-cause concentration for current tenant scope"
	description := "This visualization is generated from intelligence RCA clusters to explain concentration of operational issues."
	xAxis := "RCA Cluster"
	yAxis := "Impact"

	total := 0.0
	for _, p := range series {
		total += p.Value
	}
	top := series[0]
	insight := utils.SanitizeAnswerText(fmt.Sprintf("Highest concentration is in %s (%.0f impact units).", top.Label, top.Value))

	metrics := []dto.VisualizationMetric{
		{Key: "Tenant", Value: utils.SanitizeAnswerText(req.TenantID)},
		{Key: "Clusters", Value: fmt.Sprintf("%d", len(series))},
		{Key: "Total impact", Value: fmt.Sprintf("%.0f", total)},
	}

	variants := []dto.VisualizationVariant{
		{
			ChartType:      "bar",
			Title:          title,
			Subtitle:       subtitle,
			Description:    description,
			XAxis:          xAxis,
			YAxis:          yAxis,
			Series:         sanitizeVisualizationSeries(series),
			Legend:         sanitizeStringList([]string{"RCA cluster impact comparison"}),
			Insights:       sanitizeStringList([]string{insight}),
			SummaryMetrics: sanitizeMetrics(metrics),
		},
		{
			ChartType:      "pie",
			Title:          "RCA Share Breakdown",
			Subtitle:       "Percentage contribution by RCA cluster",
			Description:    "Use this to see dominant root-cause share.",
			Series:         sanitizeVisualizationSeries(series),
			Legend:         sanitizeStringList([]string{"Cluster share of total impact"}),
			Insights:       sanitizeStringList([]string{insight}),
			SummaryMetrics: sanitizeMetrics(metrics),
		},
		{
			ChartType:      "donut",
			Title:          "RCA Contribution Mix",
			Subtitle:       "Relative mix of RCA categories",
			Description:    "Shows contribution split in a compact format.",
			Series:         sanitizeVisualizationSeries(series),
			Legend:         sanitizeStringList([]string{"Contribution by cluster"}),
			Insights:       sanitizeStringList([]string{insight}),
			SummaryMetrics: sanitizeMetrics(metrics),
		},
		{
			ChartType:      "table",
			Title:          "RCA Cluster Table View",
			Subtitle:       "Ranked RCA cluster impact",
			Description:    "Tabular ranking for operational review.",
			XAxis:          "Cluster",
			YAxis:          "Impact",
			Series:         sanitizeVisualizationSeries(series),
			Legend:         sanitizeStringList([]string{"Ranked cluster impact"}),
			Insights:       sanitizeStringList([]string{insight}),
			SummaryMetrics: sanitizeMetrics(metrics),
		},
	}

	return &dto.Visualization{
		VisualizationID: "viz-rca-" + strings.ToLower(string(kind)),
		ChartType:       "bar",
		Title:           title,
		Subtitle:        subtitle,
		Description:     utils.SanitizeAnswerText(description),
		XAxis:           xAxis,
		YAxis:           yAxis,
		Series:          sanitizeVisualizationSeries(series),
		ChartVariants:   sanitizeVisualizationVariants(variants),
		Legend:          sanitizeStringList([]string{"RCA cluster impact comparison"}),
		Insights:        sanitizeStringList([]string{insight}),
		SummaryMetrics:  sanitizeMetrics(metrics),
		TimeWindow:      buildVisualizationWindow(scope),
		Confidence:      confidence,
	}, insight, true
}

func firstString(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok {
			switch t := v.(type) {
			case string:
				if strings.TrimSpace(t) != "" {
					return strings.TrimSpace(t)
				}
			}
		}
	}
	return ""
}

func firstNumber(m map[string]any, keys ...string) float64 {
	for _, k := range keys {
		if v, ok := m[k]; ok {
			switch t := v.(type) {
			case float64:
				return t
			case float32:
				return float64(t)
			case int:
				return float64(t)
			case int64:
				return float64(t)
			case json.Number:
				if f, err := t.Float64(); err == nil {
					return f
				}
			}
		}
	}
	return 0
}
func sanitizeVisualizationSeries(in []dto.VisualizationPoint) []dto.VisualizationPoint {
	out := make([]dto.VisualizationPoint, 0, len(in))
	for _, p := range in {
		label := utils.SanitizeAnswerText(p.Label)
		if strings.TrimSpace(label) == "" || uuidLeakRe.MatchString(label) {
			continue
		}
		out = append(out, dto.VisualizationPoint{Label: label, Value: p.Value})
	}
	return out
}

func sanitizeStringList(in []string) []string {
	out := make([]string, 0, len(in))
	for _, s := range in {
		v := utils.SanitizeAnswerText(s)
		if strings.TrimSpace(v) != "" && !uuidLeakRe.MatchString(v) {
			out = append(out, v)
		}
	}
	return out
}

func sanitizeMetrics(in []dto.VisualizationMetric) []dto.VisualizationMetric {
	out := make([]dto.VisualizationMetric, 0, len(in))
	for _, m := range in {
		k := utils.SanitizeAnswerText(m.Key)
		v := utils.SanitizeAnswerText(m.Value)
		if strings.TrimSpace(k) == "" || strings.TrimSpace(v) == "" {
			continue
		}
		if uuidLeakRe.MatchString(k) || uuidLeakRe.MatchString(v) {
			continue
		}
		out = append(out, dto.VisualizationMetric{Key: k, Value: v})
	}
	return out
}
func sanitizeVisualizationVariants(in []dto.VisualizationVariant) []dto.VisualizationVariant {
	out := make([]dto.VisualizationVariant, 0, len(in))
	for _, v := range in {
		item := dto.VisualizationVariant{
			ChartType:      strings.TrimSpace(v.ChartType),
			Title:          utils.SanitizeAnswerText(v.Title),
			Subtitle:       utils.SanitizeAnswerText(v.Subtitle),
			Description:    utils.SanitizeAnswerText(v.Description),
			XAxis:          utils.SanitizeAnswerText(v.XAxis),
			YAxis:          utils.SanitizeAnswerText(v.YAxis),
			Series:         sanitizeVisualizationSeries(v.Series),
			Legend:         sanitizeStringList(v.Legend),
			Insights:       sanitizeStringList(v.Insights),
			SummaryMetrics: sanitizeMetrics(v.SummaryMetrics),
		}
		if strings.TrimSpace(item.ChartType) == "" || strings.TrimSpace(item.Title) == "" {
			continue
		}
		out = append(out, item)
	}
	return out
}
func buildVisualizationWindow(scope utils.QueryScope) *dto.VisualizationWindow {
	if !scope.HasExplicitTime {
		if strings.TrimSpace(scope.TimePhrase) == "" {
			return nil
		}
		return &dto.VisualizationWindow{Label: scope.TimePhrase}
	}
	return &dto.VisualizationWindow{
		FromUTC: scope.StartUTC.UTC().Format(time.RFC3339),
		ToUTC:   scope.EndUTC.UTC().Format(time.RFC3339),
		Label:   scope.TimePhrase,
	}
}
