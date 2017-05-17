export declare type Reject<E> = (err: E) => void;
export declare type Resolve<T> = (t: T) => void;
export declare type Cancel = () => void;
export declare type Computation<E, T> = (reject: Reject<E>, resolve: Resolve<T>) => Cancel;
declare class Task<E, T> {
    static succeed<E, T>(t: T): Task<E, T>;
    static fail<E, T>(err: E): Task<E, T>;
    private fn;
    constructor(computation: Computation<E, T>);
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
    fork(reject: Reject<E>, resolve: Resolve<T>): Cancel;
    map<A>(f: (t: T) => A): Task<E, A>;
    andThen<A>(f: (t: T) => Task<E, A>): Task<E, A>;
    orElse<X>(f: (err: E) => Task<X, T>): Task<X, T>;
    mapError<X>(f: (err: E) => X): Task<X, T>;
}
export default Task;
