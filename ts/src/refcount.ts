import * as weak from "weak";
import { Client, Call, Answer } from "./capability";

export class RefCount implements Client {
  refs: number;
  _client: Client;

  constructor(c: Client) {
    this._client = c;
    this.refs = 1;
  }

  call(cl: Call): Answer {
    return this._client.call(cl);
  }

  client(): Client {
    return this._client;
  }

  close() {
    return this._client.close();
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

  call(cl: Call): Answer {
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
