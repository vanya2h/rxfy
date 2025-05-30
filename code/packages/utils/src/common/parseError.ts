import { objectKeys } from "../typeUtils/objectKeys.js";
import { toErrorLike } from "./errorLike.js";

export function getErrorName(error: unknown): string {
  try {
    return toErrorLike(error).name;
  } catch {
    // This is the last resort if everything else fails
    return "UnknownError";
  }
}

export function getErrorMessage(error: unknown): string {
  try {
    const { name, message } = toErrorLike(error);

    const predefinedError = objectKeys(errorsDictionary).find((x) => name.includes(x));
    if (predefinedError) {
      return errorsDictionary[predefinedError];
    }
    return message;
  } catch {
    // This is the last resort if everything else fails
    return "A parsing error occurred while processing the error message.";
  }
}

const errorsDictionary = {
  NetworkError: "There was a network problem. Please try again.",
  TimeoutError: "The request timed out. Please try again later.",
};

/**
 * @deprecated please use getErrorMessage instead
 */
export const parseError = getErrorMessage;
