import { Struct } from "capnp-ts";
import { Conn, clientFromResolution } from "./rpc";
import { PipelineOp, Client, Answer, Call } from "./capability";
import { Deferred } from "ts-deferred";
import { Fulfiller } from "./fulfiller";
import { MessageTarget } from "capnp-ts/lib/std/rpc.capnp";

// callQueueSize is the maximum number of pending calls
const callQueueSize = 64;

export interface AnswerEntry<R> {
  id: number;
  resultCaps: number[];
  conn: Conn;

  done: boolean;
  obj?: R;
  err?: Error;
  deferred: Deferred<R>;
  queue: pcall[];
}

interface qcall {
  a?: Answer<any>; // defined if remote call
  f?: Fulfiller<any>; // defined if local call
  call: Call<any, any>;

  // disembargo
  embargoID: number;
  embargoTarget: MessageTarget;
}

interface pcall extends qcall {
  transform: PipelineOp[];
}

export class LocalAnswerClient implements Client {
  a: AnswerEntry<any>;
  transform: PipelineOp[];

  constructor(a: AnswerEntry<any>, transform: PipelineOp[]) {
    this.a = a;
    this.transform = transform;
  }

  call<P extends Struct, R extends Struct>(call: Call<P, R>): Answer<R> {
    if (this.a.done) {
      return clientFromResolution(this.transform, this.a.obj, this.a.err).call(
        call,
      );
    }
    const f = new Fulfiller<R>();
    try {
    } catch (e) {}
    throw new Error(`stub!`);
    return f;
  }

  close() {
    throw new Error(`stub!`);
  }
}
