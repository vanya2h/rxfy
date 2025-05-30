export type CustomErrorOptions<T> = {
  /**
   * Primary error message
   */
  message: string;
  /**
   * Provide specific name to error for better debugging experience
   * make at as unique as possible
   */
  name?: string;
  /**
   * Subsequent error can be used as original error that
   * was thrown
   */
  cause?: unknown;
} & (T extends void
  ? Record<never, never>
  : {
      /**
       * Additional data that can be passed with the error
       * useful for debugging and logging
       */
      data: T;
    });

export class CustomError<T = void> extends Error {
  /**
   * Subsequent error can be used as original error that
   * was thrown
   */
  readonly cause: unknown;
  readonly data: T;

  constructor(options: CustomErrorOptions<T>) {
    super(options.message);
    this.cause = options.cause;
    this.data = (options as any).data; // Safe cast because we ensure data is required when T is not void

    // set error name as constructor name, make it not enumerable to keep native Error behavior
    // see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/new.target#new.target_in_constructors
    // see https://github.com/adriengibrat/ts-custom-error/issues/30
    Object.defineProperty(this, "name", {
      value: options.name || (new.target as any).name,
      enumerable: false,
      configurable: true,
    });
  }
}
