export {
  FINDING_SOURCES,
  FindingSourceSchema,
  FindingSeveritySchema,
  FindingScopeSchema,
  FindingStatusSchema,
  FindingEvidenceSchema,
  FindingWaiverSchema,
  FindingSchema,
  defaultBlockingPolicy,
  defaultWaivablePolicy,
  blockingFindings,
  unverifiedFindings,
  waiverBasisHash,
  isExpiredWaiver,
} from "./types.js";
export type {
  Finding,
  FindingSource,
  FindingSeverity,
  FindingScope,
  FindingStatus,
  FindingEvidence,
  FindingWaiver,
  FindingContext,
  FindingProducer,
} from "./types.js";

export {
  LEGACY_POLICY_VERSION,
  parseLegacySeverity,
  parseLegacyMessage,
  findingId,
  auditIssueToFinding,
  projectLegacyFindings,
  isWaivable,
} from "./legacy.js";
export type { LegacyAuditSource } from "./legacy.js";

export {
  projectChapterFindings,
  countBlockingFindings,
  countUnverifiedFindings,
} from "./projection.js";
