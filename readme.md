# taskade

A Task (Future) implementation in TypeScript. Useful for managing asynchronous tasks
that may fail.

A Task is different then a Promise because it is lazy, rather then eager. A Promise
runs as soon as you instantiate it. A Task doesn't run until you call `fork`.
Pure functions can return tasks (just not execute them). This means that you
could, for example, return a task from a Redux reducer, if that's your thing.

# install

> npm install --save taskade

> yarn add taskade

# usage

    import Task from 'taskade';

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

# docs

[API](https://kofno.github.io/maybeasy)
