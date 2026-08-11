package audittests

// INT-07 (remaining scope): "Normalize event/schema version vocabulary" --
// see zord-intent-engine/testing/int07_event_version_vocabulary_test.go
// for the full background. This is zord-outcome-engine's copy of the same
// two tests: no raw version literals in production code, and this repo's
// local constants match the checked-in cross-repo spec at
// backend/shared/zord-event-contract/spec.json (SPEC.md documents the
// compatibility policy).
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

	"zord-outcome-engine/models"
)

var int07VersionFieldNames = map[string]bool{
	"SchemaVersion": true,
	"EventVersion":  true,
}

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

// int07FindRawVersionLiterals flags non-empty string literals only. An
// empty-string literal is a deliberate "this struct has no such field
// upstream" placeholder, not a hardcoded version value -- a separate,
// already-scoped-out architectural gap, not the literal-vs-constant drift
// this test guards against.
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
		t.Fatalf("found %d raw SchemaVersion/EventVersion string literal(s) -- use the local EventVersionV1/SchemaVersionV1 constant (models/event_contract.go) instead:\n%s",
			len(violations), strings.Join(violations, "\n"))
	}
}

type int07ContractSpec struct {
	EventVersionV1  string `json:"event_version_v1"`
	SchemaVersionV1 string `json:"schema_version_v1"`
}

// TestINT07_LocalConstantsMatchSpec asserts this repo's EventVersionV1/
// SchemaVersionV1 equal the checked-in, cross-repo spec.
func TestINT07_LocalConstantsMatchSpec(t *testing.T) {
	data, err := os.ReadFile("../../../shared/zord-event-contract/spec.json")
	if err != nil {
		t.Fatalf("failed to read shared spec.json: %v", err)
	}
	var spec int07ContractSpec
	if err := json.Unmarshal(data, &spec); err != nil {
		t.Fatalf("failed to parse shared spec.json: %v", err)
	}

	if models.EventVersionV1 != spec.EventVersionV1 {
		t.Fatalf("models.EventVersionV1 = %q, shared spec says %q", models.EventVersionV1, spec.EventVersionV1)
	}
	if models.SchemaVersionV1 != spec.SchemaVersionV1 {
		t.Fatalf("models.SchemaVersionV1 = %q, shared spec says %q", models.SchemaVersionV1, spec.SchemaVersionV1)
	}
	t.Logf("CONFIRMED: EventVersionV1=%q SchemaVersionV1=%q match the shared spec.", models.EventVersionV1, models.SchemaVersionV1)
}
