package askzord

import "zord-prompt-layer/tools"

func Ask(c *tools.OutcomeClient, tenantID, connectorID, question string, inherit EntityRef) Response {
	if c == nil {
		return Response{
			Answer:      "Finance tools are not configured.",
			Intent:      IntentKnowledge,
			Confidence:  0.2,
			Limitations: []string{"No structured finance client."},
		}
	}
	plan := Plan(question, inherit)
	if plan.Intent == IntentKnowledge || plan.Filters == nil {
		if plan.Filters == nil {
			plan.Filters = map[string]string{}
		}
	}
	plan.Filters["question"] = question
	ctx := Retrieve(c, tenantID, connectorID, plan)
	return BuildAnswer(ctx)
}
