.PHONY: demo seed close eval test

demo: close

seed:
	cd backend/zord-outcome-engine && go run ./cmd/finance-seed --truncate --profile realistic --limit 120

close:
	cd backend/zord-outcome-engine && go run ./cmd/finance-close --profile realistic --limit 120

eval:
	cd backend/zord-outcome-engine && go run ./cmd/phase11-eval

e2e:
	cd backend/zord-outcome-engine && go run ./cmd/finance-e2e --profile realistic --limit 120

test:
	cd backend/zord-outcome-engine && go test ./internal/recon/... ./internal/recon/eval/... ./internal/close/... ./internal/dataset/... ./internal/observe/... ./handlers/... ./internal/poll/providers/razorpay/ ./cmd/finance-e2e/ ./testing/e2e/
	cd backend/zord-prompt-layer && go test ./agents/askzord/... ./agents/investigate/... ./agents/briefing/... ./agents/finance/... ./tools/...
