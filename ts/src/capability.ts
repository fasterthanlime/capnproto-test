import * as capnp from "capnp-ts";
import { Segment } from "capnp-ts/lib/serialization/segment";
import { PointerType } from "capnp-ts/lib/serialization/pointers/pointer-type";
import { getTargetPointerType } from "capnp-ts/lib/serialization/pointers/pointer";

export interface SuperMessage extends capnp.Message {
  capTable: Client[];
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
  call(call: Call): Answer;

  // close releases any resources associated with this client.
  // No further calls to the client should be made after calling Close.
  close(): void;
}

// The Call type holds the record for an outgoing interface call.
export interface Call {
  // Method is the interface ID and method ID, along with the optional name, of
  // the method to call.
  method: Method;

  // Params is a struct containing parameters for the call.
  // This should be set when the RPC system receives a call for an
  // exported interface.  It is mutually exclusive with ParamsFunc
  // and ParamsSize.
  params: capnp.Struct;

  // ParamsFunc is a function that populates an allocated struct with
  // the parameters for the call.  ParamsSize determines the size of the
  // struct to allocate.  This is used when application code is using a
  // client.  These settings should be set together; they are mutually
  // exclusive with Params.
  paramsFunc: (s: capnp.Struct) => void;
  paramsSize: capnp.ObjectSize;
}

// TODO: PlaceParams

// An Answer is the deferred result of a client call, which is usually wrapped
// by a Pipeline.
export interface Answer {
  // struct waits until the call is finished and returns the result.
  struct(): Promise<capnp.Struct>;

  // The following methods are the same as in Client except with an added
  // transform parameter -- a path to the interface to use.
  pipelineCall(transform: PipelineOp[], call: Call): Answer;
  pipelineClose(transform: PipelineOp[]): void;
}

// A Pipeline is a generic wrapper for an answer
export class Pipeline {
  answer: Answer;
  parent?: Pipeline;
  op: PipelineOp = { field: 0 };

  // Returns a new Pipeline based on an answer
  constructor(answer: Answer) {
    this.answer = answer;
  }

  // transform returns the operations needed to transform the root answer
  // into the value p represents.
  transform(): PipelineOp[] {
    let xform: PipelineOp[] = [];
    for (let q: Pipeline | null = this; !!q.parent; q = q.parent) {
      xform.unshift(q.op);
    }
    return xform;
  }

  // Struct waits until the answer is resolved and returns the struct
  // this pipeline represents.
  async struct(): Promise<capnp.Struct> {
    let s = await this.answer.struct();
    let ptr = transformPtr();
  }

  // client returns the client version of this pipeline
  client(): PipelineClient {
    throw new Error("stub!");
  }
}

export class PipelineClient extends Pipeline {}

// A PipelineOp describes a step in transforming a pipeline.
// It maps closely with the PromisedAnswer.Op struct in rpc.capnp.
export interface PipelineOp {
  field: number;
  defaultValue?: capnp.Pointer;
}

// A Method identifies a method along with an optional
// human-readable description of the method
export interface Method {
  interfaceID: number;
  methodID: number;

  // Canonical name of the interface. May be empty.
  interfaceName?: string;
  // Method name as it appears in the schema. May be empty.
  methodName?: string;
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
  for (const op of transform) {
    s = capnp.Struct.getStruct(
      op.field,
      capnp.Struct as any, // FIXME: dirty..
      s,
      op.defaultValue,
    );
  }
  return s;
}

export function pointerToStruct(p: capnp.Pointer): capnp.Pointer {
  if (getTargetPointerType(p) === PointerType.STRUCT) {
    return new capnp.Struct(
      p.segment,
      p.byteOffset,
      p._capnp.depthLimit,
      p._capnp.compositeIndex,
    );
  }
  throw new Error(`called pointerToStruct on pointer to non-struct: ${p}`);
}

export function pointerToInterface(p: capnp.Pointer): Interface {
  // see https://capnproto.org/encoding.html, interfaces are
  // "other" pointers.
  if (getTargetPointerType(p) === PointerType.OTHER) {
    let i: Interface = {
      seg: p.segment,
      cap: p.segment.getUint32(p.byteOffset + 4), // FIXME: that definitely belongs in capnp-ts somewhere
    };
  }
  throw new Error(
    `called pointerToInterface on pointer to non-interface: ${p}`,
  );
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
