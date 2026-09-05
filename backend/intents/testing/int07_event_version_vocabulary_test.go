package audittests

// INT-07 (remaining scope): "Normalize event/schema version vocabulary" --
// the canonical-value half (EventVersionV1/SchemaVersionV1 = "v1"/"v1",
// kept in sync with zord-relay/config.yaml's allow-list) was already
// implemented and verified separately. These tests cover the two
// still-open items from the audit's practical-implementation line:
//
//  1. "prohibit literals with static test" -- TestINT07_NoRawVersionLiterals
//     walks every production .go file in this module and fails if a raw
//     string literal is assigned directly to a SchemaVersion/EventVersion
//     field instead of the named constant.
//  2. cross-repo consistency -- TestINT07_LocalConstantsMatchSpec asserts
//     this repo's EventVersionV1/SchemaVersionV1 equal the checked-in,
//     cross-repo spec at backend/shared/zord-event-contract/spec.json,
//     which is also what "compatibility policy" (SPEC.md, same directory)
//     documents.
//
// zord-relay and zord-outcome-engine each have their own copy of these
// same two tests in testing/audittests, since the three repos are
// independent Go modules with no shared import path (see SPEC.md's "Why
// not a shared Go package").
//
// Run with: go test ./testing/... -run TestINT07 -v

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"zord-intent-engine/internal/services"
)

var int07VersionFieldNames = map[string]bool{
	"SchemaVersion": true,
	"EventVersion":  true,
}

// int07FindModuleRoot walks upward from the current working directory
// until it finds a go.mod, so this test works regardless of which
// directory `go test` happens to invoke it from.
func int07FindModuleRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed to get working directory: %v", err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatalf("could not find go.mod walking up from %s", dir)
		}
		dir = parent
	}
}

// int07FindRawVersionLiterals walks every non-test .go file under root
// (skipping .git, vendor, and any file named event_contract.go -- the one
// legitimate place these values are literal) and returns a file:line
// description for every raw string literal assigned to a
// SchemaVersion/EventVersion field or selector. Empty-string literals are
// not flagged: an empty string is a deliberate "this struct has no such
// field upstream" placeholder (see e.g. zord-relay's processor.go), not a
// hardcoded version value -- a separate, already-scoped-out architectural
// gap, not the literal-vs-constant drift this test guards against.
func int07FindRawVersionLiterals(t *testing.T, root string) []string {
	t.Helper()
	var violations []string

	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			switch d.Name() {
			case ".git", "vendor":
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		if filepath.Base(path) == "event_contract.go" {
			return nil
		}

		fset := token.NewFileSet()
		file, err := parser.ParseFile(fset, path, nil, 0)
		if err != nil {
			return fmt.Errorf("parsing %s: %w", path, err)
		}

		ast.Inspect(file, func(n ast.Node) bool {
			switch node := n.(type) {
			case *ast.KeyValueExpr:
				ident, ok := node.Key.(*ast.Ident)
				if !ok || !int07VersionFieldNames[ident.Name] {
					return true
				}
				if lit, ok := node.Value.(*ast.BasicLit); ok && lit.Kind == token.STRING && lit.Value != `""` {
					pos := fset.Position(node.Pos())
					violations = append(violations, fmt.Sprintf("%s:%d: %s: %s", path, pos.Line, ident.Name, lit.Value))
				}
			case *ast.AssignStmt:
				for i, lhs := range node.Lhs {
					sel, ok := lhs.(*ast.SelectorExpr)
					if !ok || !int07VersionFieldNames[sel.Sel.Name] || i >= len(node.Rhs) {
						continue
					}
					if lit, ok := node.Rhs[i].(*ast.BasicLit); ok && lit.Kind == token.STRING && lit.Value != `""` {
						pos := fset.Position(node.Pos())
						violations = append(violations, fmt.Sprintf("%s:%d: %s = %s", path, pos.Line, sel.Sel.Name, lit.Value))
					}
				}
			}
			return true
		})
		return nil
	})
	if err != nil {
		t.Fatalf("walking %s: %v", root, err)
	}
	return violations
}

// TestINT07_NoRawVersionLiterals is the "prohibit literals with static
// test" half of INT-07. Test files are intentionally excluded: fixtures
// legitimately use literal values, including deliberately-wrong ones, to
// exercise mismatch/edge-case branches.
func TestINT07_NoRawVersionLiterals(t *testing.T) {
	root := int07FindModuleRoot(t)
	violations := int07FindRawVersionLiterals(t, root)
	if len(violations) > 0 {
		t.Fatalf("found %d raw SchemaVersion/EventVersion string literal(s) -- use the local EventVersionV1/SchemaVersionV1 constant (internal/services/event_contract.go) instead:\n%s",
			len(violations), strings.Join(violations, "\n"))
	}
}

type int07ContractSpec struct {
	EventVersionV1  string `json:"event_version_v1"`
	SchemaVersionV1 string `json:"schema_version_v1"`
}

// TestINT07_LocalConstantsMatchSpec asserts this repo's EventVersionV1/
// SchemaVersionV1 equal the checked-in, cross-repo spec -- the mechanism
// that keeps three independent Go modules from silently drifting apart
// now that a real shared Go import isn't viable (see SPEC.md).
func TestINT07_LocalConstantsMatchSpec(t *testing.T) {
	data, err := os.ReadFile("../../shared/zord-event-contract/spec.json")
	if err != nil {
		t.Fatalf("failed to read shared spec.json: %v", err)
	}
	var spec int07ContractSpec
	if err := json.Unmarshal(data, &spec); err != nil {
		t.Fatalf("failed to parse shared spec.json: %v", err)
	}

	if services.EventVersionV1 != spec.EventVersionV1 {
		t.Fatalf("services.EventVersionV1 = %q, shared spec says %q", services.EventVersionV1, spec.EventVersionV1)
	}
	if services.SchemaVersionV1 != spec.SchemaVersionV1 {
		t.Fatalf("services.SchemaVersionV1 = %q, shared spec says %q", services.SchemaVersionV1, spec.SchemaVersionV1)
	}
	t.Logf("CONFIRMED: EventVersionV1=%q SchemaVersionV1=%q match the shared spec.", services.EventVersionV1, services.SchemaVersionV1)
}
