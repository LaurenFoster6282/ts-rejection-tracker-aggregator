import test from 'node:test';
import assert from 'node:assert/strict';
import { RejectionTracker, createTracker, formatRecord } from '../src/core.js';

/**
 * Feed a rejection directly to the tracker's handler. This avoids relying on
 * Node's real unhandled-rejection scheduling, which is asynchronous and would
 * make the suite flaky. The handler is the same function Node would call.
 */
function emit(tracker, reason) {
  tracker._handler(reason, Promise.reject(reason).catch(() => {}));
}

test('records timestamp, reason and stack for an Error', () => {
  let now = 1000;
  const tracker = new RejectionTracker({ clock: () => now++ });
  const err = new Error('boom');
  emit(tracker, err);

  assert.equal(tracker.size, 1);
  const [record] = tracker.rejections;
  assert.equal(record.timestamp, 1000);
  assert.equal(record.reason, err);
  assert.equal(record.stack, err.stack);
  assert.equal(typeof record.stack, 'string');
});

test('records a null stack for non-Error reasons', () => {
  const tracker = new RejectionTracker({ clock: () => 5 });
  emit(tracker, 'plain string');
  emit(tracker, null);
  emit(tracker, { code: 42 });

  assert.equal(tracker.size, 3);
  for (const record of tracker.rejections) {
    assert.equal(record.stack, null);
  }
  assert.equal(tracker.rejections[0].reason, 'plain string');
  assert.equal(tracker.rejections[1].reason, null);
  assert.deepEqual(tracker.rejections[2].reason, { code: 42 });
});

test('uses a custom stack when the reason object provides one', () => {
  const tracker = new RejectionTracker({ clock: () => 7 });
  emit(tracker, { stack: 'synthetic-stack', message: 'nope' });
  assert.equal(tracker.rejections[0].stack, 'synthetic-stack');
});

test('ignores a non-string stack property', () => {
  const tracker = new RejectionTracker({ clock: () => 7 });
  emit(tracker, { stack: 123 });
  assert.equal(tracker.rejections[0].stack, null);
});

test('rejections getter returns a copy, not internal state', () => {
  const tracker = new RejectionTracker({ clock: () => 1 });
  emit(tracker, new Error('x'));
  const snapshot = tracker.rejections;
  snapshot.push({ timestamp: 0, reason: 'injected', stack: null });
  assert.equal(tracker.size, 1);
  assert.equal(tracker.rejections.length, 1);
});

test('clear removes records but keeps started state', () => {
  const tracker = new RejectionTracker({ clock: () => 1 });
  tracker.start();
  emit(tracker, new Error('x'));
  assert.equal(tracker.size, 1);
  tracker.clear();
  assert.equal(tracker.size, 0);
  assert.equal(tracker.started, true);
  tracker.stop();
});

test('start is idempotent and stop is idempotent', () => {
  const tracker = new RejectionTracker({ clock: () => 1 });
  tracker.start();
  tracker.start();
  assert.equal(tracker.started, true);
  tracker.stop();
  tracker.stop();
  assert.equal(tracker.started, false);
});

test('start returns this and stop returns this', () => {
  const tracker = new RejectionTracker({ clock: () => 1 });
  assert.equal(tracker.start(), tracker);
  assert.equal(tracker.stop(), tracker);
});

test('createTracker returns a started tracker', () => {
  const tracker = createTracker({ clock: () => 1 });
  assert.ok(tracker instanceof RejectionTracker);
  assert.equal(tracker.started, true);
  tracker.stop();
});

test('constructor rejects a non-function clock', () => {
  assert.throws(() => new RejectionTracker({ clock: 5 }), TypeError);
});

test('formatRecord renders Error reasons with name and message', () => {
  const line = formatRecord({
    timestamp: 42,
    reason: new TypeError('bad'),
    stack: 'ignored',
  });
  assert.equal(line, '42 TypeError: bad');
});

test('formatRecord renders non-Error reasons via inspect', () => {
  const line = formatRecord({ timestamp: 1, reason: { a: 1 }, stack: null });
  assert.equal(line, '1 { a: 1 }');
});

test('records are ordered by observation', () => {
  let now = 0;
  const tracker = new RejectionTracker({ clock: () => now++ });
  emit(tracker, new Error('first'));
  emit(tracker, new Error('second'));
  emit(tracker, new Error('third'));
  assert.deepEqual(
    tracker.rejections.map((r) => r.timestamp),
    [0, 1, 2],
  );
  assert.deepEqual(
    tracker.rejections.map((r) => r.reason.message),
    ['first', 'second', 'third'],
  );
});
