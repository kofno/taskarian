import { assert, assertEquals } from "https://deno.land/std@0.209.0/assert/mod.ts";
import { Task } from "./mod.ts";

export function timer(ms: number): Task<never, void> {
  return new Task((_, resolve) => {
    const id = setTimeout(resolve, ms);
    return () => clearTimeout(id);
  });
}

Deno.test(function cancelTaskTest() {
  let cancelled = false;
  const task = new Task((_: unknown, __: unknown) => () => {
    cancelled = true;
  });
  const cancel = task.andThen((_) => Task.succeed(2)).fork(
    () => assert(false, "Should always succeed"),
    () => {}
  );
  cancel();
  assertEquals(cancelled, true, "Expected this to be cancelled");
});

Deno.test(function anotherCancelTaskTest() {
  let cancelled = false;
  const task = new Task((_: unknown, __: unknown) => () => {
    cancelled = true;
  });
  const cancel = Task.succeed(2).andThen((_) => task).fork(
    () => assert(false, "Should always succeed"),
    () => {}
  );
  cancel();
  assertEquals(cancelled, true, "Expected this to be cancelled");
});

