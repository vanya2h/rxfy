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
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
