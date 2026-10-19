export function standardFailureRequestKey(assignmentId: string): string {
  return "standard-assignment:" + assignmentId;
}

export function formatStandardFailureReason(title: string, detail: string): string {
  return "Норматив «" + title.trim() + "»: " + detail.trim();
}
