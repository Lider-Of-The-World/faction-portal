import { useMutation, useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export type DisciplineType = "warning" | "reprimand";
export type DisciplineStatus = "active" | "revoked" | "converted";
export type AuditCategory =
  | "accounts"
  | "events"
  | "standards"
  | "tasks"
  | "discipline";

export type DisciplineRecord = {
  id: string;
  memberId: string;
  memberNickname: string;
  type: DisciplineType;
  status: DisciplineStatus;
  reason: string;
  points: number;
  evidencePath: string | null;
  issuedById: string;
  issuedByNickname: string;
  createdAt: string;
  revokedAt: string | null;
  revokedById: string | null;
  revokedByNickname: string | null;
  revocationReason: string | null;
  convertedAt: string | null;
  convertedById: string | null;
  convertedByNickname: string | null;
  conversionReason: string | null;
  convertedToId: string | null;
  maxLevelReachedAt: string | null;
};

export type DisciplineIssueInput = {
  memberId: string;
  type: DisciplineType;
  reason: string;
  requestId: string;
  evidencePath?: string | null;
};

export type AuditLogEntry = {
  id: string;
  actorId: string;
  actorNickname: string;
  category: AuditCategory;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  targetMemberId: string | null;
  targetMemberNickname: string | null;
  reason: string | null;
  details: Record<string, unknown>;
  createdAt: string;
};

export type AuditLogFilters = {
  category?: AuditCategory;
  actorId?: string;
  memberId?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
};

export const getDisciplineRecordsQueryKey = () =>
  ["/api/discipline"] as const;
export const getAuditLogRecordsQueryKey = (filters: AuditLogFilters) =>
  ["/api/audit-logs", filters] as const;

export function useDisciplineRecords() {
  return useQuery({
    queryKey: getDisciplineRecordsQueryKey(),
    queryFn: ({ signal }) =>
      customFetch<DisciplineRecord[]>("/api/discipline", { signal }),
  });
}

export function useIssueDiscipline() {
  return useMutation({
    mutationFn: (data: DisciplineIssueInput) =>
      customFetch<DisciplineRecord>("/api/discipline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
  });
}

export function useRevokeDiscipline() {
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      customFetch<DisciplineRecord>(`/api/discipline/${id}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }),
  });
}

export function useAuditLogRecords(filters: AuditLogFilters) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  const serialized = query.toString();
  const suffix = serialized ? `?${serialized}` : "";
  return useQuery({
    queryKey: getAuditLogRecordsQueryKey(filters),
    queryFn: ({ signal }) =>
      customFetch<AuditLogEntry[]>(`/api/audit-logs${suffix}`, { signal }),
  });
}
