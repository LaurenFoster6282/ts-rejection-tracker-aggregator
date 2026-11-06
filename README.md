# ts-rejection-tracker-aggregator

Collects every unhandled promise rejection over a process lifetime into an array with timestamp, reason, and stack, while suppressing the default process exit.

```js
import { createTracker } from 'ts-rejection-tracker-aggregator';

const tracker = createTracker();

Promise.reject(new Error('something went wrong'));
Promise.reject('a plain string');

// Give the microtask queue a chance to run, then inspect.
setTimeout(() => {
  for (const record of tracker.rejections) {
    console.log(record.timestamp, record.stack ?? record.reason);
  }
  tracker.stop();
}, 0);
```

## Why this exists

Node's default behaviour on an unhandled rejection is to print a warning and, in modern versions, terminate the process. That is the right default for a server, but it is the wrong default when you are writing a test harness, a supervisor, or a diagnostic tool that wants to *observe* every rejection rather than die on the first one. This library installs a single `unhandledRejection` listener, records each event, and keeps the process alive.

The trade-off is deliberate: while a tracker is started, the process will not exit because of an unhandled rejection. If you want the old behaviour back, call `stop()` and let the next rejection kill the process as usual. The tracker does not re-emit or re-throw; it only records.

## API

### `new RejectionTracker(options?)`

Creates a tracker. It does not listen until you call `start()`.

- `options.clock` — a function returning a number, used for record timestamps. Defaults to `Date.now`. Pass a fake clock in tests so assertions never depend on wall-clock time.

### `tracker.start()`

Installs the `unhandledRejection` listener. Idempotent; returns the tracker.

### `tracker.stop()`

Removes the listener. Idempotent; returns the tracker.

### `tracker.started`

Boolean getter. `true` while the listener is installed.

### `tracker.rejections`

Getter returning a fresh copy of the collected records. Each record is `{ timestamp: number, reason: unknown, stack: string | null }`. The copy means mutating the returned array cannot corrupt internal state.

### `tracker.size`

Number of collected records.

### `tracker.clear()`

Empties the record array. Does not change whether the tracker is started.

### `createTracker(options?)`

Convenience factory: constructs a tracker and calls `start()` on it. Returns the tracker.

### `formatRecord(record)`

Renders one record as a single line. Error reasons become `"<timestamp> <Name>: <message>"`; anything else is rendered with `node:util.inspect`.

## The edge you will hit

`stack` is only populated when the rejection reason is an `Error` or an object with a string `stack` property. A rejection of `null`, a number, or a plain object without a stack has `stack: null`. That is intentional: fabricating a stack from the tracker's own call site would be misleading, and `null` is an honest signal that no stack was available. If you need a stack for every rejection, reject with `Error` instances.
