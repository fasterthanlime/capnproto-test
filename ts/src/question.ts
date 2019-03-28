import { Deferred } from "ts-deferred";
import { Message } from "capnp-ts/lib/std/rpc.capnp";

import { Conn } from "./rpc";
import { Method, Answer, Call, PipelineOp } from "./capability";

export class Question implements Answer {
  conn: Conn;
  id: number;
  method?: Method;
  paramCaps: number[] = [];
  deferred = new Deferred<Message>();

  constructor(conn: Conn, id: number, method?: Method) {
    this.conn = conn;
    this.id = id;
    this.method = method;
  }

  pipelineCall(transform: PipelineOp[], call: Call): Answer {
    if (this.conn.findQuestion(this.id) !== this) {
      const client = clientFromResolution(transform, obj);
      return await this.conn.call();
    }
  }
}
