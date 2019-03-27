import * as capnp from "capnp-ts";
import { Transport } from "./transport";
import { Message } from "capnp-ts/lib/std/rpc.capnp";
import { Deferred } from "ts-deferred";

export interface Method {
  interfaceID: number;
  methodID: number;

  // Canonical name of the interface. May be empty.
  interfaceName?: string;
  // Method name as it appears in the schema. May be empty.
  methodName?: string;
}

export class Conn {
  transport: Transport;

  questionID = new IDGen();
  questions = [] as Question[];

  onError?: (err: Error) => void;

  constructor(transport: Transport) {
    this.transport = transport;
    this.questionID = new IDGen();
    this.questions = [];

    this.startWork();
  }

  async bootstrap() {
    const q = this.newQuestion();
    const msg = newMessage();
    const boot = msg.initBootstrap();
    boot.setQuestionId(q.id);

    this.transport.sendMessage(msg);
    await q.deferred.promise;
  }

  startWork() {
    (async () => {
      for (;;) {
        const msg = await this.transport.recvMessage();
        this.transport.dumpMessage(">>", msg);
      }
    })().catch(e => {
      if (this.onError) {
        this.onError(e);
      } else {
        console.log(`Cap'n Proto RPC error: `, e.stack);
      }
    });
  }

  newQuestion(method?: Method) {
    const id = this.questionID.next();
    const q = new Question(this, id, method);
    if (id === this.questions.length) {
      this.questions.push(q);
    } else {
      this.questions[id] = q;
    }
    return q;
  }
}

export class Question {
  conn: Conn;
  id: number;
  method?: Method;
  deferred = new Deferred<Message>();

  constructor(conn: Conn, id: number, method?: Method) {
    this.conn = conn;
    this.id = id;
    this.method = method;
  }
}

// IDGen returns a sequence of monotonically increasing IDs
// with support for replacement.
export class IDGen {
  i = 0;
  free: number[] = [];

  constructor() {}

  next() {
    let ret = this.free.pop();
    if (typeof ret === "undefined") {
      ret = this.i++;
    }
    return ret;
  }

  remove(i: number) {
    this.free.push(i);
  }
}

function newMessage(): Message {
  return new capnp.Message().initRoot(Message);
}
