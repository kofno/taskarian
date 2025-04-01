# Taskarian: Lazy Asynchronous Tasks in TypeScript

**Taskarian** is a lightweight TypeScript library for managing asynchronous operations using a **Task** data type. Unlike Promises, Tasks are **lazy**. They define _what_ to do asynchronously but don't execute it until explicitly told to. This makes them ideal for scenarios where you need to compose asynchronous operations without immediately triggering them.

## Why Choose Taskarian?

- **Laziness:** Tasks are lazy. They only execute when you call `fork`, giving you fine-grained control over when asynchronous operations begin.
- **Composability:** Tasks are designed to be composed. You can chain, map, and combine them to build complex asynchronous workflows.
- **Error Handling:** Tasks provide a clear and consistent way to handle both success and failure scenarios.
- **Cancellation:** Taskarian supports task cancellation, allowing you to gracefully stop long-running operations.
- **Pure Functions:** Tasks can be returned from pure functions without side effects, enabling their use in functional programming paradigms.
- **TypeScript-First:** Built with TypeScript, Taskarian provides excellent type safety and developer experience.

## Installation

**npm:**

```bash
npm install taskarian
yarn add taskarian
```

## Usage

### Basic Task Creation and Execution

The core of Taskarian is the Task class. You create a Task by providing a function that takes two arguments: reject and resolve. These are used to signal the outcome of the asynchronous operation.

```typescript
import Task from 'taskarian';

function parseJSON(jsonString: string): Task<string, any> {
  return new Task((reject, resolve) => {
    try {
      resolve(JSON.parse(jsonString));
    } catch (error) {
      reject(error.message);
    }
  });
}

// Create a task
const myTask = parseJSON('{"key": "value"}');

// Execute the task with fork
myTask.fork(
  (errorMessage) => console.error('Error:', errorMessage), // Rejection handler
  (parsedObject) => console.log('Success:', parsedObject) // Resolution handler
);

// Example of a failing task
const failingTask = parseJSON('invalid json');
failingTask.fork(
  (errorMessage) => console.error('Error:', errorMessage), // Rejection handler
  (parsedObject) => console.log('Success:', parsedObject) // Resolution handler - will not be called
);
```

### Task Cancellation

Taskarian allows you to cancel tasks that support it. To make a task cancellable, return a cleanup function from the Task's constructor.

```typescript
import Task, { Resolve } from 'taskarian';

const cancellableTask = new Task<string, void>(
  (reject, resolve: Resolve<string>) => {
    const timeoutId = setTimeout(() => resolve('Task completed!'), 3000);

    // Return a cleanup function to cancel the task
    return () => {
      console.log('Task cancelled!');
      clearTimeout(timeoutId);
    };
  }
);

// Start the task
const cancel = cancellableTask.fork(
  (error) => console.error('Error:', error),
  (result) => console.log('Result:', result)
);

// Cancel the task after 1 second
setTimeout(() => {
  cancel();
}, 1000);
```

### Chaining Tasks

Tasks can be chained together using the `map` and `andThen` methods.

```typescript
import Task from 'taskarian';

function double(n: number): Task<string, number> {
  return new Task((reject, resolve) => {
    resolve(n * 2);
  });
}

function addOne(n: number): Task<string, number> {
  return new Task((reject, resolve) => {
    resolve(n + 1);
  });
}

const chainedTask = new Task<string, number>((reject, resolve) => resolve(5))
  .andThen(double)
  .andThen(addOne);

chainedTask.fork(
  (error) => console.error('Error:', error),
  (result) => console.log('Result:', result) // Output: 11
);
```

### Mapping Tasks

Tasks can be mapped using the`map` method.

```typescript
import Task from 'taskarian';

const mappedTask = new Task<string, number>((reject, resolve) =>
  resolve(5)
).map((n) => n * 2);

mappedTask.fork(
  (error) => console.error('Error:', error),
  (result) => console.log('Result:', result) // Output: 10
);
```

### Using and

Tasks can be mapped using the `and` method.

```typescript
import Task from 'taskarian';

const mappedTask = new Task<string, number>((reject, resolve) =>
  resolve(5)
).and((n) => n * 2);

mappedTask.fork(
  (error) => console.error('Error:', error),
  (result) => console.log('Result:', result) // Output: 10
);
```

## API Reference

- **Task<E, A>(computation: (reject: (error: E) => void, resolve: (value: A) => void) => (() => void) | void)**: The Task constructor.
  - **computation**: A function that takes reject and resolve callbacks. It can optionally return a cancellation function.
- **fork(reject: (error: E) => void, resolve: (value: A) => void): () => void**: Executes the task.
  - **reject**: A function to handle task rejection.
  - **resolve**: A function to handle task resolution.
  - Returns a cancellation function (if provided by the task).
- **map<B>(f: (a: A) => B): Task<E, B>**: Transforms the resolved value of the task.
- **and<B>(f: (a: A) => B): Task<E, B>**: Transforms the resolved value of the task. This is a shorthand for map.
- **andThen<B>(f: (a: A) => Task<E, B>): Task<E, B>**: Chains another task to be executed after the current task resolves.
- **andThenP<B>(f: (a: A) => Promise<B>): Task<E, B>**: Chains a promise to be executed after the current task resolves.
- **orElse<X>(f: (err: E) => Task<X, T>): Task<X, T>**: Provides a fallback mechanism for a Task in case of failure.
- **mapError<X>(f: (err: E) => X): Task<X, T>**: Transforms the error value of the Task using the provided mapping function.
- **assign<K extends string, A>(k: K, other: Task<E, A> | ((t: T) => Task<E, A>)): Task<E, T & { [k in K]: A }>**: Assigns a new property to the result of the current task by combining it with another task or a function that produces a task.
- **do(fn: (a: T) => void): Task<E, T>**: Executes a provided function fn with the value of the task when it resolves, and returns a new task with the same value.
- **elseDo(fn: (err: E) => void): Task<E, T>**: Executes a provided function if the task encounters an error.
- **static succeed<E, T>(t: T): Task<E, T>**: Creates a Task that immediately succeeds with the provided value.
- **static fail<E, T>(err: E): Task<E, T>**: Creates a Task that immediately fails with the provided error.
- **static fromPromise<E, T>(fn: () => Promise<T>): Task<E, T>**: Creates a Task from a function that returns a Promise.
- **static all<E, T>(ts: Array<Task<E, T>>): Task<E, T[]>**: Combines an array of Task instances into a single Task that resolves with an array of results when all the input tasks succeed, or rejects if any of the input tasks fail.
- **static race<E, T>(tasks: ReadonlyArray<Task<E, T>>): Task<E, T>**: Creates a Task that races the provided array of tasks and resolves or rejects with the result of the first task to complete (either resolve or reject).
- **static loop<E, T>(interval: number, task: Task<E, T>): Task<E, T>**: Creates a looping task that repeatedly executes the given task at a specified interval.

## Contributing

Contributions are welcome! Please feel free to open issues or submit pull requests.

## License

MIT
