
export type Reject<E> = (err: E) => void;
export type Resolve<T> = (t: T) => void;
export type Cancel = () => void;
export type Computation<E, T> = (reject: Reject<E>, resolve: Resolve<T>) => Cancel;

// tslint:disable-next-line:no-empty
const noop = (): void => { };

class Task<E, T> {

  public static succeed<E, T>(t: T): Task<E, T> {
    return new Task((reject: Reject<E>, resolve: Resolve<T>) => {
      resolve(t);
      return noop;
    });
  }

  public static fail<E, T>(err: E): Task<E, T> {
    return new Task((reject, resolve) => {
      reject(err);
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

  public map<A>(f: (t: T) => A): Task<E, A> {
    return new Task((reject, resolve) => {
      return this.fn(err => reject(err), (a: T) => resolve(f(a)));
    });
  }

  public andThen<A>(f: (t: T) => Task<E, A>): Task<E, A> {
    return new Task((reject, resolve) => {
      return this.fn(err => reject(err), (a: T) => f(a).fork(reject, resolve));
    });
  }

  public orElse<X>(f: (err: E) => Task<X, T>): Task<X, T> {
    return new Task((reject, resolve) => {
      return this.fn((x: E) => f(x).fork(reject, resolve), t => resolve(t));
    });
  }

  public mapError<X>(f: (err: E) => X): Task<X, T> {
    return new Task((reject, resolve) => {
      return this.fn((e: E) => reject(f(e)), t => resolve(t));
    });
  }

}

export default Task;
