export declare type Reject<E> = (err: E) => void;
export declare type Resolve<T> = (t: T) => void;
export declare type Cancel = () => void;
export declare type Computation<E, T> = (reject: Reject<E>, resolve: Resolve<T>) => Cancel;
declare class Task<E, T> {
    /**
     * A Task that is always successful. Resolves to `t`.
     */
    static succeed<E, T>(t: T): Task<E, T>;
    /**
     * A Task that always fails. Rejects with `err`.
     */
    static fail<E, T>(err: E): Task<E, T>;
    /**
     * Converts a function that returns a Promise into a Task.
     */
    static fromPromise<E, T>(fn: () => Promise<T>): Task<E, T>;
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
    /**
     * Execute a function in the context of a successful task
     */
    map<A>(f: (t: T) => A): Task<E, A>;
    /**
     * Execute a Task in the context of a successful task. Flatten the result.
     */
    andThen<A>(f: (t: T) => Task<E, A>): Task<E, A>;
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
     *       .andThen(obj => someDecoder.decodeAny(obj))
     *       .fork(
     *         err => `You died: ${err}`,
     *         someThing => doSomethingAwesomeHereWithThis(someThing)
     *       )
     */
    andThenP<A>(f: (t: T) => Promise<A>): Task<E, A>;
    /**
     * Execute a Task in the context of a failed task. Flatten the result.
     */
    orElse<X>(f: (err: E) => Task<X, T>): Task<X, T>;
    /**
     * Execute a function in the context of a failed task.
     */
    mapError<X>(f: (err: E) => X): Task<X, T>;
}
export default Task;
