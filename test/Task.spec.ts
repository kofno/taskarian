import { noop } from '@kofno/piper';
import { describe, expect, it } from 'bun:test';
import { Task, type Reject, type Resolve } from '../src';

const waitAndResolve = (timeout: number) =>
  new Task<never, string>(
    (_reject: Reject<never>, resolve: Resolve<string>) => {
      const x = setTimeout(() => resolve('Yo!'), timeout);
      return () => clearTimeout(x);
    }
  );

const waitAndReject = (timeout: number) =>
  new Task<string, never>(
    (reject: Reject<string>, _resolve: Resolve<never>) => {
      const x = setTimeout(() => reject('Oops!'), timeout);
      return () => clearTimeout(x);
    }
  );

const cancellable = waitAndResolve(3000);
const longRunningFailure = waitAndReject(10000);

describe('Task', () => {
  describe('Task.succeed', () => {
    it('should always succeed', (done) => {
      Task.succeed(42).fork(
        (_) => {
          expect(false).toBe(true); // Should not reach here
          done();
        },
        (v) => {
          expect(v).toBe(42);
          done();
        }
      );
    });
  });

  describe('Task.fail', () => {
    it('should always fail', (done) => {
      Task.fail('Ooops!').fork(
        (err) => {
          expect(err).toBe('Ooops!');
          done();
        },
        (_) => {
          expect(false).toBe(true); // Should not reach here
          done();
        }
      );
    });
  });

  describe('Task.map', () => {
    it('should map a successful task', (done) => {
      Task.succeed(42)
        .map((v) => v - 12)
        .fork(
          (_) => {
            expect(false).toBe(true); // Should not reach here
            done();
          },
          (result) => {
            expect(result).toBe(30);
            done();
          }
        );
    });

    it('should not map a failed task', (done) => {
      Task.fail('Opps!')
        .map((_) => {
          expect(false).toBe(true); // Should not reach here
          done();
        })
        .fork(
          (err) => {
            expect(err).toBe('Opps!');
            done();
          },
          (_) => {
            expect(false).toBe(true); // Should not reach here
            done();
          }
        );
    });
  });

  describe('Task.andThen', () => {
    it('should chain successful tasks', (done) => {
      Task.succeed(42)
        .andThen((v) => Task.succeed(v - 12))
        .fork(
          (_) => {
            expect(false).toBe(true); // Should not reach here
            done();
          },
          (v) => {
            expect(v).toBe(30);
            done();
          }
        );
    });

    it('should fail if a chained task fails', (done) => {
      Task.succeed(42)
        .andThen((_) => Task.fail('Ooops!'))
        .fork(
          (err) => {
            expect(err).toBe('Ooops!');
            done();
          },
          (_) => {
            expect(false).toBe(true); // Should not reach here
            done();
          }
        );
    });

    it('should fail if the initial task fails', (done) => {
      Task.fail('Oops!')
        .andThen((_) => Task.succeed(42))
        .fork(
          (err) => {
            expect(err).toBe('Oops!');
            done();
          },
          (_) => {
            expect(false).toBe(true); // Should not reach here
            done();
          }
        );
    });
  });

  describe('Task.orElse', () => {
    it('should recover from a failed task', (done) => {
      Task.fail('Oops!')
        .orElse((e) => Task.succeed(e))
        .fork(
          (_) => {
            expect(false).toBe(true); // Should not reach here
            done();
          },
          (v) => {
            expect(v).toBe('Oops!');
            done();
          }
        );
    });

    it('should not run if the task succeeds', (done) => {
      Task.succeed(42)
        .orElse((_) => {
          expect(false).toBe(true); // Should not reach here
          done();
          return Task.fail('WAT!?');
        })
        .fork(
          (_) => {
            expect(false).toBe(true); // Should not reach here
            done();
          },
          (v) => {
            expect(v).toBe(42);
            done();
          }
        );
    });
    it('should map the error', (done) => {
      Task.fail('Oops!')
        .orElse((e) => Task.fail(e.toUpperCase()))
        .fork(
          (err) => {
            expect(err).toBe('OOPS!');
            done();
          },
          (_) => {
            expect(false).toBe(true); // Should not reach here
            done();
          }
        );
    });
  });

  describe('Task.mapError', () => {
    it('should map the error', (done) => {
      Task.fail('Oops!')
        .mapError((e) => e.toUpperCase())
        .fork(
          (err) => {
            expect(err).toBe('OOPS!');
            done();
          },
          (_) => {
            expect(false).toBe(true); // Should not reach here
            done();
          }
        );
    });
  });

  describe('Cancel task', () => {
    it('should cancel a task', (done) => {
      const cancel = cancellable.fork(
        (err) => {
          expect(false).toBe(true); // Should not reach here
          done();
        },
        (v) => {
          expect(false).toBe(true); // Should not reach here
          done();
        }
      );
      cancel();
      setTimeout(done, 4000); // Wait longer than the task's timeout
    });
  });

  describe('Cancel mapped task', () => {
    it('should cancel a mapped task', (done) => {
      const task = cancellable.map((s) => s.toUpperCase());

      const cancel = task.fork(
        (err) => {
          expect(false).toBe(true); // Should not reach here
          done();
        },
        (s) => {
          expect(false).toBe(true); // Should not reach here
          done();
        }
      );
      cancel();
      setTimeout(done, 4000); // Wait longer than the task's timeout
    });
  });

  describe('Cancel sequenced tasks', () => {
    it('should cancel sequenced tasks', (done) => {
      const task = cancellable.andThen(
        (s) =>
          new Task((_, resolve) => {
            resolve(s.toUpperCase());
            // tslint:disable-next-line:no-empty
            return () => {};
          })
      );

      const cancel = task.fork(
        (err) => {
          expect(false).toBe(true); // Should not reach here
          done();
        },
        (s) => {
          expect(false).toBe(true); // Should not reach here
          done();
        }
      );
      cancel();
      setTimeout(done, 4000); // Wait longer than the task's timeout
    });
  });

  describe('Cancel sequenced asynced tasks', () => {
    it('should cancel sequenced async tasks', (done) => {
      const task = cancellable.andThen(
        (s) =>
          new Task((_, resolve) => {
            const x = setTimeout(() => resolve(s.toUpperCase()), 3000);
            return () => clearTimeout(x);
          })
      );

      const cancel = task.fork(
        (err) => {
          expect(false).toBe(true); // Should not reach here
          done();
        },
        (s) => {
          expect(false).toBe(true); // Should not reach here
          done();
        }
      );
      cancel();
      setTimeout(done, 4000); // Wait longer than the task's timeout
    });
  });

  describe('Promises', () => {
    it('should convert a resolved promise to a task', (done) => {
      Task.fromPromise(() => Promise.resolve(42))
        .map((n) => n + 8)
        .fork(
          (err) => {
            expect(false).toBe(true); // Should not reach here
            done();
          },
          (n) => {
            expect(n).toBe(50);
            done();
          }
        );
    });

    it('should convert a rejected promise to a task', (done) => {
      Task.fromPromise(() => Promise.reject<number>('whoops!'))
        .map((n) => n + 8)
        .fork(
          (err) => {
            expect(err).toBe('whoops!');
            done();
          },
          (n) => {
            expect(false).toBe(true); // Should not reach here
            done();
          }
        );
    });

    it('should chain a resolved promise as a task', (done) => {
      Task.succeed(42)
        .andThenP((n) => Promise.resolve(n + 8))
        .fork(
          (err) => {
            expect(false).toBe(true); // Should not reach here
            done();
          },
          (n) => {
            expect(n).toBe(50);
            done();
          }
        );
    });

    it('should chain a rejected promise as a task', (done) => {
      Task.succeed(42)
        .andThenP((_) => Promise.reject('Whoops!'))
        .fork(
          (err) => {
            expect(err).toBe('Whoops!');
            done();
          },
          (n) => {
            expect(false).toBe(true); // Should not reach here
            done();
          }
        );
    });
  });

  describe('Task.assign', () => {
    it('should assign values to an object', (done) => {
      Task.succeed({})
        .assign('x', Task.succeed(42))
        .assign('y', Task.succeed(8))
        .assign('z', (s) => Task.succeed(String(s.x + s.y)))
        .fork(
          (m) => {
            expect(false).toBe(true); // Should not reach here
            done();
          },
          (value) => {
            expect(value).toEqual({ x: 42, y: 8, z: '50' });
            done();
          }
        );
    });

    it('should fail if one of the assigned tasks fails', (done) => {
      Task.succeed({})
        .assign('x', Task.succeed(42))
        .assign('y', Task.fail<string, number>('Ooops!'))
        .assign('z', (s) => Task.succeed(String(s.x + s.y)))
        .fork(
          (m) => {
            expect(m).toBe('Ooops!');
            done();
          },
          (value) => {
            expect(false).toBe(true); // Should not reach here
            done();
          }
        );
    });
  });

  describe('Task.do', () => {
    it('should execute a side-effect on success', (done) => {
      let sideEffectCalled = false;
      Task.succeed(42)
        .do((v) => {
          sideEffectCalled = true;
          expect(v).toBe(42);
        })
        .fork(
          (e) => {
            expect(false).toBe(true); // Should not reach here
            done();
          },
          (v) => {
            expect(sideEffectCalled).toBe(true);
            expect(v).toBe(42);
            done();
          }
        );
    });

    it('should not execute a side-effect on failure', (done) => {
      let sideEffectCalled = false;
      Task.fail('Oops!')
        .do(() => {
          sideEffectCalled = true;
        })
        .fork(
          (e) => {
            expect(sideEffectCalled).toBe(false);
            expect(e).toBe('Oops!');
            done();
          },
          (v) => {
            expect(false).toBe(true); // Should not reach here
            done();
          }
        );
    });
  });

  describe('Task.elseDo', () => {
    it('should execute a side-effect on failure', (done) => {
      let sideEffectCalled = false;
      Task.fail('Oops!')
        .elseDo((e) => {
          sideEffectCalled = true;
          expect(e).toBe('Oops!');
        })
        .fork(
          (e) => {
            expect(sideEffectCalled).toBe(true);
            expect(e).toBe('Oops!');
            done();
          },
          (v) => {
            expect(false).toBe(true); // Should not reach here
            done();
          }
        );
    });

    it('should not execute a side-effect on success', (done) => {
      let sideEffectCalled = false;
      Task.succeed(42)
        .elseDo(() => {
          sideEffectCalled = true;
        })
        .fork(
          (e) => {
            expect(false).toBe(true); // Should not reach here
            done();
          },
          (v) => {
            expect(sideEffectCalled).toBe(false);
            expect(v).toBe(42);
            done();
          }
        );
    });
  });

  describe('Task.resolve', () => {
    it('should resolve a successful task', async () => {
      const result = await Task.succeed(42)
        .map((n) => n + 38)
        .resolve();
      expect(result).toBe(80);
    });
    it('should reject a failed task', async () => {
      await expect(Task.fail('Oops!').resolve()).rejects.toThrow('Oops!');
    });
  });

  describe('Task.all', () => {
    it('should handle an empty array', (done) => {
      Task.all<string, number>([]).fork(
        (err) => {
          expect(false).toBe(true); // Should not reach here
          done();
        },
        (results) => {
          expect(results).toEqual([]);
          done();
        }
      );
    });

    it('should handle all successful tasks', (done) => {
      const tasks = [Task.succeed(1), Task.succeed(2), Task.succeed(3)];
      Task.all(tasks).fork(
        (err) => {
          expect(false).toBe(true); // Should not reach here
          done();
        },
        (results) => {
          expect(results).toEqual([1, 2, 3]);
          done();
        }
      );
    });

    it('should fail if one task fails', (done) => {
      const tasks = [Task.succeed(1), Task.fail('Oops!'), Task.succeed(3)];
      Task.all(tasks).fork(
        (err) => {
          expect(err).toBe('Oops!');
          done();
        },
        (_) => {
          expect(false).toBe(true); // Should not reach here
          done();
        }
      );
    });

    it('should cancel all tasks', (done) => {
      const tasks = [cancellable, longRunningFailure];
      const cancel = Task.all(tasks).fork(
        (err) => {
          expect(false).toBe(true); // Should not reach here
          done();
        },
        (_) => {
          expect(false).toBe(true); // Should not reach here
          done();
        }
      );
      cancel();
      setTimeout(done, 4000); // Wait longer than the task's timeout
    });
  });

  describe('Task.race', () => {
    it('should handle an empty array', (done) => {
      Task.race<string, number>([]).fork(
        (_) => {
          expect(true).toBe(true); // Should be a noop
          done();
        },
        (_) => {
          expect(false).toBe(true); // Should not reach here
          done();
        }
      );
      done();
    });

    it('should return the first successful task', (done) => {
      const tasks = [
        Task.succeed(1),
        new Task((_, resolve) => {
          setTimeout(() => resolve(2), 100);
          return noop;
        }),
      ];
      Task.race(tasks).fork(
        (err) => {
          expect(false).toBe(true); // Should not reach here
          done();
        },
        (result) => {
          expect(result).toBe(1);
          done();
        }
      );
    });

    it('should fail if the first task fails', (done) => {
      const tasks = [
        Task.fail('Oops!'),
        new Task((_, resolve) => {
          setTimeout(() => resolve(2), 100);
          return noop; // Return a cleanup function
        }),
      ];
      Task.race(tasks).fork(
        (err) => {
          expect(err).toBe('Oops!');
          done();
        },
        (_) => {
          expect(false).toBe(true); // Should not reach here
          done();
        }
      );
    });

    it('should cancel all tasks', (done) => {
      const tasks = [cancellable, longRunningFailure];
      const cancel = Task.race(tasks).fork(
        (err) => {
          expect(false).toBe(true); // Should not reach here
          done();
        },
        (_) => {
          expect(false).toBe(true); // Should not reach here
          done();
        }
      );
      cancel();
      setTimeout(done, 4000); // Wait longer than the task's timeout
    });
  });

  describe('Task.loop', () => {
    it('should succeed immediately', async () => {
      const result = await Task.loop(10, Task.succeed(42)).resolve();
      expect(result).toBe(42);
    });

    it('should succeed after a few tries', async () => {
      let count = 0;
      const task = new Task<string, number>((reject, resolve) => {
        count++;
        if (count >= 3) {
          resolve(count);
        } else {
          reject('Not yet!');
        }
        return () => {};
      }).orElse(() => Task.fail('Not yet!'));

      const result = await Task.loop(10, task).resolve();
      expect(result).toBe(3);
    });

    it('should cancel the loop', (done) => {
      let count = 0;
      const task = new Task<string, number>((reject, resolve) => {
        count++;
        if (count >= 11) {
          resolve(count);
        } else {
          reject('Not yet!');
        }
        return () => {};
      }).orElse(() => Task.fail('Not yet!'));

      const cancel = Task.loop(100, task).fork(
        (err) => {
          console.warn('Error:', err);
          expect(false).toBe(true); // Should not reach here
          done();
        },
        (v) => {
          console.warn('Result:', v);
          expect(false).toBe(true); // Should not reach here
          done();
        }
      );
      setTimeout(() => {
        cancel();
        done();
      }, 50);
    });
  });

  describe('Task.and', () => {
    it('should map a successful task', (done) => {
      Task.succeed(42)
        .and((v) => v - 12)
        .fork(
          (_) => {
            expect(false).toBe(true); // Should not reach here
            done();
          },
          (result) => {
            expect(result).toBe(30);
            done();
          }
        );
    });

    it('should not map a failed task', (done) => {
      Task.fail('Opps!')
        .and((_) => {
          expect(false).toBe(true); // Should not reach here
          done();
        })
        .fork(
          (err) => {
            expect(err).toBe('Opps!');
            done();
          },
          (_) => {
            expect(false).toBe(true); // Should not reach here
            done();
          }
        );
    });
  });
});
