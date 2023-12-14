import { always, fromEmpty, noop } from './deps.ts';

export type Reject<E> = (err: E) => void;
export type Resolve<T> = (t: T) => void;
export type Cancel = () => void;
export type Computation<E, T> = (reject: Reject<E>, resolve: Resolve<T>) => Cancel;

export class Task<E, T> {
  /**
   * A Task that is always successful. Resolves to `t`.
   */
  public static succeed<E, T>(t: T): Task<E, T> {
    return new Task((_reject: Reject<E>, resolve: Resolve<T>) => {
      resolve(t);
      return noop;
    });
  }

  /**
   * A Task that always fails. Rejects with `err`.
   */
  public static fail<E, T>(err: E): Task<E, T> {
    return new Task((reject, _resolve) => {
      reject(err);
      return noop;
    });
  }

  /**
   * Converts a function that returns a Promise into a Task. Promise based tasks
   * can't be cancelled.
   */
  public static fromPromise<E, T>(fn: () => Promise<T>): Task<E, T> {
    return new Task((reject, resolve) => {
      fn().then(resolve, reject);
      return noop;
    });
  }

  /**
   * Creates a new task that will run a series of tasks in parallel. If any
   * of the tasks reject, then all other results are discarded. If all tasks
   * resolve, then the an array of results is returned.
   *
   * This is comparable to Promise.all
   *
   * Implementation is based on https://github.com/futurize/parallel-future
   */
  public static all<E, T>(ts: Array<Task<E, T>>): Task<E, T[]> {
    const length = ts.length;
    if (length === 0) {
      return Task.succeed([]);
    }

    return new Task((reject, resolve) => {
      let resolved = 0;
      const results: T[] = [];
      const cancels: Record<number, Cancel> = {};
      const resolveIdx = (idx: number) => (result: T) => {
        resolved = resolved + 1;
        results[idx] = result;
        cancels[idx] = noop;
        if (resolved === length) {
          resolve(results);
        }
      };
      for (let i = 0; i < length; i++) {
        cancels[i] = ts[i].fork(reject, resolveIdx(i));
      }
      return () => {
        Object.entries(cancels).forEach(([_, cancel]) => cancel());
      };
    });
  }

  /**
   * Creates a new Task from an Array of Tasks. When forked, all tasks are
   * forked in parallel. The first task to complete (either rejected or resolved)
   * is preserved. All other results are discarded.
   *
   * This could be used for a simple timeout mechanism. If the timeout rejects
   * before the fetch completes, you'll get a timeout error.
   *
   *     new Task([longFetchTask, timeoutTask])
   */
  public static race<E, T>(tasks: ReadonlyArray<Task<E, T>>): Task<E, T> {
    type Status = 'waiting' | 'resolved' | 'rejected';

    return fromEmpty(tasks).cata({
      Nothing: () => new Task<E, T>(always(noop)),
      Just: () =>
        new Task<E, T>((reject, resolve) => {
          let status: Status = 'waiting';
          const cancels: Array<Cancel> = [];

          const cancelAll = (): void => {
            let cancel: Cancel | undefined;
            while ((cancel = cancels.shift())) cancel();
          };

          const cancelAllIfNotStillWaiting = (): void => {
            switch (status) {
              case 'waiting':
                break;
              case 'rejected':
              case 'resolved':
                cancelAll();
                break;
            }
          };

          const resolveAndCancelAll = (t: T): void => {
            switch (status) {
              case 'waiting':
                status = 'resolved';
                resolve(t);
                cancelAll();
                break;
              case 'resolved':
              case 'rejected':
                break;
            }
          };
          const rejectAndCancelAll = (e: E): void => {
            switch (status) {
              case 'waiting':
                status = 'rejected';
                reject(e);
                cancelAll();
                break;
              case 'resolved':
              case 'rejected':
                break;
            }
          };

          const forkTaskIfStillWaiting = (task: Task<E, T>): void => {
            switch (status) {
              case 'waiting': {
                const cancel = task.fork(rejectAndCancelAll, resolveAndCancelAll);
                cancels.push(cancel);
                break;
              }
              case 'rejected':
              case 'resolved':
                break;
            }
          };

          for (let i = 0; i < tasks.length; i++) {
            forkTaskIfStillWaiting(tasks[i]);
          }

          cancelAllIfNotStillWaiting();

          return () => cancelAll();
        }),
    });
  }

  /**
   * `loop` returns a higher-order task forks the "inner" task until the inner task
   * succeeds. Retries forking the task on the interval number the same as using
   * setTimeout.
   *
   * The cancel function returned when the loop is forked can be called to cancel the
   * loop. Cancelling the loop causes the task to never resolve.
   */
  public static loop<E, T>(interval: number, task: Task<E, T>): Task<never, T> {
    return new Task<never, T>((_, resolve) => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let internalCancel: Cancel | undefined;
      const loop = () => {
        internalCancel = task.fork(
          () => {
            timeout = setTimeout(loop, interval);
          },
          (result) => resolve(result)
        );
      };

      loop();

      return () => {
        clearTimeout(timeout);
        internalCancel && internalCancel();
      };
    });
  }

  private fn: Computation<E, T>;

  constructor(computation: Computation<E, T>) {
    this.fn = computation;
  }

  /**
   * Run the task. If the task fails, the reject function is called, and passed
   * the error. If the task succeeds, then the resolve function is called with
   * the task result.
   *
   * The fork function also returns a Cancel function. Calling the cancel
   * function will abort the task, provided that the task actually supports
   * cancelling. `succeed` and `fail`, for example, return the cancel function,
   * but it is a No Op, since those tasks resolve immediately.
   */
  public fork(reject: Reject<E>, resolve: Resolve<T>): Cancel {
    return this.fn(reject, resolve);
  }

  /**
   * Run the task wrapped in a Promise and return the Promise. Once a task is
   * resolved as a Promise, the Promise API is used to interact with it.
   *
   * Each time `resolve` is called on a Task, a new Promise is generated. All
   * of the side-effects of executing the Task will fire.
   */
  public resolve(): Promise<T> {
    return new Promise((resolve, reject) => {
      this.fn(reject, resolve);
    });
  }

  /**
   * Execute a function in the context of a successful task
   */
  public map<A>(f: (t: T) => A): Task<E, A> {
    return new Task((reject, resolve) => {
      return this.fn(
        (err) => reject(err),
        (a: T) => resolve(f(a))
      );
    });
  }

  /**
   * An alias for `map`
   */
  public and<A>(f: (t: T) => A): Task<E, A> {
    return this.map(f);
  }

  /**
   * Execute a Task in the context of a successful task. Flatten the result.
   */
  public andThen<A>(f: (t: T) => Task<E, A>): Task<E, A> {
    return new Task((reject, resolve) => {
      let innerCancel: Cancel | undefined;

      const outerCancel = this.fn(
        (err) => reject(err),
        (a: T) => {
          innerCancel = f(a).fork(reject, resolve);
        }
      );

      return () => {
        if (innerCancel) {
          innerCancel();
        } else {
          outerCancel();
        }
      };
    });
  }

  /**
   * Execute a Promise in the context of a successful task, as though it were
   * a Task. Flatten the result and convert to a Task.
   *
   * In theory, it means that you could take a browser api like `fetch`, which
   * is promises all the way down, and chain it right into a normal task chain.
   *
   * For example:
   *
   *     Task.succeed('https://jsonplaceholder.typicode.com/posts/1')
   *       .andThenP(fetch)
   *       .andThenP(result => result.json())
   *       .andThen(obj => someDecoder.decodeAny(obj).cata(Err: Task.fail, Ok: Task.succeed))
   *       .fork(
   *         err => `You died: ${err}`,
   *         someThing => doSomethingAwesomeHereWithThis(someThing)
   *       )
   */
  public andThenP<A>(f: (t: T) => Promise<A>): Task<E, A> {
    return new Task((reject, resolve) => {
      return this.fn(
        (err) => reject(err),
        (a: T) => f(a).then(resolve, reject)
      );
    });
  }

  /**
   * Execute a Task in the context of a failed task. Flatten the result.
   */
  public orElse<X>(f: (err: E) => Task<X, T>): Task<X, T> {
    return new Task((reject, resolve) => {
      let innerCancel: Cancel | undefined;
      const outerCancel = this.fn(
        (x: E) => {
          innerCancel = f(x).fork(reject, resolve);
        },
        (t) => resolve(t)
      );
      return () => {
        if (innerCancel) {
          innerCancel();
        } else {
          outerCancel();
        }
      };
    });
  }

  /**
   * Execute a function in the context of a failed task.
   */
  public mapError<X>(f: (err: E) => X): Task<X, T> {
    return new Task((reject, resolve) => {
      return this.fn(
        (e: E) => reject(f(e)),
        (t) => resolve(t)
      );
    });
  }

  /**
   * Assign encapsulates a pattern of building up an object (or a scope) from
   * a series of Task results. Without `assign`, you would need to nest a series
   * of `andThen` calls to build a shared javascript scope if you needs to
   * combine results. That pattern can become indistinguishable from callback
   * hell. Using `assign`, you can flatten out your call chain, while maintaining
   * type safety.
   *
   * The idea and the base implementation came from this blog post:
   * https://medium.com/@dhruvrajvanshi/simulating-haskells-do-notation-in-typescript-e48a9501751c
   */
  public assign<K extends string, A>(
    k: K,
    other: Task<E, A> | ((t: T) => Task<E, A>)
  ): Task<E, T & { [k in K]: A }> {
    return this.andThen((t) => {
      const task = other instanceof Task ? other : other(t);
      return task.map<T & { [k in K]: A }>((a) => ({
        ...Object(t),
        [k.toString()]: a,
      }));
    });
  }

  /**
   * Inject a side-effectual function into a task call chain. Task themselves are the
   * appropriate way to handle side-effects that you care about, but sometimes you
   * may want to do an _fire-and-forget_ side effect. The most common example of this
   * is performing a logging the current value of a Task.
   *
   *     Task.succeed('hi')
   *       .do(v => console.log(v))
   *       .andThen(doSomethingWithGreeting)
   *
   * `do` will only run in the context of a successful task.
   */
  public do(fn: (a: T) => void): Task<E, T> {
    return this.map((v) => {
      fn(v);
      return v;
    });
  }

  /**
   * Inject a side-effectual function into a task call chain. Task themselves are the
   * appropriate way to handle side-effects that you care about, but sometimes you
   * may want to do an _fire-and-forget_ side effect. The most common example of this
   * is performing a logging the current value of a Task.
   *
   *     Task.fail('oops')
   *       .elseDo(v => console.log(v))
   *       .orElse(doSomethingWithError)
   *
   * `elseDo` will only run in the context of a failed task.
   */
  public elseDo(fn: (err: E) => void): Task<E, T> {
    return this.mapError((err) => {
      fn(err);
      return err;
    });
  }
}
