import { Transport } from "./transport";

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

  constructor(transport: Transport) {
    this.transport = transport;
    this.questionID = new IDGen();
    this.questions = [];
  }

  async bootstrap() {}

  async startWork() {
    (async () => {
      for (;;) {
        const root = await this.transport.receiveMessage();
        this.transport.dumpMessage(">>", root);
      }
    })();
  }

  newQuestion(method: Method) {
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
  method: Method;

  constructor(conn: Conn, id: number, method: Method) {
    this.conn = conn;
    this.id = id;
    this.method = method;
  }

  // signals that the question has been sent
  start() {}
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
