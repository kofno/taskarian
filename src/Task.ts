
type Reject<E> = (err: E) => void;
type Resolve<T> = (t: T) => void;
type Computation<E, T> = (reject: Reject<E>, resolve: Resolve<T>) => void;

class Task<E, T> {

  public static succeed<E, T>(t: T): Task<E, T> {
    return new Task((reject, resolve) => {
      return resolve(t);
    });
  }

  public static fail<E, T>(err: E): Task<E, T> {
    return new Task((reject, resolve) => {
      return reject(err);
    });
  }

  private fn: Computation<E, T>;

  constructor(computation: Computation<E, T>) {
    this.fn = computation;
  }

  public fork(reject: Reject<E>, resolve: Resolve<T>): void {
    return this.fn(reject, resolve);
  }

  public map<A>(f: (t: T) => A): Task<E, A> {
    return new Task((reject, resolve) => {
      return this.fn(err => reject(err), a => resolve(f(a)));
    });
  }

  public andThen<A>(f: (t: T) => Task<E, A>): Task<E, A> {
    return new Task((reject, resolve) => {
      return this.fn(err => reject(err), a => f(a).fork(reject, resolve));
    });
  }

  public orElse<X>(f: (err: E) => Task<X, T>): Task<X, T> {
    return new Task((reject, resolve) => {
      return this.fn(x => f(x).fork(reject, resolve), t => resolve(t));
    });
  }

  public mapError<X>(f: (err: E) => X): Task<X, T> {
    return new Task((reject, resolve) => {
      return this.fn(e => reject(f(e)), t => resolve(t));
    });
  }

}

export default Task;
export { Computation, Reject, Resolve };
