import { useMutation, useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export type InactivityRequestStatus = "pending_review" | "approved" | "rejected";

export type InactivityRequest = {
  id: string;
  memberId: string;
  memberNickname: string;
  memberRank: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: InactivityRequestStatus;
  submittedAt: string;
  reviewedAt: string | null;
  reviewerId: string | null;
  reviewerNickname: string | null;
};

export type CreateInactivityRequestInput = {
  startDate: string;
  endDate: string;
  reason: string;
};

export const getInactivityRequestsQueryKey = () =>
  ["/api/inactivity-requests"] as const;

export function useInactivityRequests() {
  return useQuery({
    queryKey: getInactivityRequestsQueryKey(),
    queryFn: ({ signal }) =>
      customFetch<InactivityRequest[]>("/api/inactivity-requests", { signal }),
    refetchInterval: 30000,
  });
}

export function useCreateInactivityRequest() {
  return useMutation({
    mutationFn: (data: CreateInactivityRequestInput) =>
      customFetch<InactivityRequest>("/api/inactivity-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
  });
}

export function useReviewInactivityRequest() {
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "approved" | "rejected" }) =>
      customFetch<InactivityRequest>(
        "/api/inactivity-requests/" + encodeURIComponent(id) + "/review",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      ),
  });
}
