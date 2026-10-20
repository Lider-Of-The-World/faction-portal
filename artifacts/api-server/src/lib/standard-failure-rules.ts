export function standardFailureRequestKey(assignmentId: string): string {
  return "standard-assignment:" + assignmentId;
}

export function formatStandardFailureReason(title: string, detail: string): string {
  return "Норматив «" + title.trim() + "»: " + detail.trim();
}

export function createAutomaticStandardRejection(input: {
  version: number;
  comment: string;
  reason: string;
  submittedAt: Date;
}) {
  return {
    version: input.version,
    comment: input.comment,
    status: "rejected" as const,
    decisionReason: input.reason,
    submittedAt: input.submittedAt,
  };
}
