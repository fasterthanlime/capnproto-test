import { Deferred } from "ts-deferred";
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
  CapDescriptor_Which,
  PromisedAnswer_Op,
  PromisedAnswer_Op_Which,
} from "capnp-ts/lib/std/rpc.capnp";
import { Segment } from "capnp-ts/lib/serialization/segment";
import { RefCount, Ref } from "./refcount";
import { ImportClient } from "./tables";
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
  ErrNullClient,
  isFuncCall,
  isDataCall,
} from "./capability";
import { LocalAnswerClient } from "./answer";

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

  imports = {} as { [key: number]: ImportEntry };
  answers = {} as { [key: number]: AnswerEntry };

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
        // TODO: reply with unimplemented if we have a problem here
        this.populateMessageCapTable(results);
        break;
      }
      default: {
        console.warn(`Unhandled return which: ${Return_Which[ret.which()]}`);
      }
    }

    return null;
  }

  populateMessageCapTable(payload: Payload) {
    const msg = payload.segment.message;
    let ctab = payload.getCapTable();
    ctab.forEach(desc => {
      switch (desc.which()) {
        case CapDescriptor.NONE: {
          addCap(msg, null);
          break;
        }
        case CapDescriptor.SENDER_HOSTED: {
          const id = desc.getSenderHosted();
          const client = this.addImport(id);
          addCap(msg, client);
          break;
        }
        case CapDescriptor.SENDER_PROMISE: {
          // Apparently, this is a hack, see
          // https://sourcegraph.com/github.com/capnproto/go-capnproto2@e1ae1f982d9908a41db464f02861a850a0880a5a/-/blob/rpc/rpc.go#L549
          const id = desc.getSenderPromise();
          const client = this.addImport(id);
          addCap(msg, client);
          break;
        }
        case CapDescriptor.RECEIVER_HOSTED: {
          const id = desc.getReceiverHosted();
          const e = this.findExport(id);
          if (!e) {
            throw new Error(
              `rpc: capability table references unknown export ID ${id}`,
            );
          }
          addCap(msg, e.rc.ref());
          break;
        }
        case CapDescriptor.RECEIVER_ANSWER: {
          const recvAns = desc.getReceiverAnswer();
          const id = recvAns.getQuestionId();
          const a = this.answers[id];
          if (!a) {
            throw new Error(
              `rpc: capability table references unknown answer ID ${id}`,
            );
          }
          const recvTransform = recvAns.getTransform();
          const transform = promisedAnswerOpsToTransform(recvTransform);
          addCap(msg, answerPipelineClient(a, transform));
          break;
        }
        default:
          throw new Error(
            `unhandled cap descriptor which: ${
              CapDescriptor_Which[desc.which()]
            }`,
          );
      }
    });
  }

  addImport(id: number): Client {
    let ent = this.imports[id];
    if (ent) {
      ent.refs++;
      return ent.rc.ref();
    }
    const client = new ImportClient(this, id);
    const { rc, ref } = RefCount.new(client);
    this.imports[id] = {
      rc,
      refs: 1,
    };
    return ref;
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
    const { rc, ref } = RefCount.new(client);
    let _export: Export = {
      id,
      rc,
      client: ref,
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
    if (isDataCall(cl)) {
      throw new Error(`fillParams with datacall: stub!`);
    } else {
      const msg = new capnp.Message();
      const params = new capnp.Struct(msg.getSegment(0), 0);
      capnp.Struct.initStruct(cl.paramsSize, params);
      cl.paramsFunc(params);
      payload.setContent(params);
    }
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
        // TODO: fulfiller.EmbargoClient
        // TODO: embargoClient
        // TODO: queueClient
        // TODO: localAnswerClient
        if (client instanceof ImportClient) {
          if (client.conn !== this) {
            break dig;
          }
          desc.setReceiverHosted(client.id);
          return;
        } else if (client instanceof Ref) {
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
  return client ? client : new ErrorClient(new ErrNullClient());
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

export function promisedAnswerOpsToTransform(
  list: capnp.List<PromisedAnswer_Op>,
): PipelineOp[] {
  let transform: PipelineOp[] = [];
  list.forEach(op => {
    switch (op.which()) {
      case PromisedAnswer_Op.GET_POINTER_FIELD: {
        transform.push(<PipelineOp>{
          field: op.getGetPointerField(),
        });
        break;
      }
      case PromisedAnswer_Op.NOOP: {
        // no-op
        break;
      }
    }
  });
  return transform;
}

export function addCap(_msg: capnp.Message, client: Client | null): number {
  let msg = _msg as SuperMessage;
  if (!msg.capTable) {
    msg.capTable = [];
  }
  let id = msg.capTable.length;
  msg.capTable.push(client);
  return id;
}

export interface ImportEntry {
  rc: RefCount;
  refs: number;
}

export interface AnswerEntry {
  id: number;
  resultCaps: number[];
  conn: Conn;

  done: boolean;
  obj?: capnp.Pointer;
  err?: Error;
  deferred: Deferred<capnp.Pointer>;
}

export function answerPipelineClient(
  a: AnswerEntry,
  transform: PipelineOp[],
): Client {
  return new LocalAnswerClient(a, transform);
}
