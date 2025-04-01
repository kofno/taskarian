import { noop } from '@kofno/piper';
import { fromEmpty } from 'maybeasy';

/**
 * A type representing a function that is used to reject a promise or task with an error.
 *
 * @template E - The type of the error that will be passed to the reject function.
 * @param err - The error object or value to reject with.
 */
export type Reject<E> = (err: E) => void;
/**
 * A type representing a function that resolves a promise or asynchronous operation
 * with a value of type `T`.
 *
 * @template T - The type of the value that the function resolves with.
 * @param t - The value of type `T` to resolve.
 */
export type Resolve<T> = (t: T) => void;
/**
 * Represents a function that, when called, cancels an ongoing operation.
 *
 * This type is commonly used to provide a mechanism for aborting tasks
 * or asynchronous operations.
 */
export type Cancel = () => void;
/**
 * Represents a computation that can either resolve with a value of type `T`
 * or reject with an error of type `E`. The computation is provided with
 * `reject` and `resolve` functions to handle these outcomes, and it returns
 * a `Cancel` function to allow cancellation of the computation.
 *
 * @template E - The type of the error that can be used to reject the computation.
 * @template T - The type of the value that can be used to resolve the computation.
 * @param reject - A function to reject the computation with an error of type `E`.
 * @param resolve - A function to resolve the computation with a value of type `T`.
 * @returns A `Cancel` function that can be called to cancel the computation.
 */
export type Computation<E, T> = (
  reject: Reject<E>,
  resolve: Resolve<T>
) => Cancel;

/**
 * Represents an asynchronous computation that can either succeed with a value of type `T`
 * or fail with an error of type `E`. Tasks are cancellable and composable, providing a
 * functional approach to handling asynchronous operations.
 *
 * @template E - The type of the error that the Task can fail with.
 * @template T - The type of the value that the Task can resolve to.
 *
 * Tasks are lazy by nature, meaning they do not execute until explicitly forked or resolved.
 * They provide a rich API for chaining, mapping, and handling both success and failure cases.
 *
 * Example usage:
 * ```typescript
 * const task = Task.succeed(42)
 *   .map((x) => x + 1)
 *   .andThen((x) => Task.succeed(x * 2));
 *
 * task.fork(
 *   (err) => console.error('Task failed with error:', err),
 *   (result) => console.log('Task succeeded with result:', result)
 * );
 * ```
 */
export class Task<E, T> {
  /**
   * Creates a `Task` that immediately succeeds with the provided value.
   *
   * @template E - The type of the error that the task might produce (not used in this case).
   * @template T - The type of the value that the task will resolve with.
   * @param t - The value to resolve the task with.
   * @returns A `Task` instance that resolves with the given value.
   */
  public static succeed<E, T>(t: T): Task<E, T> {
    return new Task((_reject: Reject<E>, resolve: Resolve<T>) => {
      resolve(t);
      return noop;
    });
  }

  /**
   * Creates a `Task` that immediately fails with the provided error.
   *
   * @template E - The type of the error.
   * @template T - The type of the success value (unused in this case).
   * @param err - The error value to reject with.
   * @returns A `Task` instance that represents a failed computation.
   */
  public static fail<E, T>(err: E): Task<E, T> {
    return new Task((reject, _resolve) => {
      reject(err);
      return noop;
    });
  }

  /**
   * Creates a `Task` from a function that returns a `Promise`.
   *
   * @template E - The type of the error that the task can reject with.
   * @template T - The type of the value that the task can resolve with.
   * @param fn - A function that returns a `Promise` whose resolution or rejection
   *             will determine the outcome of the `Task`.
   * @returns A `Task` that resolves or rejects based on the provided `Promise`.
   */
  public static fromPromise<E, T>(fn: () => Promise<T>): Task<E, T> {
    return new Task((reject, resolve) => {
      fn().then(resolve, reject);
      return noop;
    });
  }

  /**
   * Combines an array of `Task` instances into a single `Task` that resolves
   * with an array of results when all the input tasks succeed, or rejects
   * if any of the input tasks fail.
   *
   * @template E - The error type of the tasks.
   * @template T - The success type of the tasks.
   * @param ts - An array of `Task` instances to be executed concurrently.
   * @returns A `Task` that resolves with an array of results when all tasks succeed,
   * or rejects with the first encountered error if any task fails.
   *
   * The returned `Task` also supports cancellation. If the returned `Task` is
   * canceled, all ongoing tasks in the input array will also be canceled.
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
      const tasks = ts; // avoid mutation of the original array
      const results: T[] = [];
      const cancels: Record<number, Cancel> = {};
      const resolveIdx = (idx: number) => (result: T) => {
        resolved = resolved + 1;
        results[idx] = result;
        cancels[idx] = noop;
        if (resolved === length) {
          resolve(results);
        }
      };
      tasks.forEach((task, index) => {
        cancels[index] = task.fork(reject, resolveIdx(index));
      });
      return () => {
        Object.entries(cancels).forEach(([_, cancel]) => cancel());
      };
    });
  }

  /**
   * Creates a `Task` that races the provided array of tasks and resolves or rejects
   * with the result of the first task to complete (either resolve or reject).
   *
   * If one task resolves or rejects, all other tasks are cancelled to prevent
   * unnecessary computation or side effects.
   *
   * @template E - The type of the error that the tasks may reject with.
   * @template T - The type of the value that the tasks may resolve with.
   *
   * @param tasks - A readonly array of `Task` instances to race.
   *
   * @returns A new `Task` that resolves or rejects with the result of the first
   * task to complete.
   *
   * @remarks
   * - If the provided array of tasks is empty, the returned `Task` will never
   * resolve or reject.
   * - Tasks are forked in parallel, ensuring that all tasks are started even if
   * one resolves or rejects before the others.
   * - Cancels all other tasks once one task resolves or rejects.
   */
  public static race<E, T>(tasks: ReadonlyArray<Task<E, T>>): Task<E, T> {
    type Status = 'waiting' | 'resolved' | 'rejected';

    return fromEmpty(tasks).cata({
      Nothing: () =>
        new Task<E, T>((_reject, _resolve) => {
          return noop;
        }),
      Just: () =>
        new Task<E, T>((reject, resolve) => {
          let status: Status = 'waiting';
          const cancels: Array<Cancel> = [];

          const cancelAll = (): void => {
            let cancel: Cancel | undefined;
            while ((cancel = cancels.shift())) cancel();
          };

          const cancelAllIfNotStillWaiting = (): void => {
            switch (status) {
              case 'waiting':
                break;
              case 'rejected':
              case 'resolved':
                cancelAll();
                break;
            }
          };

          const resolveAndCancelAll = (t: T): void => {
            switch (status) {
              case 'waiting':
                status = 'resolved';
                resolve(t);
                cancelAll();
                break;
              case 'resolved':
              case 'rejected':
                break;
            }
          };
          const rejectAndCancelAll = (e: E): void => {
            switch (status) {
              case 'waiting':
                status = 'rejected';
                reject(e);
                cancelAll();
                break;
              case 'resolved':
              case 'rejected':
                break;
            }
          };

          const forkTaskIfStillWaiting = (task: Task<E, T>): void => {
            switch (status) {
              case 'waiting': {
                const cancel = task.fork(
                  rejectAndCancelAll,
                  resolveAndCancelAll
                );
                cancels.push(cancel);
                break;
              }
              case 'rejected':
              case 'resolved':
                break;
            }
          };

          // Fork all tasks in parallel
          // This ensures that all tasks are forked even if one of them
          // resolves or rejects before the others. This is important to
          // ensure that all tasks are cancelled if one resolves or rejects.
          tasks.forEach((task) => {
            forkTaskIfStillWaiting(task);
          });

          cancelAllIfNotStillWaiting();

          return () => cancelAll();
        }),
    });
  }

  /**
   * Creates a looping task that repeatedly executes the given task at a specified interval.
   * The loop continues until the task is cancelled or the provided task resolves successfully.
   *
   * @template E - The type of the error that the task may produce.
   * @template T - The type of the result that the task produces.
   * @param interval - The time interval (in milliseconds) between each execution of the task.
   * @param task - The task to be executed repeatedly.
   * @returns A new task that represents the looping operation. The task resolves with the result
   *          of the provided task when it successfully completes, or can be cancelled to stop the loop.
   */
  public static loop<E, T>(interval: number, task: Task<E, T>): Task<E, T> {
    return new Task<E, T>((_, resolve) => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let internalCancel: Cancel | undefined;
      let isCancelled = false;

      const loop = () => {
        if (isCancelled) {
          return;
        }
        internalCancel = task.fork(
          (err) => {
            if (isCancelled) {
              return;
            }
            timeout = setTimeout(loop, interval);
          },
          (result) => {
            if (isCancelled) {
              return;
            }
            resolve(result);
          }
        );
      };

      loop();

      return () => {
        isCancelled = true;
        clearTimeout(timeout);
        internalCancel && internalCancel();
      };
    });
  }

  private fn: Computation<E, T>;

  constructor(computation: Computation<E, T>) {
    this.fn = computation;
  }

  /**
   * Executes the task by invoking the underlying function with the provided
   * `reject` and `resolve` callbacks. This method allows the task to be
   * started and its result to be handled.
   *
   * @param reject - A callback function to handle errors or rejection cases.
   * @param resolve - A callback function to handle successful resolution of the task.
   * @returns A `Cancel` function that can be invoked to cancel the task execution.
   */
  public fork(reject: Reject<E>, resolve: Resolve<T>): Cancel {
    return this.fn(reject, resolve);
  }

  /**
   * Resolves the task by executing the provided function and returning a promise.
   *
   * @returns A `Promise` that resolves with the value of type `T` when the task is successfully completed,
   *          or rejects if an error occurs during execution.
   */
  public resolve(): Promise<T> {
    return new Promise((resolve, reject) => {
      this.fn(reject, resolve);
    });
  }

  /**
   * Transforms the value inside the `Task` using the provided mapping function.
   *
   * @template A - The type of the value after applying the mapping function.
   * @param f - A function that takes the current value of type `T` and returns a new value of type `A`.
   * @returns A new `Task` instance with the transformed value.
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
   * Transforms the result of the current `Task` using the provided function `f`.
   * This is a shorthand for calling the `map` method.
   *
   * @param f - A function that takes the result of type `T` and returns a new value of type `A`.
   * @returns A new `Task` instance with the transformed result of type `A`.
   */
  public and<A>(f: (t: T) => A): Task<E, A> {
    return this.map(f);
  }

  /**
   * Chains the current `Task` with another `Task` that is created by applying
   * the provided function `f` to the resolved value of the current `Task`.
   *
   * This method allows for sequential composition of asynchronous operations,
   * where the output of the current `Task` is used as the input to the next
   * `Task`.
   *
   * @template A - The type of the value resolved by the next `Task`.
   * @param f - A function that takes the resolved value of the current `Task`
   *            and returns a new `Task`.
   * @returns A new `Task` that represents the result of chaining the current
   *          `Task` with the `Task` returned by the function `f`.
   */
  public andThen<A>(f: (t: T) => Task<E, A>): Task<E, A> {
    return new Task((reject, resolve) => {
      let innerCancel: Cancel | undefined;

      const outerCancel = this.fn(
        (err) => reject(err),
        (a: T) => {
          innerCancel = f(a).fork(reject, resolve);
        }
      );

      return () => {
        if (innerCancel) {
          innerCancel();
        } else {
          outerCancel();
        }
      };
    });
  }

  /**
   * Chains the current `Task` with a function that returns a `Promise`.
   *
   * This method allows you to handle the success value of the current `Task`
   * and transform it into a new value wrapped in a `Promise`. The resulting
   * `Task` will resolve with the value of the `Promise` or reject if either
   * the current `Task` or the `Promise` fails.
   *
   * @template A - The type of the value resolved by the `Promise` and the resulting `Task`.
   * @param f - A function that takes the success value of the current `Task`
   *            and returns a `Promise` resolving to a new value.
   * @returns A new `Task` that resolves with the value of the `Promise` returned by `f`,
   *          or rejects with an error from either the current `Task` or the `Promise`.
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
   * Provides a fallback mechanism for a `Task` in case of failure.
   * If the current `Task` fails with an error of type `E`, the provided
   * function `f` is invoked with the error, and its result (a new `Task`)
   * is executed as a fallback.
   *
   * @template X - The error type of the fallback `Task`.
   * @template T - The success type of the `Task`.
   * @param f - A function that takes an error of type `E` and returns a new `Task`
   *            to be executed as a fallback.
   * @returns A new `Task` that either resolves with the success value of the
   *          original `Task` or the fallback `Task` if the original fails.
   */
  public orElse<X>(f: (err: E) => Task<X, T>): Task<X, T> {
    return new Task((reject, resolve) => {
      let innerCancel: Cancel | undefined;
      const outerCancel = this.fn(
        (x: E) => {
          innerCancel = f(x).fork(reject, resolve);
        },
        (t) => resolve(t)
      );
      return () => {
        if (innerCancel) {
          innerCancel();
        } else {
          outerCancel();
        }
      };
    });
  }

  /**
   * Transforms the error value of the `Task` using the provided mapping function.
   *
   * @template X - The type of the transformed error.
   * @param f - A function that takes the original error of type `E` and returns a transformed error of type `X`.
   * @returns A new `Task` instance with the error type transformed to `X`, while keeping the success type `T` unchanged.
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
   * Assigns a new property to the result of the current task by combining it with another task
   * or a function that produces a task. The new property is added to the resulting object
   * with the specified key and value type.
   *
   * @template K - The key of the property to be added to the resulting object.
   * @template A - The type of the value associated with the key.
   *
   * @param k - The key of the property to be added to the resulting object.
   * @param other - A task or a function that takes the current task's result and returns a task.
   *                The result of this task will be assigned to the specified key.
   *
   * @returns A new task that resolves to an object combining the original task's result
   *          and the new property with the specified key and value.
   */
  public assign<K extends string, A>(
    k: K,
    other: Task<E, A> | ((t: T) => Task<E, A>)
  ): Task<E, T & { [k in K]: A }> {
    return this.andThen((t) => {
      const task = typeof other === 'function' ? other(t) : other;
      return task.map<T & { [k in K]: A }>((a) => ({
        ...Object(t),
        [k.toString()]: a,
      }));
    });
  }

  /**
   * Executes a provided function `fn` with the value of the task when it resolves,
   * and returns a new task with the same value. This method is useful for performing
   * side effects without altering the task's value.
   *
   * @template E - The type of the error that the task may produce.
   * @template T - The type of the value that the task resolves to.
   * @param fn - A function to be executed with the resolved value of the task.
   *             It does not modify the value but can be used for side effects.
   * @returns A new `Task` instance with the same value and error type.
   */
  public do(fn: (a: T) => void): Task<E, T> {
    return this.map((v) => {
      fn(v);
      return v;
    });
  }

  /**
   * Executes a provided function if the task encounters an error.
   * The function receives the error as its argument, allowing for custom error handling.
   * The task continues to propagate the error after the function is executed.
   *
   * @param fn - A callback function that is invoked with the error when the task fails.
   * @returns A new `Task` instance that propagates the original error and result.
   */
  public elseDo(fn: (err: E) => void): Task<E, T> {
    return this.mapError((err) => {
      fn(err);
      return err;
    });
  }
}
