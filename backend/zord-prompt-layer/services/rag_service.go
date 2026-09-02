package services

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"
	"zord-prompt-layer/agents/finance"
	"zord-prompt-layer/client"
	"zord-prompt-layer/dto"
	"zord-prompt-layer/tools"
	"zord-prompt-layer/utils"
)

type RAGService interface {
	Query(req dto.QueryRequest) (dto.QueryResponse, error)
}

type DefaultRAGService struct {
	model            string
	retriever        EvidenceRetriever
	llm              *LLMService
	defaultK         int
	intelligence     *client.IntelligenceClient
	memory           ChatMemoryStore
	recon            *tools.OutcomeClient
	defaultConnector string
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

func (s *DefaultRAGService) SetReconClient(c *tools.OutcomeClient, connectorID string) {
	s.recon = c
	s.defaultConnector = connectorID
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

	if s.recon != nil {
		if ans, ok := finance.Investigate(s.recon, req.TenantID, s.defaultConnector, resolvedQuery); ok {
			resp := dto.QueryResponse{
				Answer:        utils.SanitizeAnswerText(ans),
				Confidence:    "high",
				EntitiesFound: dto.EntitiesFound{},
				Citations:     []dto.Citation{{SourceType: "reconciliation_exception", Snippet: "outcome-engine financial recon APIs; amounts copied from structured fields"}},
				NextActions:   []string{},
			}
			s.persistConversationMemory(ctx, req, memorySummary, resp.Answer)
			return resp, nil
		}
		if ans, ok := tools.Investigate(s.recon, req.TenantID, s.defaultConnector, resolvedQuery); ok {
			resp := dto.QueryResponse{
				Answer:        utils.SanitizeAnswerText(ans),
				Confidence:    "high",
				EntitiesFound: dto.EntitiesFound{},
				Citations:     []dto.Citation{{SourceType: "reconciliation_exception", Snippet: "outcome-engine financial recon APIs; amounts copied from structured fields"}},
				NextActions:   []string{},
			}
			s.persistConversationMemory(ctx, req, memorySummary, resp.Answer)
			return resp, nil
		}
		if ans, ok := tools.Answer(s.recon, req.TenantID, s.defaultConnector, resolvedQuery); ok {
			resp := dto.QueryResponse{
				Answer:        utils.SanitizeAnswerText(ans),
				Confidence:    "high",
				EntitiesFound: dto.EntitiesFound{},
				Citations:     []dto.Citation{{SourceType: "payment_proof", Snippet: "outcome-engine proof API; bank credit only when a bank row is matched"}},
				NextActions:   []string{},
			}
			s.persistConversationMemory(ctx, req, memorySummary, resp.Answer)
			return resp, nil
		}
	}
	selectedUIContext := buildSelectedUIContextBlock(req.UIContext)

	log.Printf("[prompt-layer][llm] call=planner tenant=%s", req.TenantID)
	plan, planErr := s.llm.PlanQuery(resolvedQuery, memoryContext, selectedUIContext)

	var dec QueryClassDecision
	var class queryClass

	if planErr != nil {
		log.Printf("[prompt-layer][planner] failed tenant=%s err=%v; falling back to classifier", req.TenantID, planErr)
		log.Printf("[prompt-layer][llm] call=classifier tenant=%s", req.TenantID)

		dec, err := s.llm.ClassifyQueryIntent(resolvedQuery, memoryContext)
		if err != nil {
			log.Printf("[prompt-layer][classify] llm-classifier failed tenant=%s err=%v; defaulting general", req.TenantID, err)
			return buildGeneralResponse(), nil
		}

		class = mapLLMClass(dec.Class)
	} else {
		log.Printf(
			"[prompt-layer][planner] decision tenant=%s query_type=%s confidence=%.2f needs_data=%t needs_clarification=%t needs_vector=%t needs_likelihood=%t needs_audit=%t targets=%s",
			req.TenantID,
			plan.QueryType,
			plan.Confidence,
			plan.NeedsData,
			plan.NeedsClarification,
			plan.NeedsVectorContext,
			plan.NeedsLikelihoodReasoning,
			plan.NeedsAuditSummary,
			strings.Join(plan.RetrievalTargets, ","),
		)

		if shouldAskPlannerClarification(plan, req, memorySummary, historyContext, history) {
			resp := buildClarificationResponse(plan.ClarificationQuestion)
			log.Printf("[prompt-layer][planner] clarification tenant=%s question=%q", req.TenantID, resp.Answer)
			s.persistConversationMemory(ctx, req, memorySummary, resp.Answer)
			return resp, nil
		}

		class = mapLLMClass(plan.QueryType)
		dec = QueryClassDecision{
			Class:              plan.QueryType,
			Confidence:         plan.Confidence,
			NeedsData:          plan.NeedsData,
			NeedsVisualization: plan.NeedsVisualization,
			Reason:             plan.Reason,
		}
	}

	if dec.Confidence < 0.50 {
		log.Printf("[prompt-layer][classify] low confidence tenant=%s class=%s confidence=%.2f; defaulting general", req.TenantID, dec.Class, dec.Confidence)
		class = classProduct
	}

	if class == classOutOfScope && shouldOverrideOutOfScopeForFollowup(req.Query, resolvedQuery, memorySummary, historyContext, history) {
		log.Printf("[prompt-layer][router] followup override from=out_of_scope to=operational_data_query tenant=%s user=%s session=%s confidence=%.2f", req.TenantID, req.UserID, req.SessionID, dec.Confidence)
		class = classOperational
		dec.NeedsData = true
	}

	log.Printf("[prompt-layer][router] route=%s source=planner confidence=%.2f tenant=%s", class, dec.Confidence, req.TenantID)
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

	if planErr == nil {
		retrievalReq.PlannerNeedsVector = plan.NeedsVectorContext
		retrievalReq.PlannerBusinessIntent = plan.BusinessIntent
		retrievalReq.PlannerRetrievalTargets = plan.RetrievalTargets
		retrievalReq.PlannerReferenceCandidates = plan.ReferenceCandidates
		retrievalReq.PlannerNeedsLikelihood = plan.NeedsLikelihoodReasoning
		retrievalReq.PlannerNeedsAuditSummary = plan.NeedsAuditSummary
	}

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

		rcaClusters, rcaErr = s.intelligence.FetchRCAClusters(req.TenantID, req.AuthorizationHeader)
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
	if selectedUIContext != "" {
		context += "[SELECTED_UI_CONTEXT]\n" + selectedUIContext + "\n"
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

		resp = enforceAdvisoryResponseGuard(resp, class, chunks)
		s.persistConversationMemory(ctx, req, memorySummary, resp.Answer)

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

		resp = enforceAdvisoryResponseGuard(resp, class, chunks)
		s.persistConversationMemory(ctx, req, memorySummary, resp.Answer)
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
	resp := dto.QueryResponse{
		Answer:        answer,
		Confidence:    conf,
		EntitiesFound: entities,
		Citations:     finalCitations,
		NextActions:   nextActions,
		Visualization: viz,
	}

	resp = enforceAdvisoryResponseGuard(resp, class, chunks)
	s.persistConversationMemory(ctx, req, memorySummary, resp.Answer)

	return resp, nil

}
