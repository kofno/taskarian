import { assert } from "https://deno.land/std@0.209.0/assert/assert.ts";
import { assertEquals } from "https://deno.land/std@0.209.0/assert/assert_equals.ts";
import { assertObjectMatch } from "https://deno.land/std@0.209.0/assert/assert_object_match.ts";
import { Reject, Resolve } from "./Task.ts";
import Task from './index.ts';

const cancellable = new Task<never, string>((_reject: Reject<never>, resolve: Resolve<string>) => {
  const x = setTimeout(() => resolve('Yo!'), 3000);
  return () => clearTimeout(x);
});

const assertFail = (message: string) => assert(false, message);
const assertPass = (message: string) => assert(true, message);

Deno.test('Task.succeed', () => {
  Task.succeed(42).fork(
    (_) => assertFail('Task 42 should always succeed'),
    (v) => assertPass(`Task always succeeds with ${v}`)
  );

});

Deno.test('Task.fail', () => {
  Task.fail('Ooops!').fork(
    (err) => assertPass(`Task always fails with ${err}`),
    (_) => assertFail('Task should always fail')
  );

});

Deno.test('Task.map', () => {
  Task.succeed(42)
    .map((v) => v - 12)
    .fork(
      (_) => assertFail('Task should always succeed'),
      (result) => assertPass(`Task succeeded with ${result}`)
    );

  Task.fail('Opps!')
    .map((_) => assertFail('map should never run'))
    .fork(
      (err) => assertPass(`Task errored with ${err}`),
      (_) => assertFail('Task should have failed')
    );


});

Deno.test('Task.andThen', () => {
  Task.succeed(42)
    .andThen((v) => Task.succeed(v - 12))
    .fork(
      (_) => assertFail('Task should have succeeded'),
      (v) => assertPass(`Task succeeded with ${v}`)
    );

  Task.succeed(42)
    .andThen((_) => Task.fail('Ooops!'))
    .fork(
      (err) => assertPass(`Task failed with ${err}`),
      (_) => assertFail('Task should have failed')
    );

  Task.fail('Oops!')
    .andThen((_) => Task.succeed(42))
    .fork(
      (err) => assertPass(`Task failed with ${err}`),
      (_) => assertFail('Task should have failed')
    );


});

Deno.test('Task.orElse', () => {
  Task.fail('Oops!')
    .orElse((e) => Task.fail(e.toUpperCase()))
    .fork(
      (err) => assertPass(`Task failed with ${err}`),
      (_) => assertFail('Task should have failed')
    );

  Task.fail('Oops!')
    .orElse((e) => Task.succeed(e))
    .fork(
      (_) => assertFail('Task should have become a success'),
      (v) => assertPass(`Task succeeded with ${v}`)
    );

  Task.succeed(42)
    .orElse((_) => Task.fail('WAT!?'))
    .fork(
      (_) => assertFail('Task should have succeeded'),
      (v) => assertPass(`Task succeeded with ${v}`)
    );


});

Deno.test('Task.mapError', () => {
  Task.fail('Oops!')
    .mapError((e) => e.toUpperCase())
    .fork(
      (err) => assertEquals('OOPS!', err, `Task failed with ${err}`),
      (_) => assertFail('Task should have failed')
    );


});

Deno.test('Cancel task', () => {
  const cancel = cancellable.fork(
    (err) => assertFail(`Task should not have failed; ${err}`),
    (v) => assertFail(`Task should never have finished; ${v}`)
  );
  cancel();


});

Deno.test('Cancel mapped task', () => {
  const task = cancellable.map((s) => s.toUpperCase());

  const cancel = task.fork(
    (err) => assertFail(`Task should not have failed; ${err}`),
    (s) => assertFail(`Task should never have finished; ${s}`)
  );
  cancel();


});

Deno.test('Cancel sequenced tasks', () => {
  const task = cancellable.andThen(
    (s) =>
      new Task((_, resolve) => {
        resolve(s.toUpperCase());
        // tslint:disable-next-line:no-empty
        return () => {};
      })
  );

  const cancel = task.fork(
    (err) => assertFail(`Task should not have failed; ${err}`),
    (s) => assertFail(`Task should never have finished; ${s}`)
  );
  cancel();


});

Deno.test('Cancel sequenced asynced tasks', () => {
  const task = cancellable.andThen(
    (s) =>
      new Task((_, resolve) => {
        const x = setTimeout(() => resolve(s.toUpperCase()), 3000);
        return () => clearTimeout(x);
      })
  );

  const cancel = task.fork(
    (err) => assertFail(`Task should not have failed; ${err}`),
    (s) => assertFail(`Task should never have finished; ${s}`)
  );
  cancel();


});

Deno.test('Promises', () => {
  Task.fromPromise(() => Promise.resolve(42))
    .map((n) => n + 8)
    .fork(
      (err) => assertFail(`Task should have succeeded: ${err}`),
      (n) => assert(n === 50, 'Promise converted to task')
    );

  Task.fromPromise(() => Promise.reject<number>('whoops!'))
    .map((n) => n + 8)
    .fork(
      (err) => assertPass(`Task handled a failed promise. Error: ${err}`),
      (n) => assertFail(`Task should not have succeeded: ${n}`)
    );

  Task.succeed(42)
    .andThenP((n) => Promise.resolve(n + 8))
    .fork(
      (err) => assertFail(`Promise should have resolved as a successful task: ${err}`),
      (n) => assert(50 === n, 'Promise chained as a task')
    );

  Task.succeed(42)
    .andThenP((_) => Promise.reject('Whoops!'))
    .fork(
      (err) => assertPass(`Promise failure chained as task. Error ${err}`),
      (n) => assertFail(`Promise chain should not have succeeded: ${n}`)
    );


});

Deno.test('Task.assign', () => {
  Task.succeed({})
    .assign('x', Task.succeed(42))
    .assign('y', Task.succeed(8))
    .assign('z', (s) => Task.succeed(String(s.x + s.y)))
    .fork(
      (m) => assertFail(`Should have succeeded: ${m}`),
      (value) => assertObjectMatch(value, { x: 42, y: 8, z: '50' })
    );
  Task.succeed({})
    .assign('x', Task.succeed(42))
    .assign('y', Task.fail<string, number>('Ooops!'))
    .assign('z', (s) => Task.succeed(String(s.x + s.y)))
    .fork(
      (m) => assertPass(`Expected a failure: ${m}`),
      (value) => assertFail(`Expected a failure: ${JSON.stringify(value)}`)
    );


});

Deno.test('Task.do', () => {
  Task.succeed(42)
    .do((_) => assertPass('This is the side-effect'))
    .fork(
      (e) => assertFail(`Should have succeeded: ${JSON.stringify(e)}`),
      (v) => assertEquals(42, v)
    );

  Task.fail('Oops!')
    .do((_) => assertFail('This is the side-effect'))
    .fork(
      (e) => assertPass(`Should fail: ${JSON.stringify(e)}`),
      (v) => assertFail(`Should NOT be ok: ${JSON.stringify(v)}`)
    );

});

Deno.test('Task.elseDo', () => {
  Task.succeed(42)
    .elseDo((_) => assertFail('This is the side-effect'))
    .fork(
      (e) => assertFail(`Should have succeeded: ${JSON.stringify(e)}`),
      (v) => assertEquals(42, v)
    );

  Task.fail('Oops!')
    .elseDo((_) => assertPass('This is the side-effect'))
    .fork(
      (e) => assertPass(`Should fail: ${JSON.stringify(e)}`),
      (v) => assertFail(`Should NOT be ok: ${JSON.stringify(v)}`)
    );

});

Deno.test('Task.resolve', async () => {
  await Task.succeed(42)
    .map((n) => n + 38)
    .resolve()
    .then((v) => assertEquals(80, v))
    .catch((err) => assertFail(`Should not have failed with ${err}`));
});
