"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// tslint:disable-next-line:no-empty
var noop = function () { };
var Task = (function () {
    function Task(computation) {
        this.fn = computation;
    }
    Task.succeed = function (t) {
        return new Task(function (reject, resolve) {
            resolve(t);
            return noop;
        });
    };
    Task.fail = function (err) {
        return new Task(function (reject, resolve) {
            reject(err);
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
    Task.prototype.map = function (f) {
        var _this = this;
        return new Task(function (reject, resolve) {
            return _this.fn(function (err) { return reject(err); }, function (a) { return resolve(f(a)); });
        });
    };
    Task.prototype.andThen = function (f) {
        var _this = this;
        return new Task(function (reject, resolve) {
            return _this.fn(function (err) { return reject(err); }, function (a) { return f(a).fork(reject, resolve); });
        });
    };
    Task.prototype.orElse = function (f) {
        var _this = this;
        return new Task(function (reject, resolve) {
            return _this.fn(function (x) { return f(x).fork(reject, resolve); }, function (t) { return resolve(t); });
        });
    };
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