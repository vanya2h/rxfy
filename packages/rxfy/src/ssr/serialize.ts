import { createFulfilled, createRejected, type IWrapped, StatusEnum } from "../wrapped/wrapped.js";

export type SerializedError = { name: string; message: string };

export function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: "Error", message: String(error) };
}

export function rehydrateError(serialized: SerializedError): Error {
  const error = new Error(serialized.message);
  error.name = serialized.name;
  return error;
}

/** JSON for inline <script> embedding — escapes "<" so payloads cannot break out of the script tag. */
export function serializeForHtml(value: unknown): string {
  const u2028 = String.fromCharCode(0x2028);
  const u2029 = String.fromCharCode(0x2029);
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(new RegExp(u2028, "g"), "\\u2028")
    .replace(new RegExp(u2029, "g"), "\\u2029");
}

/** Wire form of a settled query — only terminal states cross the server/client boundary. */
export type SerializedWrapped<TValue = unknown> =
  | { type: StatusEnum.FULFILLED; value: TValue }
  | { type: StatusEnum.REJECTED; error: SerializedError };

/** In-memory IWrapped → wire form. Returns undefined for IDLE/PENDING (never serialized). */
export function serializeWrapped<TValue>(wrapped: IWrapped<TValue>): SerializedWrapped<TValue> | undefined {
  if (wrapped.type === StatusEnum.FULFILLED) return { type: StatusEnum.FULFILLED, value: wrapped.value };
  if (wrapped.type === StatusEnum.REJECTED) return { type: StatusEnum.REJECTED, error: serializeError(wrapped.error) };
  return undefined;
}

/** Wire form → in-memory IWrapped carrying a live Error. */
export function deserializeWrapped<TValue>(entry: SerializedWrapped<TValue>): IWrapped<TValue> {
  if (entry.type === StatusEnum.FULFILLED) return createFulfilled(entry.value);
  return createRejected(rehydrateError(entry.error));
}
