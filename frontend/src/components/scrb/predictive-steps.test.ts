import { describe, expect, it } from "vitest";

import { classifySuggestionError } from "./predictive-steps";

describe("investigation suggestion errors", () => {
  it("distinguishes an intentional privacy-policy shutdown", () => {
    const result = classifySuggestionError(
      new Error("External AI is disabled by the backend privacy policy"),
    );
    expect(result.kind).toBe("disabled");
  });

  it("treats provider and network errors as retryable", () => {
    const result = classifySuggestionError(new Error("Provider timed out"));
    expect(result).toEqual({ kind: "unavailable", message: "Provider timed out" });
  });
});
