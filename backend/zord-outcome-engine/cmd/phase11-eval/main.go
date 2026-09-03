package main

import (
	"encoding/json"
	"fmt"
	"os"

	"zord-outcome-engine/internal/recon/eval"
)

func main() {
	cases := eval.BuildCorpus()
	preds := eval.Run(cases)
	rep := eval.Evaluate(cases, preds)
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	if err := enc.Encode(rep); err != nil {
		fmt.Fprintf(os.Stderr, "encode: %v\n", err)
		os.Exit(1)
	}
	fmt.Fprintf(os.Stderr, "Phase 11  n=%d  regression=%.3f  P=%.3f R=%.3f F1=%.3f  false_match=%.3f  capture=%.3f\n",
		rep.N, rep.Regression.Accuracy, rep.Quality.Precision, rep.Quality.Recall, rep.Quality.F1,
		rep.Quality.FalseMatchRate, rep.Quality.ExceptionCaptureRate)
	if rep.Regression.Accuracy != 1 {
		os.Exit(2)
	}
}
