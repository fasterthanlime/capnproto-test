import { Deferred } from "ts-deferred";
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
  derived: PipelineOp[][] = [];
  deferred = new Deferred<capnp.Pointer>();

  constructor(conn: Conn, id: number, method?: Method) {
    this.conn = conn;
    this.id = id;
    this.method = method;
  }

  async struct(): Promise<capnp.Struct> {
    return await this.deferred.promise;
  }

  fulfill(obj: capnp.Pointer) {
    // TODO: derived, see https://sourcegraph.com/github.com/capnproto/go-capnproto2@e1ae1f982d9908a41db464f02861a850a0880a5a/-/blob/rpc/question.go#L105
    if (this.state !== QuestionState.IN_PROGRESS) {
      throw new Error(`question.fulfill called more than once`);
    }
    this.obj = obj;
    this.state = QuestionState.RESOLVED;
    this.deferred.resolve(obj);
  }

  pipelineCall(transform: PipelineOp[], ccall: Call): Answer {
    if (this.conn.findQuestion(this.id) !== this) {
      if (this.state === QuestionState.IN_PROGRESS) {
        throw new Error(`question popped but not done`);
      }

      const client = clientFromResolution(transform, this.obj, this.err);
      // TODO: check that this is fine - this was conn.lockedCall
      return client.call(ccall);
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
    this.conn.transport.sendMessage(msg);
    this.addPromise(transform);
    return pipeq;
  }

  addPromise(transform: PipelineOp[]) {
    for (const d of this.derived) {
      if (transformsEqual(transform, d)) {
        return;
      }
    }
    this.derived.push(transform);
  }

  pipelineClose() {
    throw new Error(`stub!`);
  }
}

export function transformsEqual(t: PipelineOp[], u: PipelineOp[]): boolean {
  if (t.length != u.length) {
    return false;
  }

  for (const i in t) {
    if (t[i].field != u[i].field) {
      return false;
    }
  }
  return true;
}
