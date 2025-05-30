type ArrayElement<A> = A extends readonly (infer T)[] ? T : never;

type Includes<A, V> = A extends readonly any[] ? (V extends ArrayElement<A> ? true : false) : false;

type ReadOnlyArr = readonly string[];

type DictionaryValue = ReadOnlyArr[] | string;

type StringDictionaryData<T extends string, K extends DictionaryValue> = Readonly<Record<T, K>>;

type ToStaticDictionary<T extends StringDictionaryData<string, any>> =
  T extends StringDictionaryData<infer C, any>
    ? {
        [J in C]: T[J] extends ReadOnlyArr ? ArrayElement<T[J]> : T[J];
      }
    : never;

type GetDictionaryValues<T extends StringDictionaryData<any, any>> =
  T extends Record<any, infer U> ? (U extends ReadOnlyArr ? ArrayElement<U> : U) : never;

// Type to get only non-array keys
type GetOnlyNonArrayKeys<T extends StringDictionaryData<any, any>> = {
  [K in keyof T]: T[K] extends ReadOnlyArr ? never : K;
}[keyof T];

type GetCorrespondingDictionaryKey<T extends StringDictionaryData<any, any>, V> = {
  [K in keyof T]: T[K] extends ReadOnlyArr ? (Includes<T[K], V> extends true ? K : never) : T[K] extends V ? K : never;
}[keyof T];

export class StringDictionary<T extends StringDictionaryData<any, any>> {
  readonly static: ToStaticDictionary<T>;
  readonly keys: (keyof ToStaticDictionary<T>)[];

  static fromArray = <
    T extends ReadOnlyArr,
    J extends ReadOnlyArr,
    D extends Record<ArrayElement<T>, ArrayElement<J> | readonly ArrayElement<J>[]>,
  >(
    keys: T,
    _values: J,
    dictionary: D,
  ) => {
    keys.forEach((x) => {
      // Runtime check
      if (!dictionary[x as ArrayElement<T>]) throw new Error("Dictionary must cover all cases");
    });
    return new StringDictionary(dictionary);
  };

  constructor(dictionary: T) {
    this.static = toStaticDictionary(dictionary);
    this.keys = Object.keys(this.static);
  }

  getValue = <J extends GetOnlyNonArrayKeys<T>>(key: J): T[J] => this.static[key];

  getKeyByValue = <J extends GetDictionaryValues<T>>(testVal: J): GetCorrespondingDictionaryKey<T, J> => {
    const safe = this.getKeyByValueSafe(testVal);
    if (!safe) throw new Error(`Can't find corresponding value for ${testVal}`);
    return safe;
  };

  getKeyByValueSafe = <J extends GetDictionaryValues<T>>(
    testVal: J,
  ): GetCorrespondingDictionaryKey<T, J> | undefined => {
    let result: GetCorrespondingDictionaryKey<T, J> | undefined;
    this.keys.forEach((x) => {
      const val = this.static[x];
      if (typeof val === "string" && val === testVal) result = x as GetCorrespondingDictionaryKey<T, J>;
      if (Array.isArray(val) && val.includes(testVal)) result = x as GetCorrespondingDictionaryKey<T, J>;
    });
    return result;
  };
}

function toStaticDictionary<T extends StringDictionaryData<any, any>>(dictionary: T): ToStaticDictionary<T> {
  return dictionary as ToStaticDictionary<T>;
}
