import * as capnp from "capnp-ts";
import { Transport } from "./transport";
import {
  Message,
  Message_Which,
  Return,
  Return_Which,
  Exception,
  PromisedAnswer,
  Payload,
  CapDescriptor,
} from "capnp-ts/lib/std/rpc.capnp";
import { Segment } from "capnp-ts/lib/serialization/segment";
import { RefCount, Ref } from "./refcount";
import { Question, QuestionState } from "./question";
import {
  Client,
  Pipeline,
  PipelineOp,
  Method,
  Call,
  Answer,
  ErrorClient,
  PipelineClient,
  SuperMessage,
  FixedAnswer,
  transformPtr,
  pointerToInterface,
  interfaceToClient,
  placeParams,
} from "./capability";

export class RPCError extends Error {
  constructor(public exception: Exception) {
    super(`Cap'n Proto Exception: ${exception.getReason()}`);
  }
}

export class Conn {
  transport: Transport;

  questionID = new IDGen();
  questions = [] as (Question | null)[];

  exportID = new IDGen();
  exports = [] as (Export | null)[];

  onError?: (err: Error) => void;

  constructor(transport: Transport) {
    this.transport = transport;
    this.questionID = new IDGen();
    this.questions = [];

    this.startWork();
  }

  async bootstrap(): Promise<Client> {
    const q = this.newQuestion();
    const msg = newMessage();
    const boot = msg.initBootstrap();
    boot.setQuestionId(q.id);

    this.transport.sendMessage(msg);
    return await new Pipeline(q).client();
  }

  startWork() {
    (async () => {
      for (;;) {
        const m = await this.transport.recvMessage();
        this.handleMessage(m);
      }
    })().catch(e => {
      if (this.onError) {
        this.onError(e);
      } else {
        console.log(`Cap'n Proto RPC error: `, e.stack);
      }
    });
  }

  handleMessage(m: Message) {
    switch (m.which()) {
      case Message.UNIMPLEMENTED: {
        // no-op for now to avoid feedback loop
        break;
      }
      case Message.ABORT: {
        this.shutdown(new RPCError(m.getAbort()));
        break;
      }
      case Message.RETURN: {
        this.handleReturnMessage(m);
        break;
      }
      default: {
        console.warn(`Ignoring message ${Message_Which[m.which()]}`);
      }
    }
  }

  handleReturnMessage(m: Message): Error | null {
    var s: capnp.Struct;

    const ret = m.getReturn();
    const id = ret.getAnswerId();
    const q = this.popQuestion(id);
    if (!q) {
      return new Error(`received return for unknown question id=${id}`);
    }

    if (ret.getReleaseParamCaps()) {
      for (const s of q.paramCaps) {
        this.releaseExport(id, 1);
      }
    }

    let releaseResultCaps = true;
    switch (ret.which()) {
      case Return.RESULTS: {
        releaseResultCaps = false;
        const results = ret.getResults();

        break;
      }
      default: {
        console.warn(`Unhandled return which: ${Return_Which[ret.which()]}`);
      }
    }

    return null;
  }

  findExport(id: number): Export | null {
    if (id > this.exports.length) {
      return null;
    }
    return this.exports[id];
  }

  addExport(client: Client): number {
    for (let i = 0; i < this.exports.length; i++) {
      let e = this.exports[i];
      if (e && isSameClient(e.rc._client, client)) {
        e.wireRefs++;
        return i;
      }
    }

    const id = this.exportID.next();
    const rc = new RefCount(client);
    let _export: Export = {
      id,
      rc,
      client: rc.newRef(),
      wireRefs: 1,
    };
    if (id === this.exports.length) {
      this.exports.push(_export);
    } else {
      this.exports[id] = _export;
    }
    return id;
  }

  releaseExport(id: number, refs: number) {
    const e = this.findExport(id);
    if (!e) {
      return;
    }
    e.wireRefs -= refs;
    if (e.wireRefs > 0) {
      return;
    }
    if (e.wireRefs < 0) {
      this.error(`warning: export ${id} has negative refcount (${e.wireRefs})`);
    }
    e.client.close();
    this.exports[id] = null;
    this.exportID.remove(id);
  }

  error(s: string) {
    console.error(s);
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

  findQuestion(id: number): Question | null {
    if (id > this.questions.length) {
      return null;
    }
    return this.questions[id];
  }

  popQuestion(id: number): Question | null {
    const q = this.findQuestion(id);
    if (!q) {
      return q;
    }
    this.questions[id] = null;
    this.questionID.remove(id);
    return q;
  }

  shutdown(err: Error) {
    console.error(`Shutdown (stub): `, err.stack);
    this.transport.close();
  }

  call(_client: Client, _call: Call): Answer {
    throw new Error(`Conn.call: stub!`);
  }

  fillParams(payload: Payload, cl: Call) {
    const params = placeParams(cl, payload.segment);
    payload.setContent(params);
    this.makeCapTable(payload.segment, length => payload.initCapTable(length));
  }

  makeCapTable(
    s: Segment,
    init: (length: number) => capnp.List<CapDescriptor>,
  ): void {
    const msg = s.message as SuperMessage;
    const msgtab = msg.capTable;
    if (!msgtab) {
      return;
    }
    const t = init(msgtab.length);
    for (let i = 0; i < msgtab.length; i++) {
      let client = msgtab[i];
      const desc = t.get(i);
      if (!client) {
        desc.setNone();
        continue;
      }
      this.descriptorForClient(desc, client);
    }
  }

  // descriptorForClient fills desc for client, adding it to the export
  // table if necessary.  The caller must be holding onto c.mu.
  descriptorForClient(desc: CapDescriptor, _client: Client): void {
    {
      dig: for (let client = _client; ; ) {
        // cf. https://sourcegraph.com/github.com/capnproto/go-capnproto2@e1ae1f982d9908a41db464f02861a850a0880a5a/-/blob/rpc/introspect.go#L113
        // TODO: importClient
        // TODO: fulfiller.EmbargoClient
        // TODO: embargoClient
        // TODO: queueClient
        // TODO: localAnswerClient
        if (client instanceof Ref) {
          client = client.client();
        } else if (client instanceof PipelineClient) {
          const p = client.pipeline;
          const ans = p.answer;
          const transform = p.transform();
          // TODO: fulfiller
          if (ans instanceof FixedAnswer) {
            let s: capnp.Struct | undefined;
            let err: Error | undefined;
            try {
              s = ans.structSync();
            } catch (e) {
              err = e;
            }
            client = clientFromResolution(transform, s, err);
          } else if (ans instanceof Question) {
            if (ans.state !== QuestionState.IN_PROGRESS) {
              client = clientFromResolution(transform, ans.obj, ans.err);
              continue;
            }
            if (ans.conn != this) {
              // TODO: figure out when this can happen?
              break dig;
            }
            const a = desc.initReceiverAnswer();
            a.setQuestionId(ans.id);
            transformToPromisedAnswer(a, p.transform());
            return;
          } else {
            break dig;
          }
        } else {
          break dig;
        }
      }
    }

    const id = this.addExport(_client);
    desc.setSenderHosted(id);
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

interface Export {
  id: number;
  rc: RefCount;
  client: Client;
  wireRefs: number;
}

export function newMessage(): Message {
  return new capnp.Message().initRoot(Message);
}

export function isSameClient(c: Client, d: Client): boolean {
  const norm = (c: Client): Client => {
    // TODO: normalize, see https://sourcegraph.com/github.com/capnproto/go-capnproto2@e1ae1f982d9908a41db464f02861a850a0880a5a/-/blob/rpc/introspect.go#L209
    return c;
  };
  return norm(c) === norm(d);
}

export function clientFromResolution(
  transform: PipelineOp[],
  obj?: capnp.Pointer,
  err?: Error,
): Client {
  if (err) {
    return new ErrorClient(err);
  }

  if (!obj) {
    return new ErrorClient(new Error(`null obj!`));
  }

  let out = transformPtr(obj, transform);
  return clientOrNull(interfaceToClient(pointerToInterface(out)));
}

export function clientOrNull(client: Client | null): Client {
  return client ? client : new ErrorClient(new Error(`null client`));
}

export function transformToPromisedAnswer(
  answer: PromisedAnswer,
  transform: PipelineOp[],
) {
  const opList = answer.initTransform(transform.length);
  for (let i = 0; i < transform.length; i++) {
    let op = transform[i];
    opList.get(i).setGetPointerField(op.field);
  }
}
