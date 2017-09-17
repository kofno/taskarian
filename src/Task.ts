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
   * Execute a function in the context of a successful task
   */
  public map<A>(f: (t: T) => A): Task<E, A> {
    return new Task((reject, resolve) => {
      return this.fn(err => reject(err), (a: T) => resolve(f(a)));
    });
  }

  /**
   * Execute a Task in the context of a successful task. Flatten the result.
   */
  public andThen<A>(f: (t: T) => Task<E, A>): Task<E, A> {
    return new Task((reject, resolve) => {
      return this.fn(err => reject(err), (a: T) => f(a).fork(reject, resolve));
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
      return this.fn(err => reject(err), (a: T) => f(a).then(resolve, reject));
    });
  }

  /**
   * Execute a Task in the context of a failed task. Flatten the result.
   */
  public orElse<X>(f: (err: E) => Task<X, T>): Task<X, T> {
    return new Task((reject, resolve) => {
      return this.fn((x: E) => f(x).fork(reject, resolve), t => resolve(t));
    });
  }

  /**
   * Execute a function in the context of a failed task.
   */
  public mapError<X>(f: (err: E) => X): Task<X, T> {
    return new Task((reject, resolve) => {
      return this.fn((e: E) => reject(f(e)), t => resolve(t));
    });
  }
}

export default Task;
