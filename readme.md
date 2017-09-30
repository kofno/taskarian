# taskarian

[![Build Status](https://travis-ci.org/kofno/taskarian.svg?branch=master)](https://travis-ci.org/kofno/taskarian)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg?style=plastic)](https://github.com/semantic-release/semantic-release)

A Task (Future) implementation in TypeScript. Useful for managing asynchronous tasks
that may fail.

A Task is different then a Promise because it is lazy, rather then eager. A Promise
runs as soon as you instantiate it. A Task doesn't run until you call `fork`.
Pure functions can return tasks (just not execute them). This means that you
could, for example, return a task from a Redux reducer, if that's your thing.

# install

> npm install --save taskarian

> yarn add taskarian

# usage

    import Task from 'taskarian';

    function parse(s) {
      return new Task(function(reject, resolve) {
        try {
          resolve(JSON.parse(s));
        }
        catch(e) {
          reject(e.message);
        }
      });
    }

    parse('foo').fork(
      function(err) { console.error(err) },
      function(value) { console.log(value) }
    );

It is also possible to cancel a task, if the task supports it:

    import Task, { Resolve } from 'taskarian';

    const cancellable = new Task((reject, resolve: Resolve<string>) => {
      const x = setTimeout(() => resolve('Yo!'), 3000);
      return () => clearTimeout(x);
    });

    const cancel = task.fork(
      err => console.error(err),
      s => console.warn(`Task should never have finished; ${s}`),
    );

    cancel();

# docs

[API](https://kofno.github.io/taskarian)
