export enum StatusEnum {
  IDLE = "IDLE",
  PENDING = "PENDING",
  FULFILLED = "FULFILLED",
  REJECTED = "REJECTED",
}

export type IWrapped<Result, K extends StatusEnum = StatusEnum> = {
  [StatusEnum.IDLE]: {
    type: StatusEnum.IDLE;
  };
  [StatusEnum.PENDING]: {
    type: StatusEnum.PENDING;
  };
  [StatusEnum.FULFILLED]: {
    type: StatusEnum.FULFILLED;
    value: Result;
  };
  [StatusEnum.REJECTED]: {
    type: StatusEnum.REJECTED;
    error: unknown;
  };
}[K] & {
  type: K;
};

export function createIdle<Result>(): IWrapped<Result, StatusEnum.IDLE> {
  return {
    type: StatusEnum.IDLE,
  };
}

export function createPending<Result>(): IWrapped<Result, StatusEnum.PENDING> {
  return {
    type: StatusEnum.PENDING,
  };
}

export function createFulfilled<Result>(value: Result): IWrapped<Result, StatusEnum.FULFILLED> {
  return {
    type: StatusEnum.FULFILLED,
    value,
  };
}

export function createRejected<Result>(error: unknown): IWrapped<Result, StatusEnum.REJECTED> {
  return {
    type: StatusEnum.REJECTED,
    error,
  };
}
