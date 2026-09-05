package models

type ErrorEvent struct {
	TraceID    string
	ErrorCode  string
	ErrorMsg   string
	HttpStatus int
}
