class Conn {
  constructor(transport) {
    this.transport = transport;
    this.questionID = new IDGen();
    this.questions = [];

    this.promise = new Promise((resolve, reject) => {
      this.receiveLoop().catch(e => {
        console.error(`capn proto RPC error: `, e);
        reject(e);
      });
    });
  }

  async bootstrap() {}

  async startWork() {
    async () => {
      for (;;) {
        const root = await this.transport.receiveMessage();
        this.transport.dumpMessage(">>", root);
      }
    };
  }

  newQuestion(method) {
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

class Question {
  constructor(conn, id, method) {
    this.conn = conn;
    this.id = id;
    this.method = method;
  }

  // signals that the question has been sent
  start() {}
}

// IDGen returns a sequence of monotonically increasing IDs
// with support for replacement.
class IDGen {
  constructor() {
    this.i = 0;
    this.free = [];
  }

  next() {
    if (this.free.length > 0) {
      return this.free.pop();
    }
    return this.i++;
  }

  remove(i) {
    this.free.push(i);
  }
}

module.exports = Conn;
