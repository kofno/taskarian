export type Reject<E> = (err: E) => void;
export type Resolve<T> = (t: T) => void;
export type Cancel = () => void;
export type Computation<E, T> = (reject: Reject<E>, resolve: Resolve<T>) => Cancel;

// tslint:disable-next-line:no-empty
const noop = (): void => {};

class Task<E, T> {
  /**
   * A Task that is always successful. Resolves to `t`.
   */
  public static succeed<E, T>(t: T): Task<E, T> {
    return new Task((reject: Reject<E>, resolve: Resolve<T>) => {
      resolve(t);
      return noop;
    });
  }

  /**
   * A Task that always fails. Rejects with `err`.
   */
  public static fail<E, T>(err: E): Task<E, T> {
    return new Task((reject, resolve) => {
      reject(err);
      return noop;
    });
  }

  /**
   * Converts a function that returns a Promise into a Task.
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
      const resolveIdx = (idx: number) => (result: T) => {
        resolved = resolved + 1;
        results[idx] = result;
        if (resolved === length) {
          resolve(results);
        }
      };
      for (let i = 0; i < length; i++) {
        ts[i].fork(reject, resolveIdx(i));
      }
      return noop;
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
  public static race<T, E>(ts: Array<Task<E, T>>): Task<E, T> {
    if (ts.length === 0) {
      return new Task((reject, resolve) => noop);
    }

    return new Task((reject, resolve) => {
      let resolved = false;
      const cancels: Array<() => void> = [];

      const resolveIf = (result: T) => {
        if (!resolved) {
          resolved = true;
          resolve(result);
          cancels.forEach((fn) => fn());
        }
      };
      // tslint:disable-next-line:prefer-for-of
      for (let i = 0; i < ts.length; i++) {
        cancels.push(ts[i].fork(reject, resolveIf));
      }

      return () => {
        cancels.forEach((fn) => fn());
      };
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
      let timeout: any;
      const loop = () => {
        task.fork(
          () => {
            timeout = setTimeout(loop, interval);
          },
          (result) => resolve(result)
        );
      };

      loop();

      return () => {
        clearTimeout(timeout);
      };
    });
  }

  public static run<E, T>(gen: IterableIterator<Task<E, T>>): Task<E, T> {
    let result: IteratorResult<Task<E, T>> = gen.next();
    let returnValue: Task<E, T>;
    while (true) {
      if (result.done) {
        return result.value;
      }
      returnValue = new Task<E, T>((reject, resolve) => {
        result.value
          .do((v: any) => {
            result = gen.next(v);
          })
          .fork(
            (err: E) => reject(err),
            (v: T) => resolve(v)
          );
        return noop;
      });
    }
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
   * Execute a Task in the context of a successful task. Flatten the result.
   */
  public andThen<A>(f: (t: T) => Task<E, A>): Task<E, A> {
    return new Task((reject, resolve) => {
      return this.fn(
        (err) => reject(err),
        (a: T) => f(a).fork(reject, resolve)
      );
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
      return this.fn(
        (x: E) => f(x).fork(reject, resolve),
        (t) => resolve(t)
      );
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

export default Task;
