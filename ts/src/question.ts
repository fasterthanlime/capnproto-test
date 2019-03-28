import { Deferred } from "ts-deferred";
import { Message } from "capnp-ts/lib/std/rpc.capnp";
import * as capnp from "capnp-ts";

import {
  Conn,
  clientFromResolution,
  newMessage,
  transformToPromisedAnswer,
} from "./rpc";
import { Method, Answer, Call, PipelineOp } from "./capability";

export enum QuestionState {
  IN_PROGRESS,
  RESOLVED,
  CANCELED,
}

export class Question implements Answer {
  conn: Conn;
  id: number;
  method?: Method;
  paramCaps: number[] = [];
  state = QuestionState.IN_PROGRESS;
  obj?: capnp.Pointer;
  err?: Error;
  deferred = new Deferred<Message>();

  constructor(conn: Conn, id: number, method?: Method) {
    this.conn = conn;
    this.id = id;
    this.method = method;
  }

  async struct(): Promise<capnp.Struct> {
    throw new Error(`stub!`);
  }

  pipelineCall(transform: PipelineOp[], ccall: Call): Answer {
    if (this.conn.findQuestion(this.id) !== this) {
      if (this.state === QuestionState.IN_PROGRESS) {
        throw new Error(`question popped but not done`);
      }

      const client = clientFromResolution(transform, this.obj, this.err);
      return this.conn.call(client, ccall);
    }

    const pipeq = this.conn.newQuestion(ccall.method);
    const msg = newMessage();
    const msgCall = msg.initCall();
    msgCall.setQuestionId(pipeq.id);
    msgCall.setInterfaceId(ccall.method.interfaceID);
    msgCall.setMethodId(ccall.method.methodID);
    const target = msgCall.initTarget();
    const a = target.initPromisedAnswer();
    a.setQuestionId(this.id);
    transformToPromisedAnswer(a, transform);
    const payload = msgCall.initParams();
    this.conn.fillParams(payload, ccall);
    throw new Error(`stub!`);
  }

  pipelineClose() {
    throw new Error(`stub!`);
  }
}

