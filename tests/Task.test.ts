import * as test from 'tape';
import Task, { Resolve } from './../src/index';

const cancellable = new Task((reject, resolve: Resolve<string>) => {
  const x = setTimeout(() => resolve('Yo!'), 3000);
  return () => clearTimeout(x);
});

test('Task.succeed', (t) => {
  Task.succeed(42).fork(
    (_) => t.fail('Task 42 should always succeed'),
    (v) => t.pass(`Task always succeeds with ${v}`)
  );
  t.end();
});

test('Task.fail', (t) => {
  Task.fail('Ooops!').fork(
    (err) => t.pass(`Task always fails with ${err}`),
    (_) => t.fail('Task should always fail')
  );
  t.end();
});

test('Task.map', (t) => {
  Task.succeed(42)
    .map((v) => v - 12)
    .fork(
      (_) => t.fail('Task should always succeed'),
      (result) => t.pass(`Task succeeded with ${result}`)
    );

  Task.fail('Opps!')
    .map((_) => t.fail('map should never run'))
    .fork(
      (err) => t.pass(`Task errored with ${err}`),
      (_) => t.fail('Task should have failed')
    );

  t.end();
});

test('Task.andThen', (t) => {
  Task.succeed(42)
    .andThen((v) => Task.succeed(v - 12))
    .fork(
      (err) => t.fail('Task should have succeeded'),
      (v) => t.pass(`Task succeeded with ${v}`)
    );

  Task.succeed(42)
    .andThen((v) => Task.fail('Ooops!'))
    .fork(
      (err) => t.pass(`Task failed with ${err}`),
      (_) => t.fail('Task should have failed')
    );

  Task.fail('Oops!')
    .andThen((_) => Task.succeed(42))
    .fork(
      (err) => t.pass(`Task failed with ${err}`),
      (_) => t.fail('Task should have failed')
    );

  t.end();
});

test('Task.orElse', (t) => {
  Task.fail('Oops!')
    .orElse((e) => Task.fail(e.toUpperCase()))
    .fork(
      (err) => t.pass(`Task failed with ${err}`),
      (_) => t.fail('Task should have failed')
    );

  Task.fail('Oops!')
    .orElse((e) => Task.succeed(e))
    .fork(
      (err) => t.fail('Task should have become a success'),
      (v) => t.pass(`Task succeeded with ${v}`)
    );

  Task.succeed(42)
    .orElse((e) => Task.fail('WAT!?'))
    .fork(
      (err) => t.fail('Task should have succeeded'),
      (v) => t.pass(`Task succeeded with ${v}`)
    );

  t.end();
});

test('Task.mapError', (t) => {
  Task.fail('Oops!')
    .mapError((e) => e.toUpperCase())
    .fork(
      (err) => t.equal('OOPS!', err, `Task failed with ${err}`),
      (_) => t.fail('Task should have failed')
    );

  t.end();
});

test('Cancel task', (t) => {
  const cancel = cancellable.fork(
    (err) => t.fail(`Task should not have failed; ${err}`),
    (v) => t.fail(`Task should never have finished; ${v}`)
  );
  cancel();

  t.end();
});

test('Cancel mapped task', (t) => {
  const task = cancellable.map((s) => s.toUpperCase());

  const cancel = task.fork(
    (err) => t.fail(`Task should not have failed; ${err}`),
    (s) => t.fail(`Task should never have finished; ${s}`)
  );
  cancel();

  t.end();
});

test('Cancel sequenced tasks', (t) => {
  const task = cancellable.andThen(
    (s) =>
      new Task((reject, resolve) => {
        resolve(s.toUpperCase());
        // tslint:disable-next-line:no-empty
        return () => {};
      })
  );

  const cancel = task.fork(
    (err) => t.fail(`Task should not have failed; ${err}`),
    (s) => t.fail(`Task should never have finished; ${s}`)
  );
  cancel();

  t.end();
});

test('Cancel sequenced asynced tasks', (t) => {
  const task = cancellable.andThen(
    (s) =>
      new Task((reject, resolve) => {
        const x = setTimeout(() => resolve(s.toUpperCase()), 3000);
        return () => clearTimeout(x);
      })
  );

  const cancel = task.fork(
    (err) => t.fail(`Task should not have failed; ${err}`),
    (s) => t.fail(`Task should never have finished; ${s}`)
  );
  cancel();

  t.end();
});

test('Promises', async (t) => {
  Task.fromPromise(() => Promise.resolve(42))
    .map((n) => n + 8)
    .fork(
      (err) => t.fail(`Task should have succeeded: ${err}`),
      (n) => t.assert(n === 50, 'Promise converted to task')
    );

  Task.fromPromise(() => Promise.reject<number>('whoops!'))
    .map((n) => n + 8)
    .fork(
      (err) => t.pass(`Task handled a failed promise. Error: ${err}`),
      (n) => t.fail(`Task should not have succeeded: ${n}`)
    );

  Task.succeed(42)
    .andThenP((n) => Promise.resolve(n + 8))
    .fork(
      (err) => t.fail(`Promise should have resolved as a successful task: ${err}`),
      (n) => t.assert(50 === n, 'Promise chained as a task')
    );

  Task.succeed(42)
    .andThenP((n) => Promise.reject('Whoops!'))
    .fork(
      (err) => t.pass(`Promise failure chained as task. Error ${err}`),
      (n) => t.fail(`Promise chain should not have succeeded: ${n}`)
    );

  t.end();
});

test('Task.assign', (t) => {
  Task.succeed({})
    .assign('x', Task.succeed(42))
    .assign('y', Task.succeed(8))
    .assign('z', (s) => Task.succeed(String(s.x + s.y)))
    .fork(
      (m) => t.fail(`Should have succeeded: ${m}`),
      (value) => t.deepEqual(value, { x: 42, y: 8, z: '50' })
    );
  Task.succeed({})
    .assign('x', Task.succeed(42))
    .assign('y', Task.fail<string, number>('Ooops!'))
    .assign('z', (s) => Task.succeed(String(s.x + s.y)))
    .fork(
      (m) => t.pass(`Expected a failure: ${m}`),
      (value) => t.fail(`Expected a failure: ${JSON.stringify(value)}`)
    );

  t.end();
});

test('Task.do', (t) => {
  Task.succeed(42)
    .do((v) => t.pass('This is the side-effect'))
    .fork(
      (e) => t.fail(`Should have succeeded: ${JSON.stringify(e)}`),
      (v) => t.equal(42, v)
    );

  Task.fail('Oops!')
    .do((v) => t.fail('This is the side-effect'))
    .fork(
      (e) => t.pass(`Should fail: ${JSON.stringify(e)}`),
      (v) => t.fail(`Should NOT be ok: ${JSON.stringify(v)}`)
    );
  t.end();
});

test('Task.elseDo', (t) => {
  Task.succeed(42)
    .elseDo((v) => t.fail('This is the side-effect'))
    .fork(
      (e) => t.fail(`Should have succeeded: ${JSON.stringify(e)}`),
      (v) => t.equal(42, v)
    );

  Task.fail('Oops!')
    .elseDo((v) => t.pass('This is the side-effect'))
    .fork(
      (e) => t.pass(`Should fail: ${JSON.stringify(e)}`),
      (v) => t.fail(`Should NOT be ok: ${JSON.stringify(v)}`)
    );
  t.end();
});

test('Task.resolve', async (t) => {
  await Task.succeed(42)
    .map((n) => n + 38)
    .resolve()
    .then((v) => t.equal(80, v))
    .catch((err) => t.fail(`Should not have failed with ${err}`));

  t.end();
});
