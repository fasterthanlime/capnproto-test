import * as capnp from "capnp-ts";
import { connect } from "./connect";
import { Message } from "capnp-ts/lib/std/rpc.capnp";
import { Transport } from "./transport";

export async function doClient() {
  const socket = await connect("127.0.0.1:9494");
  const transport = new Transport(socket);

  {
    const msg = new capnp.Message();
    const root = msg.initRoot(Message);
    const bootstrap = root.initBootstrap();
    bootstrap.setQuestionId(42);
    transport.sendMessage(msg);
  }

  await new Promise(resolve => setTimeout(resolve, 250));
  process.exit(0);
}
