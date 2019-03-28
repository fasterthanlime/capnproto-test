import * as capnp from "capnp-ts";
import { SuperMessage, Answer, ImmediateAnswer, Client } from "./capability";

class Queue {}

class EmbargoClient implements Client {
  client: Client;

  q: Queue;
  calls: ecall[];
}

export class Fulfiller {
  resolved = false;
  answer?: Answer;
  queue: pcall[] = [];

  fulfill(s: capnp.Struct) {
    this.answer = new ImmediateAnswer(s);
    const queues = f.emptyQueues(s);
    const ctab = (s.segment.message as SuperMessage).capTable;
    for (const _capIdx of Object.keys(queues)) {
      const capIdx = +_capIdx;
      const q = queues[capIdx];
      ctab[capIdx] = new EmbargoClient(ctab[capIdx], q);
    }
  }

  // emptyQueue splits the queue by which capability it targets and
  // drops any invalid calls.  Once this function returns, f.queue will
  // be nil.
  emptyQueues(): { [key: number]: ecall } {}
}

// pcall is a queued pipeline call
export interface pcall {}

// ecall is a queued embargoed call
export interface ecall {}
