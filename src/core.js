import { inspect } from 'node:util';

/**
 * A collected unhandled rejection record.
 *
 * `stack` is captured from the rejection reason when it is an Error (or has a
 * string `stack` property). For non-Error reasons we store the inspected value
 * so the array is always useful for debugging.
 *
 * @typedef {{ timestamp: number, reason: unknown, stack: string | null }} RejectionRecord
 */

/**
 * Normalise a rejection reason into a stack string.
 *
 * We only trust a `stack` property when it is a string; objects with a
 * non-string stack (a surprisingly common accident) would otherwise poison the
 * record with a non-string value.
 *
 * @param {unknown} reason
 * @returns {string | null}
 */
function extractStack(reason) {
  if (reason instanceof Error && typeof reason.stack === 'string') {
    return reason.stack;
  }
  if (
    reason !== null &&
    typeof reason === 'object' &&
    typeof reason.stack === 'string'
  ) {
    return reason.stack;
  }
  return null;
}

/**
 * Aggregates unhandled promise rejections for the lifetime of a process.
 *
 * By default Node terminates the process on an unhandled rejection. This class
 * installs a listener that records the rejection and keeps the process alive,
 * which is what you want when you are collecting diagnostics rather than
 * crashing.
 *
 * The clock is injectable so tests are deterministic and never depend on
 * wall-clock time.
 */
export class RejectionTracker {
  /**
   * @param {{ clock?: () => number }} [options]
   */
  constructor(options = {}) {
    const { clock = Date.now } = options;
    if (typeof clock !== 'function') {
      throw new TypeError('clock must be a function returning a number');
    }
    /** @type {() => number} */
    this._clock = clock;
    /** @type {RejectionRecord[]} */
    this._rejections = [];
    /** @type {boolean} */
    this._started = false;
    /** @type {(reason: unknown, promise: Promise<unknown>) => void} */
    this._handler = (reason) => {
      this._rejections.push({
        timestamp: this._clock(),
        reason,
        stack: extractStack(reason),
      });
    };
  }

  /**
   * Begin collecting rejections. Idempotent: calling start twice does not
   * install a second listener, which would double-count every rejection.
   *
   * @returns {this}
   */
  start() {
    if (!this._started) {
      process.on('unhandledRejection', this._handler);
      this._started = true;
    }
    return this;
  }

  /**
   * Stop collecting and remove the listener. Idempotent.
   *
   * @returns {this}
   */
  stop() {
    if (this._started) {
      process.removeListener('unhandledRejection', this._handler);
      this._started = false;
    }
    return this;
  }

  /**
   * Whether the tracker currently has an active listener.
   *
   * @returns {boolean}
   */
  get started() {
    return this._started;
  }

  /**
   * A copy of the collected records, in the order they were observed.
   *
   * A copy is returned so callers cannot mutate internal state by accident.
   *
   * @returns {RejectionRecord[]}
   */
  get rejections() {
    return this._rejections.slice();
  }

  /**
   * Number of collected records.
   *
   * @returns {number}
   */
  get size() {
    return this._rejections.length;
  }

  /**
   * Remove all collected records. Does not change whether the tracker is
   * started; that is a separate concern.
   *
   * @returns {this}
   */
  clear() {
    this._rejections.length = 0;
    return this;
  }
}

/**
 * Convenience factory that constructs and starts a tracker in one call.
 *
 * @param {{ clock?: () => number }} [options]
 * @returns {RejectionTracker}
 */
export function createTracker(options) {
  return new RejectionTracker(options).start();
}

/**
 * Render a record as a single human-readable line.
 *
 * Kept here (rather than in index.js) so the formatting logic is testable
 * without importing the package entry point.
 *
 * @param {RejectionRecord} record
 * @returns {string}
 */
export function formatRecord(record) {
  const reasonText =
    record.reason instanceof Error
      ? `${record.reason.name}: ${record.reason.message}`
      : inspect(record.reason, { depth: 2 });
  return `${record.timestamp} ${reasonText}`;
}
