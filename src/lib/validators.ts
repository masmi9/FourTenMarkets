import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  name: z.string().max(100).optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const depositSchema = z.object({
  amount: z
    .number()
    .positive("Amount must be positive")
    .max(50000, "Maximum deposit is $50,000"),
});

export const withdrawSchema = z.object({
  amount: z
    .number()
    .positive("Amount must be positive")
    .max(50000, "Maximum withdrawal is $50,000"),
});

export const betRequestSchema = z.object({
  selectionId: z.string().min(1, "Selection is required"),
  requestedOdds: z
    .number()
    .int("Odds must be an integer")
    .refine(
      (v) => (v >= 100 || v <= -100),
      "Odds must be >= +100 or <= -100 (American format)"
    ),
  stake: z
    .number()
    .positive("Stake must be positive")
    .max(5000, "Maximum single bet stake is $5,000"),
});

export const betConfirmSchema = z.object({
  requestId: z.string().min(1, "Request ID is required"),
});

export const settleEventSchema = z.object({
  eventId: z.string().min(1, "Event ID is required"),
  results: z.record(z.string(), z.enum(["WON", "LOST", "VOID"])),
});
