import * as weak from "weak";
import { Struct } from "capnp-ts";
import { Client, Call, Answer, ErrorClient } from "./capability";

export class ErrZeroRef extends Error {
  constructor() {
    super(`rpc: Ref() called on zeroed refcount`);
  }
}

export class ErrClosed extends Error {
  constructor() {
    super(`rpc: Close() called on closed client`);
  }
}

export class RefCount implements Client {
  refs: number;
  _client: Client;

  constructor(c: Client) {
    this._client = c;
    this.refs = 1;
  }

  static new(c: Client) {
    const rc = new RefCount(c);
    const ref = rc.newRef();
    return { rc, ref };
  }

  call<P extends Struct, R extends Struct>(cl: Call<P, R>): Answer<R> {
    return this._client.call(cl);
  }

  client(): Client {
    return this._client;
  }

  close() {
    return this._client.close();
  }

  ref(): Client {
    if (this.refs <= 0) {
      return new ErrorClient(new ErrZeroRef());
    }
    this.refs++;
    return this.newRef();
  }

  newRef(): Ref {
    return new Ref(this);
  }

  decref() {
    this.refs--;
    if (this.refs === 0) {
      this._client.close();
    }
  }
}

export class Ref implements Client {
  rc: RefCount;
  closeState: { closed: boolean };

  constructor(rc: RefCount) {
    this.rc = rc;
    let closeState = { closed: false };
    this.closeState = closeState;
    weak(this, () => {
      if (!closeState.closed) {
        closeState.closed = true;
        rc.decref();
      }
    });
  }

  call<P extends Struct, R extends Struct>(cl: Call<P, R>): Answer<R> {
    return this.rc.call(cl);
  }

  client(): Client {
    return this.rc._client;
  }

  close() {
    if (!this.closeState.closed) {
      this.closeState.closed = true;
      this.rc.decref();
    }
  }
}
