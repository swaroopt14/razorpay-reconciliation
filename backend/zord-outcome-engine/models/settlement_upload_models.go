package models

// SettlementUploadResponse is what the API returns after a file is uploaded and parsed.
type SettlementUploadResponse struct {
	JobID          string `json:"job_id"`
	Status         string    `json:"status"`
	RowCountParsed int       `json:"row_count_parsed"`
	RowCountFailed int       `json:"row_count_failed"`
	Message        string    `json:"message"`
}
