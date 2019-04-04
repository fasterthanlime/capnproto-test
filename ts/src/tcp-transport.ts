import { Transport, Message, RPCMessage } from "capnp-ts";
import { dumpRPCMessage } from "./dump-rpc-message";
import { Socket } from "net";

const WORD_SIZE = 8;

export class TCPTransport implements Transport {
  socket: Socket;

  constructor(socket: Socket) {
    this.socket = socket;
  }

  sendMessage(msg: RPCMessage) {
    dumpRPCMessage(">>", msg);
    let data = new Uint8Array(msg.segment.message.toArrayBuffer());
    this.socket.write(data);
  }

  async recvMessage() {
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

    const msg = new Message(messageBuf, false /* packed */).getRoot(RPCMessage);
    dumpRPCMessage(">>", msg);
    return msg;
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

  close() {
    this.socket.destroy();
  }
}
