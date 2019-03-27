import * as capnp from "capnp-ts";
import {
  Message,
  Message_Which,
  Return,
  Return_Which,
  CapDescriptor,
  CapDescriptor_Which,
} from "capnp-ts/lib/std/rpc.capnp";
import { Socket } from "net";

const WORD_SIZE = 8;

export class Transport {
  socket: Socket;

  constructor(socket: Socket) {
    this.socket = socket;
  }

  dumpMessage(prefix: string, root: Message) {
    console.log("=====================");
    let log = (...args: any[]) => {
      console.log(prefix, ...args);
    };

    log(`message: ${Message_Which[root.which()]}`);
    switch (root.which()) {
      case Message.BOOTSTRAP: {
        const bootstrap = root.getBootstrap();
        log(`questionId = ${bootstrap.getQuestionId()}`);
        break;
      }
      case Message.RETURN: {
        const _return = root.getReturn();
        log(`answerId = ${_return.getAnswerId()}`);
        log(`releaseParamsCaps = ${_return.getReleaseParamCaps()}`);

        log(`which = ${Return_Which[_return.which()]}`);
        switch (_return.which()) {
          case Return.RESULTS: {
            const results = _return.getResults();
            log(`results = ${results}`);
            const capTable = results.getCapTable();
            log(`capTable length = ${capTable.getLength()}`);
            for (let i = 0; i < capTable.getLength(); i++) {
              let cap = capTable.get(i);
              log(`cap which ${i} = ${CapDescriptor_Which[cap.which()]}`);
              switch (cap.which()) {
                case CapDescriptor.SENDER_HOSTED: {
                  let sh = cap.getSenderHosted();
                  log(`sender hosted =`, sh);
                  break;
                }
                default:
                  log(`unknown cap descriptor`);
              }
            }
            break;
          }
          default:
            console.log(`Unknown return type`);
        }
        break;
      }
      default:
        console.log(`Unknown message type`);
    }
  }

  sendMessage(msg: capnp.Message) {
    this.dumpMessage(">>", msg.getRoot(Message));

    let data = new Uint8Array(msg.toArrayBuffer());
    this.socket.write(data);
  }

  async receiveMessage() {
    let offset = 0;

    let bufNumSegments = await this.readBytes(4);
    offset += 4;

    let N = bufNumSegments.readUInt32LE(0) + 1;

    let segmentSizeSize = N * 4;
    offset += segmentSizeSize;

    if (offset % WORD_SIZE !== 0) {
      let padding = WORD_SIZE - (offset % WORD_SIZE);
      offset += padding;
      segmentSizeSize += padding;
    }

    let bufSegmentsSize = await this.readBytes(segmentSizeSize);
    let wordsPerSegment = new Array(N);
    for (let i = 0; i < N; i++) {
      wordsPerSegment[i] = bufSegmentsSize.readUInt32LE(i * 4);
    }

    let totalSegmentWords = 0;
    for (const words of wordsPerSegment) {
      totalSegmentWords += words;
    }
    const totalSegmentSize = totalSegmentWords * WORD_SIZE;

    let bufSegments = await this.readBytes(totalSegmentSize);
    let messageBuf = Buffer.concat([
      bufNumSegments,
      bufSegmentsSize,
      bufSegments,
    ]);

    const msg = new capnp.Message(messageBuf, false /* packed */);
    return msg.getRoot(Message);
  }

  async readBytes(len: number): Promise<Buffer> {
    if (!len) {
      throw new Error(`invalid read length: ${len}`);
    }

    for (;;) {
      let buf = this.socket.read(len) as Buffer;
      if (buf) {
        return buf;
      }
      await this.readable();
    }
  }

  readable(): Promise<boolean> {
    return new Promise(resolve => this.socket.on("readable", resolve));
  }
}