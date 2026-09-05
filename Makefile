.PHONY: demo seed close eval test

demo: close

seed:
	cd backend/recon && go run ./cmd/finance-seed --truncate --profile realistic --limit 120

close:
	cd backend/recon && go run ./cmd/finance-close --profile realistic --limit 120

eval:
	cd backend/recon && go run ./cmd/phase11-eval

e2e:
	cd backend/recon && go run ./cmd/finance-e2e --profile realistic --limit 120

test:
	cd backend/recon && go test ./internal/recon/... ./internal/recon/eval/... ./internal/close/... ./internal/dataset/... ./internal/observe/... ./handlers/... ./internal/poll/providers/razorpay/ ./cmd/finance-e2e/ ./testing/e2e/
	cd backend/agents && go test ./agents/askzord/... ./agents/investigate/... ./agents/briefing/... ./agents/finance/... ./tools/...
