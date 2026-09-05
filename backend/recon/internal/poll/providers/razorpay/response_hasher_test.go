package razorpay

import (
	"net/url"
	"testing"
)

func TestHashRawResponseStable(t *testing.T) {
	a := HashRawResponse([]byte(`{"count":1}`))
	b := HashRawResponse([]byte(`{"count":1}`))
	if a != b || a == "" {
		t.Fatalf("hash not stable: %s %s", a, b)
	}
	if a[:7] != "sha256:" {
		t.Fatalf("missing prefix: %s", a)
	}
	if HashRawResponse([]byte(`{"count":2}`)) == a {
		t.Fatal("different bodies hashed equal")
	}
}

func TestHashRequestQuerySorted(t *testing.T) {
	q1 := url.Values{}
	q1.Set("to", "10")
	q1.Set("from", "1")
	q1.Set("count", "100")
	q2 := url.Values{}
	q2.Set("count", "100")
	q2.Set("from", "1")
	q2.Set("to", "10")
	if HashRequestQuery(q1) != HashRequestQuery(q2) {
		t.Fatal("query hash must ignore original insertion order")
	}
}
