package handler

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"zord-edge/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func bankStatementRouter(h *Handler, tenant uuid.UUID) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("tenant_id", tenant)
		c.Next()
	})
	r.POST("/v1/bank-statements", h.PostBankStatement)
	r.GET("/v1/bank-statements/:ingest_id", h.GetBankStatement)
	return r
}

func postBankCSV(t *testing.T, r *gin.Engine, csv string, account string) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	fw, err := w.CreateFormFile("file", "stmt.csv")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := fw.Write([]byte(csv)); err != nil {
		t.Fatal(err)
	}
	if err := w.WriteField("account_id", account); err != nil {
		t.Fatal(err)
	}
	_ = w.Close()
	req := httptest.NewRequest(http.MethodPost, "/v1/bank-statements", &body)
	req.Header.Set("Content-Type", w.FormDataContentType())
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func TestPostBankStatementAcceptedAndDuplicate(t *testing.T) {
	tenant := uuid.Must(uuid.NewV7())
	store := services.NewMemoryBankIngestStore()
	h := &Handler{BankIngest: store}
	r := bankStatementRouter(h, tenant)
	csv := "value_date,credit,currency,utr\n2026-09-01,9728,INR,UTR123\n"

	first := postBankCSV(t, r, csv, "acc-1")
	if first.Code != http.StatusAccepted {
		t.Fatalf("first code=%d body=%s", first.Code, first.Body.String())
	}
	if !bytes.Contains(first.Body.Bytes(), []byte(`"ACCEPTED"`)) {
		t.Fatalf("body=%s", first.Body.String())
	}
	if len(store.Outbox) != 1 {
		t.Fatalf("outbox=%d", len(store.Outbox))
	}
	if store.Outbox[0].AccountID != "acc-1" || store.Outbox[0].StorageURI == "" {
		t.Fatalf("%+v", store.Outbox[0])
	}

	second := postBankCSV(t, r, csv, "acc-1")
	if second.Code != http.StatusAccepted {
		t.Fatalf("second code=%d body=%s", second.Code, second.Body.String())
	}
	if !bytes.Contains(second.Body.Bytes(), []byte(`"DUPLICATE"`)) {
		t.Fatalf("body=%s", second.Body.String())
	}
	if len(store.Outbox) != 1 {
		t.Fatalf("duplicate must not emit second outbox, got %d", len(store.Outbox))
	}
	if len(store.Runs) != 2 {
		t.Fatalf("runs=%d", len(store.Runs))
	}
}

func TestGetBankStatement(t *testing.T) {
	tenant := uuid.Must(uuid.NewV7())
	store := services.NewMemoryBankIngestStore()
	h := &Handler{BankIngest: store}
	r := bankStatementRouter(h, tenant)
	csv := "value_date,credit,currency\n2026-09-01,100,INR\n"
	created := postBankCSV(t, r, csv, "acc")
	if created.Code != http.StatusAccepted {
		t.Fatalf("code=%d", created.Code)
	}
	id := store.Runs[0].IngestID.String()
	req := httptest.NewRequest(http.MethodGet, "/v1/bank-statements/"+id, nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body.String())
	}
}
