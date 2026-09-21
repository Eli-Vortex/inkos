/**
 * Request-ordering guard for the chapter buffer.
 *
 * Each autosave takes a monotonically increasing sequence number. When a
 * response arrives, it may only settle the buffer if it is still the newest
 * request — an earlier response that lands late must not overwrite newer text
 * (docs/03 §4 rule 4). Kept pure and DOM-free so this rule is tested directly
 * rather than through the hook.
 */

export interface SaveSequencer {
  /** Opens a new request and returns its sequence number. */
  begin(): number;
  /** True only while `seq` is still the newest opened request. */
  isCurrent(seq: number): boolean;
  /** The newest sequence number that has been opened. */
  current(): number;
}

export function createSaveSequencer(): SaveSequencer {
  let latest = 0;
  return {
    begin() {
      latest += 1;
      return latest;
    },
    isCurrent(seq) {
      // No request is current before the first begin(); sequence numbers start at 1.
      return latest > 0 && seq === latest;
    },
    current() {
      return latest;
    },
  };
}
