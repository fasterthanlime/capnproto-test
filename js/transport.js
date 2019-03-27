const WORD_SIZE = 8;
const capnp = require("capnp-ts");
const { Message } = require("capnp-ts/lib/std/rpc.capnp.js");

class Transport {
  constructor(conn) {
    this.conn = conn;

    this.promise = new Promise((resolve, reject) => {
      this.receiveLoop().catch(e => {
        console.error(`capn proto RPC error: `, e);
        reject(e);
      });
    });
  }

  sendMessage(msg) {
    let data = new Uint8Array(msg.toArrayBuffer());
    this.conn.socket.write(
      // data
      data,
      // encoding. null = binary, defaults to utf8
      null
    );
  }

  async receiveLoop() {
    for (;;) {
      const msg = await this.receiveMessage();
      console.log(`Received message: `, msg);
    }
  }

  async receiveMessage() {
    let offset = 0;

    let bufNumSegments = await this.readBytes(4);
    offset += 4;

    let N = bufNumSegments.readUInt32LE() + 1;
    console.log(`Receiving N=${N} segments`);

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
    console.log(`Words per segment:`, wordsPerSegment);

    let totalSegmentWords = 0;
    for (const words of wordsPerSegment) {
      totalSegmentWords += words;
    }
    const totalSegmentSize = totalSegmentWords * WORD_SIZE;
    console.log(`Total segment size: `, totalSegmentSize);

    let bufSegments = await this.readBytes(totalSegmentSize);
    let messageBuf = Buffer.concat([
      bufNumSegments,
      bufSegmentsSize,
      bufSegments
    ]);
    console.log(`Final message buf: `, messageBuf);
    console.log(`Final message buf len: `, messageBuf.length);

    const msg = new capnp.Message(messageBuf, false /* packed */);
    const rpcMessage = msg.getRoot(Message);
    return rpcMessage;
  }

  async readBytes(len) {
    if (!len) {
      throw new Error(`invalid read length: ${len}`);
    }

    for (;;) {
      let buf = this.conn.socket.read(len);
      if (buf) {
        console.log(`Read buf: `, buf);
        return buf;
      }
      await this.readable();
    }
  }

  readable() {
    return new Promise(resolve => this.conn.socket.on("readable", resolve));
  }
}

module.exports = Transport;
