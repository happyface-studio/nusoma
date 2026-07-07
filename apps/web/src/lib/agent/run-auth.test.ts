import { test, expect } from "bun:test";
import { resolveRunIdentity } from "./run-auth";

test("user-owned project: only the verified owner may run", () => {
  const project = { ownerUserId: "u1" };
  expect(resolveRunIdentity(project, "u1", undefined)).toEqual({
    ok: true,
    userId: "u1",
  });
  // Another authed user, an unauthenticated caller, and a caller who merely
  // *claims* the owner's session are all rejected.
  expect(resolveRunIdentity(project, "u2", undefined).ok).toBe(false);
  expect(resolveRunIdentity(project, undefined, "s1").ok).toBe(false);
});

test("guest project: caller must present the matching session cookie", () => {
  const project = { projectSessionId: "s1" };
  expect(resolveRunIdentity(project, undefined, "s1")).toEqual({
    ok: true,
    userId: undefined,
    sessionId: "s1",
  });
  expect(resolveRunIdentity(project, undefined, "s2").ok).toBe(false);
  expect(resolveRunIdentity(project, undefined, undefined).ok).toBe(false);
});

test("signed-in user on their own guest project bills as the user", () => {
  const res = resolveRunIdentity({ projectSessionId: "s1" }, "u1", "s1");
  expect(res).toEqual({ ok: true, userId: "u1", sessionId: "s1" });
});

test("project with no owner of any kind fails closed", () => {
  expect(resolveRunIdentity({}, "u1", "s1").ok).toBe(false);
});
