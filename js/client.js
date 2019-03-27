#!/usr/bin/env node

const net = require("net");
const capnp = require("capnp-ts");
const {Message} = require("capnp-ts/lib/std/rpc.capnp.js");

async function main() {
  const socket = new net.Socket();
  socket.connect(9494, "127.0.0.1");
  socket.on("error", (e) => {
    console.error("Socket error: ", e.stack);
  });
  await new Promise((resolve, reject) => {
    socket.on("error", reject);
    socket.on("connect", resolve);
  });
  console.log("Connected to server!");
  socket.setNoDelay(true);
  socket.on("data", (data) => {
    console.log("data = ", data);
  });

  const message = new capnp.Message();
  const root = message.initRoot(Message);
  const bootstrap = root.initBootstrap();
  bootstrap.setQuestionId(6);
  const u8 = new Uint8Array(message.toArrayBuffer());
  let res = "";
  for (let i = 0; i < u8.length; i++) {
    res += `${u8[i].toString(16).padStart(2, "0")} `;
  }
  console.log(res);

  socket.write(u8, null /* encoding */);

  await new Promise((resolve, reject) => {
    setTimeout(resolve, 3000);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

