import * as test from 'tape';
import Task from './../src/index';

test('Task.succeed', t => {
  Task.succeed(42).fork(
    _ => t.fail('Task 42 should always succeed'),
    v => t.pass(`Task always succeeds with ${v}`),
  );
  t.end();
});

test('Task.fail', t => {
  Task.fail('Ooops!').fork(
    err => t.pass(`Task always fails with ${err}`),
    _ => t.fail('Task should always fail'),
  );
  t.end();
});

test('Task.map', t => {
  Task.succeed(42).map(v => v - 12).fork(
    _ => t.fail('Task should always succeed'),
    result => t.pass(`Task succeeded with ${result}`),
  );

  Task.fail('Opps!').map(_ => t.fail('map should never run')).fork(
    err => t.pass(`Task errored with ${err}`),
    _ => t.fail('Task should have failed'),
  );

  t.end();
});

test('Task.andThen', t => {
  Task.succeed(42).andThen(v => Task.succeed(v - 12)).fork(
    err => t.fail('Task should have succeeded'),
    v => t.pass(`Task succeeded with ${v}`),
  );

  Task.succeed(42).andThen(v => Task.fail('Ooops!')).fork(
    err => t.pass(`Task failed with ${err}`),
    _ => t.fail('Task should have failed'),
  );

  Task.fail('Oops!').andThen(_ => Task.succeed(42)).fork(
    err => t.pass(`Task failed with ${err}`),
    _ => t.fail('Task should have failed'),
  );

  t.end();
});

test('Task.orElse', t => {
  Task.fail('Oops!').orElse(e => Task.fail(e.toUpperCase())).fork(
    err => t.pass(`Task failed with ${err}`),
    _ => t.fail('Task should have failed'),
  );

  Task.fail('Oops!').orElse(e => Task.succeed(e)).fork(
    err => t.fail('Task should have become a success'),
    v => t.pass(`Task succeeded with ${v}`),
  );

  Task.succeed(42).orElse(e => Task.fail('WAT!?')).fork(
    err => t.fail('Task should have succeeded'),
    v => t.pass(`Task succeeded with ${v}`),
  );

  t.end();
});

test('Task.mapError', t => {
  Task.fail('Oops!').mapError(e => e.toUpperCase()).fork(
    err => t.equal('OOPS!', err, `Task failed with ${err}`),
    _ => t.fail('Task should have failed'),
  );

  t.end();
});
