import { Conn, newMessage } from "./rpc";
import { Client, Call, Answer, ErrorAnswer } from "./capability";

export class ImportClient implements Client {
  conn: Conn;
  id: number;
  closed = false;

  constructor(conn: Conn, id: number) {
    this.conn = conn;
    this.id = id;
  }

  call(cl: Call): Answer {
    if (this.closed) {
      return new ErrorAnswer(new Error(`rpc: call on closed import`));
    }

    const q = this.conn.newQuestion(cl.method);
    const msg = newMessage();
    const msgCall = msg.initCall();
    msgCall.setQuestionId(q.id);
    msgCall.setInterfaceId(cl.method.interfaceID);
    msgCall.setMethodId(cl.method.methodID);
    const target = msgCall.initTarget();
    target.setImportedCap(this.id);
    const payload = msgCall.initParams();
    this.conn.fillParams(payload, cl);
    // TODO: handle thrown exceptions here?

    this.conn.transport.sendMessage(msg);
    // TODO: what about q.start()?
    return q;
  }

  close() {}
}