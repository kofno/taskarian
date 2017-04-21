declare type Reject<E> = (err: E) => void;
declare type Resolve<T> = (t: T) => void;
declare type Computation<E, T> = (reject: Reject<E>, resolve: Resolve<T>) => void;
declare class Task<E, T> {
    static succeed<E, T>(t: T): Task<E, T>;
    static fail<E, T>(err: E): Task<E, T>;
    private fn;
    constructor(computation: Computation<E, T>);
    fork(reject: Reject<E>, resolve: Resolve<T>): void;
    map<A>(f: (t: T) => A): Task<E, A>;
    andThen<A>(f: (t: T) => Task<E, A>): Task<E, A>;
    orElse<X>(f: (err: E) => Task<X, T>): Task<X, T>;
    mapError<X>(f: (err: E) => X): Task<X, T>;
}
export default Task;
export { Computation, Reject, Resolve };
