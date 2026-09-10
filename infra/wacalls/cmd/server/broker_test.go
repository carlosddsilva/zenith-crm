package main

import "testing"

func ownerPtr(s string) *string { return &s }

func TestOwnerActiveCall(t *testing.T) {
	b := NewBroker()
	b.upsertCall(CallRecord{SessionID: "s1", CallID: "c1", Owner: ownerPtr("op-A"), Status: StatusConnected})
	b.upsertCall(CallRecord{SessionID: "s1", CallID: "c2", Owner: ownerPtr("op-B"), Status: StatusRinging})

	if got := b.ownerActiveCall("op-A"); got != "c1" {
		t.Fatalf("op-A should own c1, got %q", got)
	}
	if got := b.ownerActiveCall("op-C"); got != "" {
		t.Fatalf("op-C owns nothing, got %q", got)
	}
	if got := b.ownerActiveCall(""); got != "" {
		t.Fatalf("empty owner must return empty, got %q", got)
	}

	b.endCall("c1", "done")
	if got := b.ownerActiveCall("op-A"); got != "" {
		t.Fatalf("op-A's call ended, expected empty, got %q", got)
	}
}

func TestReleaseOwner(t *testing.T) {
	b := NewBroker()

	// Setup call c1
	b.upsertCall(CallRecord{SessionID: "s1", CallID: "c1", Status: StatusRinging})

	// TEST 1: Owner inicialmente nil. A faz setOwner. Resultado Owner=A.
	if ok := b.setOwner("c1", "op-A"); !ok {
		t.Fatalf("Test 1: setOwner failed")
	}
	if b.calls["c1"].Owner == nil || *b.calls["c1"].Owner != "op-A" {
		t.Fatalf("Test 1: expected op-A")
	}

	// TEST 2: Owner=A. A executa release. Resultado Owner=nil.
	if ok, _ := b.releaseOwner("c1", "op-A"); !ok {
		t.Fatalf("Test 2: releaseOwner failed")
	}
	if b.calls["c1"].Owner != nil {
		t.Fatalf("Test 2: expected nil")
	}

	// TEST 3: Owner=nil. A executa release novamente. Resultado sucesso/idempotente.
	if ok, _ := b.releaseOwner("c1", "op-A"); !ok {
		t.Fatalf("Test 3: idempotent release failed")
	}
	if b.calls["c1"].Owner != nil {
		t.Fatalf("Test 3: expected nil")
	}

	// TEST 4: Owner=A. B tenta release. Resultado conflito/failure.
	b.setOwner("c1", "op-A")
	if ok, err := b.releaseOwner("c1", "op-B"); ok || err != "claimed by another client" {
		t.Fatalf("Test 4: expected conflict failure, got ok=%v, err=%q", ok, err)
	}
	if b.calls["c1"].Owner == nil || *b.calls["c1"].Owner != "op-A" {
		t.Fatalf("Test 4: owner should remain op-A")
	}

	// TEST 5: Owner=A. A release. B accept/setOwner. Resultado Owner=B.
	b.releaseOwner("c1", "op-A")
	if ok := b.setOwner("c1", "op-B"); !ok {
		t.Fatalf("Test 5: setOwner for op-B failed")
	}
	if b.calls["c1"].Owner == nil || *b.calls["c1"].Owner != "op-B" {
		t.Fatalf("Test 5: expected op-B")
	}

	// TEST 6: Owner=B. A tenta release após B assumir. Resultado failure.
	if ok, _ := b.releaseOwner("c1", "op-A"); ok {
		t.Fatalf("Test 6: op-A should fail to release op-B's call")
	}
	if b.calls["c1"].Owner == nil || *b.calls["c1"].Owner != "op-B" {
		t.Fatalf("Test 6: owner should remain op-B")
	}

	// TEST 7: Release não marca call terminated/ended.
	b.releaseOwner("c1", "op-B")
	if b.calls["c1"].Status == StatusEnded {
		t.Fatalf("Test 7: release should not change status to ended")
	}

	// TEST 8: Release não remove call do registry.
	if _, exists := b.calls["c1"]; !exists {
		t.Fatalf("Test 8: release should not remove call from broker calls")
	}
}
