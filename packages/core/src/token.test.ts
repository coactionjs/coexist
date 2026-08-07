import { describe, expect, it } from "vitest";

import { token, tokenName } from "./index.js";

describe("injection tokens", () => {
  it("omits the description field when none was given", () => {
    const anonymous = token();
    const described = token<string>("Config");

    expect(Object.hasOwn(anonymous, "description")).toBe(false);
    expect(described.description).toBe("Config");
    expect(described.id.description).toBe("Config");
  });

  it("gives every token a distinct identity", () => {
    // Two tokens with the same description must not resolve to each other.
    expect(token("Config").id).not.toBe(token("Config").id);
  });

  it("names a string token as itself", () => {
    expect(tokenName("Logger")).toBe("Logger");
  });

  it("names a symbol token by its description, falling back to its tag", () => {
    expect(tokenName(Symbol("Logger"))).toBe("Logger");
    expect(tokenName(Symbol())).toBe("Symbol()");
  });

  it("names a class token by its class name", () => {
    class Counter {
      readonly count = 0;
    }

    expect(tokenName(Counter)).toBe("Counter");
  });

  it("names an anonymous class token readably", () => {
    // A minified or dynamically produced class can have an empty `name`, which
    // would otherwise produce an error message with a blank where the token is.
    const Anonymous = class {
      readonly count = 0;
    };
    Object.defineProperty(Anonymous, "name", { value: "" });

    expect(tokenName(Anonymous)).toBe("<anonymous class>");
  });

  it("names a token object by description, then by symbol description, then by tag", () => {
    expect(tokenName(token("Config"))).toBe("Config");

    const withoutDescription = token();

    // No `description` field, but the underlying symbol still carries none
    // either, so the readable symbol tag is the last resort.
    expect(tokenName(withoutDescription)).toBe("Symbol()");
    expect(tokenName({ id: Symbol("FromSymbol") })).toBe("FromSymbol");
  });
});
