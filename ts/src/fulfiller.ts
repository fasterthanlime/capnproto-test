import * as capnp from "capnp-ts";
import {
  SuperMessage,
  Answer,
  ImmediateAnswer,
  Client,
  Call,
  PipelineOp,
  transformPtr,
  pointerToInterface,
  isInterfaceValid,
  copyCall,
  ErrorAnswer,
  ErrNullClient,
} from "./capability";
import { Queue } from "capnp-ts/lib/internal/queue";
import { Deferred } from "ts-deferred";
import { answerPipelineClient } from "./rpc";

export class ErrCallQueueFull extends Error {
  constructor() {
    super(`capnp: promised answer call queue full`);
  }
}

export class ErrQueueCallCancel extends Error {
  constructor() {
    super(`capnp: queue call canceled`);
  }
}

class EmbargoClient implements Client {
  _client: Client;

  q: Queue;
  calls: Ecalls;

  constructor(client: Client, queue: Ecalls) {
    this._client = client;
    this.calls = queue.copy();
    this.q = new Queue(this.calls, this.calls.len());
    this.flushQueue();
  }

  async flushQueue() {
    let c: ecall | null = null;
    {
      let i = this.q.front();
      if (i != -1) {
        c = this.calls.data[i];
      }
    }

    while (c && c.call) {
      const ans = this._client.call(c.call);
      (async (f: Fulfiller, ans: Answer) => {
        try {
          f.fulfill(await ans.struct());
        } catch (e) {
          f.reject(e);
        }
      })(c.f, ans);
      this.q.pop();
      {
        let i = this.q.front();
        if (i !== -1) {
          c = this.calls.data[i];
        } else {
          c = null;
        }
      }
    }
  }

  // client returns the underlying client if the embargo has
  // been lifted and null otherwise
  client(): Client | null {
    return this.isPassthrough() ? this._client : null;
  }

  isPassthrough(): boolean {
    return this.q.len() === 0;
  }

  // call either queues a call to the underlying client or starts a
  // call if the embargo has been lifted
  call(call: Call): Answer {
    // Fast path: queue is flushed
    if (this.isPassthrough()) {
      return this._client.call(call);
    }

    // Add to queue
    return this.push(call);
  }

  push(_call: Call): Answer {
    const f = new Fulfiller();
    const call = copyCall(_call);
    const i = this.q.push();
    if (i == -1) {
      return new ErrorAnswer(new ErrCallQueueFull());
    }
    this.calls.data[i] = <ecall>{
      call,
      f,
    };
    return f;
  }

  close() {
    // reject all queued calls
    while (this.q.len() > 0) {
      this.calls.data[this.q.front()]!.f.reject(new ErrQueueCallCancel());
      this.q.pop();
    }
    this._client.close();
  }
}

// callQueueSize is the maximum number of pending calls
const callQueueSize = 64;

// Fulfiller is a promise for a Struct. It starts out
// as an unresolved answer. A Fulfiller is considered to be resolved
// once fulfill or reject is called. Calls to the fulfiller will queue
// up until it is resolved.
export class Fulfiller implements Answer {
  resolved = false;
  answer?: Answer;
  queue: pcall[] = [];
  queueCap = callQueueSize;
  deferred = new Deferred<capnp.Struct>();

  constructor() {}

  fulfill(s: capnp.Struct) {
    this.answer = new ImmediateAnswer(s);
    const queues = this.emptyQueue(s);
    const ctab = (s.segment.message as SuperMessage).capTable;
    for (const _capIdx of Object.keys(queues)) {
      const capIdx = +_capIdx;
      const q = queues[capIdx];
      ctab[capIdx] = new EmbargoClient(ctab[capIdx]!, q);
    }
    this.deferred.resolve(s);
  }

  reject(err: Error) {
    this.deferred.reject(err);
  }

  peek(): Answer | undefined {
    return this.answer;
  }

  async struct(): Promise<capnp.Struct> {
    return await this.deferred.promise;
  }

  // pipelineCall calls pipelineCall on the fulfilled answer or
  // queues the call if f has not been fulfilled
  pipelineCall(transform: PipelineOp[], call: Call): Answer {
    // Fast path: pass-through after fulfilled
    {
      const a = this.peek();
      if (a) {
        return a.pipelineCall(transform, call);
      }
    }

    if (this.queue.length == this.queueCap) {
      return new ErrorAnswer(new ErrCallQueueFull());
    }
    const cc = copyCall(call);
    const g = new Fulfiller();
    this.queue.push(<pcall>{
      transform,
      call: cc,
    });
    return g;
  }

  // pipelineClose waits until f is resolved and then calls
  // pipelineClose on the fulfilled answer
  // FIXME: should this be async?
  pipelineClose(transform: PipelineOp[]) {
    this.deferred.promise.finally(() => {
      if (this.answer) {
        this.answer.pipelineClose(transform);
      }
    });
  }

  // emptyQueue splits the queue by which capability it targets and
  // drops any invalid calls.  Once this function returns, f.queue will
  // be nil.
  emptyQueue(s: capnp.Struct) {
    let qs: { [key: number]: Ecalls } = {};
    for (let i in this.queue) {
      const pc = this.queue[i];
      let c: capnp.Pointer;
      try {
        c = transformPtr(s, pc.transform);
      } catch (e) {
        pc.f.reject(e);
        continue;
      }
      let iface = pointerToInterface(c);
      if (!isInterfaceValid(iface)) {
        pc.f.reject(new ErrNullClient());
        continue;
      }
      const cn = iface.cap;
      if (!qs[cn]) {
        qs[cn] = new Ecalls([]);
      }
      qs[cn].data.push(pc);
    }
    this.queue = [];
    return qs;
  }
}

// ecall is a queued embargoed call
export interface ecall {
  call: Call;
  f: Fulfiller;
}

// pcall is a queued pipeline call
export interface pcall extends ecall {
  transform: PipelineOp[];
}

class Ecalls {
  data: (ecall | null)[];

  constructor(data: (ecall | null)[]) {
    this.data = data;
  }

  static copyOf(data: (ecall | null)[]) {
    return new Ecalls([...data]);
  }

  len() {
    return this.data.length;
  }

  clear(i: number) {
    this.data[i] = null;
  }

  copy(): Ecalls {
    return Ecalls.copyOf(this.data);
  }
}
