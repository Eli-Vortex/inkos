import type { Finding, FindingContext, FindingProducer, FindingSource } from "./types.js";

/**
 * Where review sources announce themselves.
 *
 * The rule this enforces is positive: a review source *is* a `FindingProducer`.
 * That is checked by the compiler at the call site, so a new source cannot be
 * added by inventing a new result type — it either implements the interface or it
 * does not compile. A blacklist of forbidden interface names would have been the
 * easy alternative, and the wrong one: it would flag legitimate internal DTOs and
 * push unrelated domains into a model that does not fit them.
 *
 * Registration is also where name collisions are caught. Two producers claiming
 * the same source, or an adapter claiming an id an existing skill already owns,
 * must fail loudly rather than quietly shadow the host's own writing policy.
 */

export class ProducerRegistrationError extends Error {
  readonly code = "FINDING_PRODUCER_REGISTRATION";
  constructor(message: string) {
    super(message);
    this.name = "ProducerRegistrationError";
  }
}

export class FindingProducerRegistry {
  private readonly producers = new Map<FindingSource, FindingProducer>();

  register(producer: FindingProducer): void {
    const existing = this.producers.get(producer.source);
    if (existing) {
      throw new ProducerRegistrationError(
        `A producer for source "${producer.source}" is already registered. `
        + "Choose a distinct source rather than replacing one silently.",
      );
    }
    this.producers.set(producer.source, producer);
  }

  has(source: FindingSource): boolean {
    return this.producers.has(source);
  }

  sources(): readonly FindingSource[] {
    return [...this.producers.keys()].sort();
  }

  /** Run every registered producer; a failing producer contributes its own
   *  findings, and a throwing one is surfaced rather than swallowed. */
  async collect(context: FindingContext): Promise<readonly Finding[]> {
    const results = await Promise.all(
      [...this.producers.values()].map((producer) => producer.produce(context)),
    );
    return results.flat();
  }
}

export interface SkillIdConflict {
  readonly incomingId: string;
  readonly existingId: string;
  readonly owner: "builtin" | "project" | "imported";
}

/**
 * Check adapter/skill ids against the ids already owned by the host.
 *
 * Copying a same-named file over a built-in skill would silently replace the
 * host's own writing policy, so a collision is an error to resolve — either by
 * renaming the incoming entry or by declaring an explicit override — never a
 * merge that happens to win.
 */
export function findSkillIdConflicts(params: {
  readonly incomingIds: readonly string[];
  readonly existingIds: readonly string[];
}): readonly SkillIdConflict[] {
  const existing = new Set(params.existingIds.map((id) => id.trim().toLowerCase()));
  const conflicts: SkillIdConflict[] = [];
  for (const raw of params.incomingIds) {
    const id = raw.trim().toLowerCase();
    if (existing.has(id)) {
      conflicts.push({ incomingId: raw, existingId: id, owner: "builtin" });
    }
  }
  return conflicts;
}

export function assertNoSkillIdConflicts(params: {
  readonly incomingIds: readonly string[];
  readonly existingIds: readonly string[];
  readonly adapterLabel: string;
}): void {
  const conflicts = findSkillIdConflicts(params);
  if (conflicts.length === 0) return;
  const names = conflicts.map((conflict) => conflict.incomingId).join(", ");
  throw new ProducerRegistrationError(
    `Adapter "${params.adapterLabel}" would shadow existing skill ids: ${names}. `
    + "Rename the incoming entries or declare an explicit override.",
  );
}
