const capnp = require("capnp-ts");
const { Message } = require("capnp-ts/lib/std/rpc.capnp.js");

const connect = require("./connect");
const Transport = require("./transport");

async function main() {
  const conn = await connect("127.0.0.1:9494");
  const transport = new Transport(conn);

  {
    const msg = new capnp.Message();
    const root = msg.initRoot(Message);
    const bootstrap = root.initBootstrap();
    bootstrap.setQuestionId(6);
    transport.sendMessage(msg);
  }

  await new Promise(resolve => setTimeout(resolve, 250));
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
