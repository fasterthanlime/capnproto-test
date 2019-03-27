const WORD_SIZE = 8;

class Transport {
  constructor(conn) {
    this.conn = conn;
    this.offset = 0;

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
    let buf;
    buf = await this.readBytes(4);
    let N = buf.readUInt32LE() + 1;
    console.log(`Receiving N=${N} segments`);

    buf = await this.readBytes(N * 4);
    let sizes = new Array(N);
    for (let i = 0; i < N; i++) {
      sizes[i] = buf.readUInt32LE(i * 4);
    }
    console.log(`Segment sizes: `, sizes);

    await this.alignToWordBoundary();

    process.exit(0);
  }

  async alignToWordBoundary() {
    if (this.offset % WORD_SIZE !== 0) {
      let toSkip = WORD_SIZE - (this.offset % WORD_SIZE);
      await this.readBytes(toSkip);
    }
  }

  async readBytes(len) {
    if (!len) {
      throw new Error(`invalid read length: ${len}`);
    }

    for (;;) {
      let buf = this.conn.socket.read(len);
      if (buf) {
        console.log(`Read buf: `, buf);
        this.offset += buf.length;
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
