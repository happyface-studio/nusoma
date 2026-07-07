import { test, expect, beforeEach } from "bun:test";
import { createFrameCoalescer } from "./performance";

// Fake requestAnimationFrame: collect callbacks, flush manually per "frame".
let frameCallbacks: FrameRequestCallback[] = [];
let nextId = 1;

beforeEach(() => {
  frameCallbacks = [];
  nextId = 1;
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
    frameCallbacks.push(cb);
    return nextId++;
  };
  globalThis.cancelAnimationFrame = () => {
    frameCallbacks = [];
  };
});

const flushFrame = () => {
  const cbs = frameCallbacks;
  frameCallbacks = [];
  cbs.forEach((cb) => cb(0));
};

test("many queued updates commit once per frame with the latest value", () => {
  const commits: number[] = [];
  const q = createFrameCoalescer<number>((v) => commits.push(v));
  q.sync(0);

  q.queue(1);
  q.queue(2);
  q.queue(3);
  expect(commits).toEqual([]); // nothing until the frame fires

  flushFrame();
  expect(commits).toEqual([3]); // one commit, latest value wins
});

test("current() reflects pending value mid-frame, synced value otherwise", () => {
  const q = createFrameCoalescer<number>(() => {});
  q.sync(10);
  expect(q.current()).toBe(10);

  q.queue(20);
  expect(q.current()).toBe(20); // handlers build on the pending value

  flushFrame();
  q.sync(20); // commit landed in state, render synced it back
  expect(q.current()).toBe(20);
});

test("cancel() drops the pending commit", () => {
  const commits: number[] = [];
  const q = createFrameCoalescer<number>((v) => commits.push(v));
  q.sync(0);
  q.queue(1);
  q.cancel();
  flushFrame();
  expect(commits).toEqual([]);
});
