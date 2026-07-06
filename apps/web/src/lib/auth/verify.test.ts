import { test, expect } from "bun:test";
import { bearerToken } from "./verify";

function reqWith(auth: string | null) {
  return {
    headers: {
      get: (n: string) => (n.toLowerCase() === "authorization" ? auth : null),
    },
  };
}

test("bearerToken extracts the token from a Bearer header", () => {
  expect(bearerToken(reqWith("Bearer abc.def.ghi"))).toBe("abc.def.ghi");
});

test("bearerToken is case-insensitive on the scheme", () => {
  expect(bearerToken(reqWith("bearer tok123"))).toBe("tok123");
});

test("bearerToken returns null when the header is absent", () => {
  expect(bearerToken(reqWith(null))).toBeNull();
});

test("bearerToken returns null for a non-Bearer scheme", () => {
  expect(bearerToken(reqWith("Basic Zm9vOmJhcg=="))).toBeNull();
});

test("bearerToken returns null when the token is empty", () => {
  expect(bearerToken(reqWith("Bearer "))).toBeNull();
  expect(bearerToken(reqWith("Bearer"))).toBeNull();
});

test("bearerToken trims surrounding whitespace", () => {
  expect(bearerToken(reqWith("Bearer   tok  "))).toBe("tok");
});
