"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// tslint:disable-next-line:no-empty
var noop = function () { };
var Task = (function () {
    function Task(computation) {
        this.fn = computation;
    }
    /**
     * A Task that is always successful. Resolves to `t`.
     */
    Task.succeed = function (t) {
        return new Task(function (reject, resolve) {
            resolve(t);
            return noop;
        });
    };
    /**
     * A Task that always fails. Rejects with `err`.
     */
    Task.fail = function (err) {
        return new Task(function (reject, resolve) {
            reject(err);
            return noop;
        });
    };
    /**
     * Converts a function that returns a Promise into a Task.
     */
    Task.fromPromise = function (fn) {
        return new Task(function (reject, resolve) {
            fn().then(resolve, reject);
            return noop;
        });
    };
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
    Task.prototype.fork = function (reject, resolve) {
        return this.fn(reject, resolve);
    };
    /**
     * Execute a function in the context of a successful task
     */
    Task.prototype.map = function (f) {
        var _this = this;
        return new Task(function (reject, resolve) {
            return _this.fn(function (err) { return reject(err); }, function (a) { return resolve(f(a)); });
        });
    };
    /**
     * Execute a Task in the context of a successful task. Flatten the result.
     */
    Task.prototype.andThen = function (f) {
        var _this = this;
        return new Task(function (reject, resolve) {
            return _this.fn(function (err) { return reject(err); }, function (a) { return f(a).fork(reject, resolve); });
        });
    };
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
    Task.prototype.andThenP = function (f) {
        var _this = this;
        return new Task(function (reject, resolve) {
            return _this.fn(function (err) { return reject(err); }, function (a) { return f(a).then(resolve, reject); });
        });
    };
    /**
     * Execute a Task in the context of a failed task. Flatten the result.
     */
    Task.prototype.orElse = function (f) {
        var _this = this;
        return new Task(function (reject, resolve) {
            return _this.fn(function (x) { return f(x).fork(reject, resolve); }, function (t) { return resolve(t); });
        });
    };
    /**
     * Execute a function in the context of a failed task.
     */
    Task.prototype.mapError = function (f) {
        var _this = this;
        return new Task(function (reject, resolve) {
            return _this.fn(function (e) { return reject(f(e)); }, function (t) { return resolve(t); });
        });
    };
    return Task;
}());
exports.default = Task;
//# sourceMappingURL=Task.js.map