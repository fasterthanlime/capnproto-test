import * as capnp from "capnp-ts";
import { connect } from "./connect";
import { Message } from "capnp-ts/lib/std/rpc.capnp";
import { Transport } from "./transport";
import { Conn } from "./rpc";

export async function doClient() {
  const socket = await connect("127.0.0.1:9494");
  const transport = new Transport(socket);
  const conn = new Conn(transport);
  await conn.bootstrap();

  await new Promise(resolve => setTimeout(resolve, 250));
  process.exit(0);
}
