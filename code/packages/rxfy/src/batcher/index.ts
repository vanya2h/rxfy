import { Observable, OperatorFunction } from "rxjs";

type IBatch<T> = {
  next: T[];
  loaded: T[];
};

export function batcher<T>(waitTime: number): OperatorFunction<T, IBatch<T>> {
  return (source$) =>
    new Observable<IBatch<T>>((observer) => {
      let buffer: T[] = [];
      const loaded: T[] = [];
      let timerId: any = null;

      const emitBuffer = () => {
        if (buffer.length > 0) {
          observer.next({
            next: [...buffer],
            loaded: [...loaded],
          });
          loaded.push(...buffer);
          buffer = [];
        }
        clearTimeout(timerId);
        timerId = null;
      };

      const sub = source$.subscribe({
        next: (value) => {
          buffer.push(value);

          if (!timerId) {
            timerId = setTimeout(() => {
              emitBuffer();
            }, waitTime);
          }
        },
        error: (err) => observer.error(err),
        complete: () => {
          emitBuffer();
          observer.complete();
        },
      });

      return () => {
        clearTimeout(timerId);
        sub.unsubscribe();
      };
    });
}
