import { StringDictionary } from "./dictionary.js";

describe("StringDictionary", () => {
  const keys = ["single", "multiple"] as const;
  const values = ["value", "one", "two", "three"] as const;
  const sampleDictionary = {
    single: "value",
    multiple: ["one", "two", "three"],
  } as const;

  describe("fromArray", () => {
    it("creates an instance correctly", () => {
      const dict = StringDictionary.fromArray(keys, values, sampleDictionary);
      expect(dict).toBeInstanceOf(StringDictionary);
    });

    it("throws error for uncovered cases", () => {
      expect(() => {
        StringDictionary.fromArray(["single"], ["one"], {} as any);
      }).toThrow("Dictionary must cover all cases");
    });
  });

  describe("getValue", () => {
    const dict = new StringDictionary(sampleDictionary);

    it("returns correct value for a key", () => {
      expect(dict.getValue("single")).toBe("value");
    });
  });

  describe("getKeyByValue", () => {
    const dict = new StringDictionary(sampleDictionary);

    it("returns correct key for a value", () => {
      expect(dict.getKeyByValue("value")).toBe("single");
    });

    it("returns correct key for array value", () => {
      expect(dict.getKeyByValue("one")).toBe("multiple");
    });

    it("throws error for non-existing value", () => {
      expect(() => {
        dict.getKeyByValue("non-existing" as any);
      }).toThrow();
    });
  });
});
