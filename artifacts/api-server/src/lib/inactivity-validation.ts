import { z } from "zod/v4";

export function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const dateOnly = z
  .string()
  .refine(isValidDateOnly, "Укажите корректную дату.");

export const createInactivityRequestSchema = z
  .object({
    startDate: dateOnly,
    endDate: dateOnly,
    reason: z.string().trim().min(3).max(2000),
  })
  .refine((input) => input.startDate <= input.endDate, {
    path: ["endDate"],
    message: "Дата окончания не может быть раньше даты начала.",
  });

export const reviewInactivityRequestSchema = z.object({
  status: z.enum(["approved", "rejected", "cancelled"]),
});

export const inactivityRequestParamsSchema = z.object({
  id: z.string().uuid(),
});
