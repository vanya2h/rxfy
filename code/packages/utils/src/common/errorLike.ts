import { z } from "zod";

export const ErrorLikeSchema = z.object({
  name: z.string().default("UnknownError"),
  message: z.string(),
});

export type IErrorLike = z.infer<typeof ErrorLikeSchema>;

export function toErrorLike(maybeError: unknown): IErrorLike {
  const parsed = ErrorLikeSchema.safeParse(maybeError);
  if (parsed.success) {
    return parsed.data;
  }

  try {
    return new Error(JSON.stringify(maybeError));
  } catch {
    // fallback in case there's an error stringifying the maybeError
    // like with circular references for example.
    return new Error(String(maybeError));
  }
}
