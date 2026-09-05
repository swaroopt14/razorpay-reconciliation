package services

import (
	"context"
	"sync"
	"testing"

	"github.com/IBM/sarama"
	"go.uber.org/zap"
)

// fakeConsumerGroupSession records the order MarkMessage was called in.
type fakeConsumerGroupSession struct {
	mu     sync.Mutex
	marked []int64
}

func (f *fakeConsumerGroupSession) Claims() map[string][]int32 { return nil }
func (f *fakeConsumerGroupSession) MemberID() string            { return "test" }
func (f *fakeConsumerGroupSession) GenerationID() int32          { return 1 }
func (f *fakeConsumerGroupSession) MarkOffset(string, int32, int64, string) {}
func (f *fakeConsumerGroupSession) Commit()                                 {}
func (f *fakeConsumerGroupSession) ResetOffset(string, int32, int64, string) {}
func (f *fakeConsumerGroupSession) Context() context.Context { return context.Background() }

func (f *fakeConsumerGroupSession) MarkMessage(msg *sarama.ConsumerMessage, _ string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.marked = append(f.marked, msg.Offset)
}

func (f *fakeConsumerGroupSession) markedOffsets() []int64 {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]int64, len(f.marked))
	copy(out, f.marked)
	return out
}

type fakeConsumerGroupClaim struct{}

func (fakeConsumerGroupClaim) Topic() string                           { return "test-topic" }
func (fakeConsumerGroupClaim) Partition() int32                        { return 0 }
func (fakeConsumerGroupClaim) InitialOffset() int64                    { return 0 }
func (fakeConsumerGroupClaim) HighWaterMarkOffset() int64              { return 0 }
func (fakeConsumerGroupClaim) Messages() <-chan *sarama.ConsumerMessage { return nil }

// TestCommitInOrder_NeverMarksAheadOfAnEarlierUnfinishedOffset proves the
// P1 6.1.4 fix: a faster worker finishing a later offset must not cause that
// offset to be committed before an earlier, still-in-flight offset. Marking
// out of order would let a crash silently skip the earlier message forever
// instead of redelivering it.
func TestCommitInOrder_NeverMarksAheadOfAnEarlierUnfinishedOffset(t *testing.T) {
	h := &consumerGroupHandler{log: zap.NewNop()}
	session := &fakeConsumerGroupSession{}
	claim := fakeConsumerGroupClaim{}

	events := make(chan claimEvent, 10)
	done := make(chan struct{})
	go h.commitInOrder(session, claim, events, done)

	// Offsets 1, 2, 3 are submitted in delivery order, as ConsumeClaim does.
	events <- claimEvent{offset: 1, completed: false}
	events <- claimEvent{offset: 2, completed: false}
	events <- claimEvent{offset: 3, completed: false}

	// Workers finish out of order: 3 first, then 2. Neither may be marked
	// yet — offset 1 hasn't finished.
	events <- claimEvent{offset: 3, completed: true}
	events <- claimEvent{offset: 2, completed: true}
	events <- claimEvent{offset: 1, completed: true}

	close(events)
	<-done

	got := session.markedOffsets()
	want := []int64{1, 2, 3}
	if len(got) != len(want) {
		t.Fatalf("marked offsets = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("marked offsets = %v, want %v (strictly increasing, no gaps)", got, want)
		}
	}
}

// TestCommitInOrder_BlockedOffsetHoldsBackEverythingAfterIt proves that a
// message which never completes (e.g. DB unavailable, ownership not taken)
// permanently withholds the commit for every offset submitted after it in
// the same partition — never just for itself — matching Kafka's single
// monotonic per-partition offset semantics.
func TestCommitInOrder_BlockedOffsetHoldsBackEverythingAfterIt(t *testing.T) {
	h := &consumerGroupHandler{log: zap.NewNop()}
	session := &fakeConsumerGroupSession{}
	claim := fakeConsumerGroupClaim{}

	events := make(chan claimEvent, 10)
	done := make(chan struct{})
	go h.commitInOrder(session, claim, events, done)

	events <- claimEvent{offset: 1, completed: false}
	events <- claimEvent{offset: 2, completed: false}
	events <- claimEvent{offset: 3, completed: false}

	// Offset 1 never sends a completion event (ownership not taken).
	events <- claimEvent{offset: 2, completed: true}
	events <- claimEvent{offset: 3, completed: true}

	close(events)
	<-done

	if got := session.markedOffsets(); len(got) != 0 {
		t.Fatalf("marked offsets = %v, want none — offset 1 never completed", got)
	}
}
