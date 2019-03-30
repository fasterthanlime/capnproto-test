import { Struct } from "capnp-ts";
import { Conn, newMessage } from "./rpc";
import { Client, Call, Answer, ErrorAnswer } from "./capability";

export class ErrImportClosed extends Error {
  constructor() {
    super(`rpc: call on closed import`);
  }
}

export class ImportClient implements Client {
  conn: Conn;
  id: number;
  closed = false;

  constructor(conn: Conn, id: number) {
    this.conn = conn;
    this.id = id;
  }

  call<P extends Struct, R extends Struct>(cl: Call<P, R>): Answer<R> {
    if (this.closed) {
      return new ErrorAnswer(new ErrImportClosed());
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
