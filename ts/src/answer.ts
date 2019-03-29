import { AnswerEntry, clientFromResolution } from "./rpc";
import { PipelineOp, Client, Answer, Call } from "./capability";
import { Fulfiller } from "./fulfiller";

export class LocalAnswerClient implements Client {
  a: AnswerEntry;
  transform: PipelineOp[];

  constructor(a: AnswerEntry, transform: PipelineOp[]) {
    this.a = a;
    this.transform = transform;
  }

  call(call: Call): Answer {
    if (this.a.done) {
      return clientFromResolution(this.transform, this.a.obj, this.a.err).call(
        call,
      );
    }
    const f = new Fulfiller();
    try {
    } catch (e) {}
    return f;
  }

  close() {}
}
