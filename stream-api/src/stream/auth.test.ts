import { beforeEach, describe, expect, it } from "vitest";
import { StreamApiError } from "./errors";
import { validateAllowedPackage } from "./auth";

describe("validateAllowedPackage", () => {
  it("allows each approved package", () => {
    expect(validateAllowedPackage("com.midnight.anime")).toBe("com.midnight.anime");
    expect(validateAllowedPackage("com.midnight.anime.tv")).toBe("com.midnight.anime.tv");
  });

  it("rejects missing and unapproved package names", () => {
    expect(() => validateAllowedPackage()).toThrow(StreamApiError);
    expect(() => validateAllowedPackage("com.example.copy")).toThrow(StreamApiError);
  });
});
