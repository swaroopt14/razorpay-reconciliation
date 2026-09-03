package askzord

import (
	"embed"
	"path"
	"strings"
)

//go:embed testdata/knowledge/*.md
var knowledgeFS embed.FS

type knowledgeDoc struct {
	Title   string
	Version string
	Text    string
	Keys    []string
}

func loadKnowledge() []knowledgeDoc {
	entries, err := knowledgeFS.ReadDir("testdata/knowledge")
	if err != nil {
		return nil
	}
	var out []knowledgeDoc
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		raw, err := knowledgeFS.ReadFile(path.Join("testdata/knowledge", e.Name()))
		if err != nil {
			continue
		}
		out = append(out, parseKnowledge(string(raw)))
	}
	return out
}

func parseKnowledge(raw string) knowledgeDoc {
	d := knowledgeDoc{Version: "v1"}
	body := raw
	if strings.HasPrefix(raw, "---") {
		parts := strings.SplitN(raw, "---", 3)
		if len(parts) == 3 {
			for _, line := range strings.Split(parts[1], "\n") {
				k, v, ok := strings.Cut(strings.TrimSpace(line), ":")
				if !ok {
					continue
				}
				v = strings.TrimSpace(v)
				switch strings.TrimSpace(k) {
				case "title":
					d.Title = v
				case "version":
					d.Version = v
				}
			}
			body = strings.TrimSpace(parts[2])
		}
	}
	d.Text = body
	d.Keys = strings.Fields(strings.ToLower(d.Title + " " + body))
	return d
}

func SearchKnowledge(question string) []KnowledgeHit {
	q := strings.ToLower(question)
	type scored struct {
		hit   KnowledgeHit
		score int
	}
	var ranked []scored
	for _, d := range loadKnowledge() {
		score := 0
		title := strings.ToLower(d.Title)
		body := strings.ToLower(d.Title + " " + d.Text)
		for _, w := range []string{"settlement", "bank", "credit", "matched", "reconciled", "failed", "payout", "sla", "exception", "loss", "movement"} {
			if strings.Contains(q, w) && strings.Contains(body, w) {
				score++
			}
			if strings.Contains(q, w) && strings.Contains(title, w) {
				score += 3
			}
		}
		if strings.Contains(q, "difference") && strings.Contains(title, "vs") {
			score += 8
		}
		if strings.Contains(q, "sla") && strings.Contains(title, "sla") {
			score += 8
		}
		if score > 0 {
			ranked = append(ranked, scored{KnowledgeHit{Title: d.Title, Version: d.Version, Text: d.Text}, score})
		}
	}
	for i := 0; i < len(ranked); i++ {
		for j := i + 1; j < len(ranked); j++ {
			if ranked[j].score > ranked[i].score {
				ranked[i], ranked[j] = ranked[j], ranked[i]
			}
		}
	}
	var hits []KnowledgeHit
	for i, r := range ranked {
		if i == 3 {
			break
		}
		hits = append(hits, r.hit)
	}
	return hits
}
