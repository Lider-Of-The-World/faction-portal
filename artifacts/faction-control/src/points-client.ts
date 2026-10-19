import { useMutation, useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export type PointBalance = { memberId: string; points: number };
export type PointAdjustmentInput = { memberId: string; amount: number; reason: string };
export type DeductPointsInput = PointAdjustmentInput;
export type AwardPointsInput = PointAdjustmentInput;

export const getPointsQueryKey = () => ["/api/points"] as const;

export function usePoints() {
  return useQuery({
    queryKey: getPointsQueryKey(),
    queryFn: ({ signal }) => customFetch<PointBalance[]>("/api/points", { signal }),
    refetchInterval: 60000,
  });
}

export function useDeductPoints() {
  return useMutation({
    mutationFn: ({ memberId, ...data }: DeductPointsInput) =>
      customFetch<PointBalance>("/api/points/" + encodeURIComponent(memberId) + "/deduct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
  });
}

export function useAwardPoints() {
  return useMutation({
    mutationFn: ({ memberId, ...data }: AwardPointsInput) =>
      customFetch<PointBalance>("/api/points/" + encodeURIComponent(memberId) + "/award", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
  });
}
