"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Task = (function () {
    function Task(computation) {
        this.fn = computation;
    }
    Task.succeed = function (t) {
        return new Task(function (reject, resolve) {
            return resolve(t);
        });
    };
    Task.fail = function (err) {
        return new Task(function (reject, resolve) {
            return reject(err);
        });
    };
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