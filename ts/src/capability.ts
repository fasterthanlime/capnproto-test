import * as capnp from "capnp-ts";
import { Struct, StructCtor } from "capnp-ts";
import { Segment } from "capnp-ts/lib/serialization/segment";
import { PointerType } from "capnp-ts/lib/serialization/pointers/pointer-type";
import { getTargetPointerType } from "capnp-ts/lib/serialization/pointers/pointer";
import { clientOrNull } from "./rpc";

export class ErrNullClient extends Error {
  constructor() {
    super(`capnp: call on null client`);
  }
}

export interface SuperMessage extends capnp.Message {
  capTable: (Client | null)[];
}

// An Interface is a reference to a client in a message's capability table.
export interface Interface {
  seg: Segment;
  cap: CapabilityID;
}

// A CapabilityID is an index into a message's capability table.
export type CapabilityID = number;

// A Client represents an Cap'n Proto interface type.
export interface Client {
  // call starts executing a method and returns an answer that will hold
  // the resulting struct.  The call's parameters must be placed before
  // call() returns.
  //
  // Calls are delivered to the capability in the order they are made.
  // This guarantee is based on the concept of a capability
  // acknowledging delivery of a call: this is specific to an
  // implementation of Client.  A type that implements Client must
  // guarantee that if foo() then bar() is called on a client, that
  // acknowledging foo() happens before acknowledging bar().
  call<P extends Struct, R extends Struct>(call: Call<P, R>): Answer<R>;

  // close releases any resources associated with this client.
  // No further calls to the client should be made after calling Close.
  close(): void;
}

// The Call type holds the record for an outgoing interface call.
export type Call<P extends Struct, R extends Struct> =
  | FuncCall<P, R>
  | DataCall<P, R>;

type BaseCall<P extends Struct, R extends Struct> = {
  // Method is the interface ID and method ID, along with the optional name, of
  // the method to call.
  method: Method<P, R>;
};

type FuncCall<P extends Struct, R extends Struct> = BaseCall<P, R> & {
  // ParamsFunc is a function that populates an allocated struct with
  // the parameters for the call.  ParamsSize determines the size of the
  // struct to allocate.  This is used when application code is using a
  // client.  These settings should be set together; they are mutually
  // exclusive with Params.
  paramsFunc: (params: P) => void;
};

type DataCall<P extends Struct, R extends Struct> = BaseCall<P, R> & {
  // Params is a struct containing parameters for the call.
  // This should be set when the RPC system receives a call for an
  // exported interface.  It is mutually exclusive with ParamsFunc
  // and ParamsSize.
  params: P;
};

export function isFuncCall<P extends Struct, R extends Struct>(
  call: Call<P, R>,
): call is FuncCall<P, R> {
  return !!(call as FuncCall<P, R>).paramsFunc;
}

export function isDataCall<P extends Struct, R extends Struct>(
  call: Call<P, R>,
): call is DataCall<P, R> {
  return !isFuncCall(call);
}

// Copy clones a call, ensuring that its Params are placed.
// If Call.ParamsFunc is nil, then the same Call will be returned.
export function copyCall<P extends Struct, R extends Struct>(
  call: Call<P, R>,
  s?: Segment,
): Call<P, R> {
  if (isDataCall(call)) {
    return call;
  }

  const p = placeParams(call, s);
  return {
    method: call.method,
    params: p,
  };
}

export function placeParams<P extends Struct, R extends Struct>(
  call: Call<P, R>,
  s?: Segment,
): P {
  if (isDataCall(call)) {
    return call.params;
  }

  if (s) {
    // TODO: figure out how to place in same segment
    console.warn(`placeParams: ignoring specified segment for now`);
  }
  const msg = new capnp.Message();
  let p = new call.method.ParamsClass(msg.getSegment(0), 0);
  capnp.Struct.initStruct(call.method.ParamsClass._capnp.size, p);
  call.paramsFunc(p);
  return p;
}

// An Answer is the deferred result of a client call, which is usually wrapped
// by a Pipeline.
export interface Answer<R extends Struct> {
  // struct waits until the call is finished and returns the result.
  struct(): Promise<R>;

  // The following methods are the same as in Client except with an added
  // transform parameter -- a path to the interface to use.
  pipelineCall<R2 extends Struct>(
    transform: PipelineOp[],
    call: Call<R, R2>,
  ): Answer<R2>;
  pipelineClose(transform: PipelineOp[]): void;
}

// A Pipeline is a generic wrapper for an answer
export class Pipeline<R extends Struct> {
  pipelineClient?: PipelineClient<R>;

  // Returns a new Pipeline based on an answer
  constructor(
    public ResultsClass: StructCtor<R>,
    public answer: Answer<any>,
    public op: PipelineOp = { field: 0 },
    public parent?: Pipeline<any>,
  ) {}

  // transform returns the operations needed to transform the root answer
  // into the value p represents.
  transform(): PipelineOp[] {
    let xform: PipelineOp[] = [];
    for (let q: Pipeline<any> | null = this; !!q.parent; q = q.parent) {
      xform.unshift(q.op);
    }
    return xform;
  }

  // Struct waits until the answer is resolved and returns the struct
  // this pipeline represents.
  async struct(): Promise<R | null> {
    let s = await this.answer.struct();
    let ptr = transformPtr(s, this.transform());
    if (!ptr) {
      return null;
    }
    return Struct.getAs(this.ResultsClass, ptr);
  }

  // client returns the client version of this pipeline
  client(): PipelineClient<R> {
    if (!this.pipelineClient) {
      this.pipelineClient = new PipelineClient(this);
    }
    return this.pipelineClient;
  }

  // getPipeline returns a derived pipeline which yields the pointer field given
  getPipeline<RR extends Struct>(
    ResultsClass: StructCtor<RR>,
    off: number,
    defaultValue?: capnp.Pointer,
  ): Pipeline<RR> {
    return new Pipeline(
      ResultsClass,
      this.answer,
      <PipelineOp>{ field: off, defaultValue },
      this,
    );
  }
}

export class PipelineClient<R extends Struct> implements Client {
  pipeline: Pipeline<R>;

  constructor(pipeline: Pipeline<R>) {
    this.pipeline = pipeline;
  }

  transform(): PipelineOp[] {
    return this.pipeline.transform();
  }

  call<P extends Struct, R extends Struct>(call: Call<P, R>): Answer<R> {
    return this.pipeline.answer.pipelineCall(this.transform(), call);
  }

  close() {
    return this.pipeline.answer.pipelineClose(this.transform());
  }
}

export abstract class FixedAnswer<R extends Struct> implements Answer<R> {
  abstract structSync(): R;

  async struct(): Promise<R> {
    return this.structSync();
  }

  abstract pipelineCall<R2 extends Struct>(
    transform: PipelineOp[],
    call: Call<R, R2>,
  ): Answer<R2>;
  abstract pipelineClose(transform: PipelineOp[]): void;
}

export class ImmediateAnswer<R extends Struct> extends FixedAnswer<R> {
  constructor(public s: R) {
    super();
  }

  structSync() {
    return this.s;
  }

  findClient(transform: PipelineOp[]): Client {
    const p = transformPtr(this.s, transform);
    return clientOrNull(interfaceToClient(pointerToInterface(p)));
  }

  pipelineCall<R2 extends Struct>(
    transform: PipelineOp[],
    call: Call<R, R2>,
  ): Answer<R2> {
    return this.findClient(transform).call(call);
  }

  pipelineClose(transform: PipelineOp[]): void {
    this.findClient(transform).close();
  }
}

export class ErrorAnswer extends FixedAnswer<any> {
  err: Error;

  constructor(err: Error) {
    super();
    this.err = err;
  }

  structSync() {
    throw this.err;
  }

  pipelineCall<R2 extends Struct>(
    _transform: PipelineOp[],
    _call: Call<any, R2>,
  ): Answer<R2> {
    return this;
  }

  pipelineClose(_transform: PipelineOp[]): void {
    throw this.err;
  }
}

// A PipelineOp describes a step in transforming a pipeline.
// It maps closely with the PromisedAnswer.Op struct in rpc.capnp.
export interface PipelineOp {
  field: number;
  defaultValue?: capnp.Pointer;
}

// A Method identifies a method along with an optional
// human-readable description of the method
export interface Method<P extends Struct, R extends Struct> {
  interfaceID: capnp.Uint64;
  methodID: number;

  // Canonical name of the interface. May be empty.
  interfaceName?: string;
  // Method name as it appears in the schema. May be empty.
  methodName?: string;

  ParamsClass: StructCtor<P>;
  ResultsClass: StructCtor<R>;
}

// transformPtr applies a sequence of pipeline operations to a pointer
// and returns the result.
export function transformPtr(
  p: capnp.Pointer,
  transform: PipelineOp[],
): capnp.Pointer {
  let n = transform.length;
  if (n === 0) {
    return p;
  }
  let s = pointerToStruct(p);
  if (!s) {
    return p;
  }

  for (const op of transform) {
    s = capnp.Struct.getPointer(op.field, s);
  }

  return s;
}

export function pointerToStruct(p: capnp.Pointer): capnp.Struct | null {
  if (getTargetPointerType(p) === PointerType.STRUCT) {
    return new capnp.Struct(
      p.segment,
      p.byteOffset,
      p._capnp.depthLimit,
      p._capnp.compositeIndex,
    );
  }
  return null;
}

export function pointerToInterface(p: capnp.Pointer): Interface {
  // see https://capnproto.org/encoding.html, interfaces are
  // "other" pointers.
  if (getTargetPointerType(p) === PointerType.OTHER) {
    return <Interface>{
      seg: p.segment,
      cap: p.segment.getUint32(p.byteOffset + 4), // FIXME: that definitely belongs in capnp-ts somewhere
    };
  }
  throw new Error(
    `called pointerToInterface on pointer to non-interface: ${p}`,
  );
}

export function isInterfaceValid(i: Interface): boolean {
  return !!i.seg;
}

export function interfaceToClient(i: Interface): Client | null {
  if (!i.seg) {
    return null;
  }

  const tab = (i.seg.message as SuperMessage).capTable;
  if (!tab || i.cap >= tab.length) {
    return null;
  }

  return tab[i.cap];
}

export class ErrorClient implements Client {
  err: Error;

  constructor(err: Error) {
    this.err = err;
  }

  call<P extends Struct, R extends Struct>(_call: Call<P, R>): Answer<R> {
    // FIXME: ErrorAnswer ?
    throw this.err;
  }

  close() {
    throw this.err;
  }
}
