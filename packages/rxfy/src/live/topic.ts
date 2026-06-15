import type { ModelDescriptor } from "../model/model.js";

declare const brand: unique symbol;
export type Topic = `${string}:${string}` & { readonly [brand]: "Topic" };

const topic = (name: string, id: string): Topic => `${name}:${id}` as Topic;

export function modelTopic<T>(model: ModelDescriptor<T>, id: string): Topic {
  if (!model.name) {
    throw new Error("rxfy: modelTopic requires a named model — pass { name: \"...\" } to createModel");
  }
  return topic(model.name, id);
}
