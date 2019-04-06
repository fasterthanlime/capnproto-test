require("source-map-support").install({
  environment: "node",
});

import * as capnp from "capnp-ts";
import { ObjectSize as __O, Struct as __S } from "capnp-ts";
import { connect } from "./connect";
import { TCPTransport } from "./tcp-transport";
import { Conn, Call, Client, Pipeline } from "capnp-ts";

import {
  Calculator,
  Calculator$Client,
  Calculator_Expression,
  Calculator_Value,
  Calculator_Value_Read$Params,
  Calculator_Value_Read$Results,
  Calculator_Evaluate$Params,
  Calculator_Evaluate$Results,
} from "./calculator.capnp";

export async function doClient() {
  const socket = await connect("127.0.0.1:9494");
  const transport = new TCPTransport(socket);
  const conn = new Conn(transport, require("weak"));
  const client = await conn.bootstrap();
  const calc = new Calculator$Client(client);

  async function doPipelined() {
    const calc = new Calculator$Client(client);
    const req = calc
      .evaluate(params => params.initExpression().setLiteral(456))
      .getValue()
      .read()
      .promise();
    console.log(`(pipelined) result = ${(await req).getValue()}`);
  }

  async function doNotPipelined() {
    await new Promise(resolve => setTimeout(resolve, 250));
    let a = calc.evaluate(params => params.initExpression().setLiteral(123));
    await new Promise(resolve => setTimeout(resolve, 250));

    let resultsStruct = (await a.pipeline.struct())!;
    console.log(`results struct = ${resultsStruct}`);
    console.log(`results interface = ${resultsStruct.getValue()}`);
    console.log(
      `results interface capID = ${resultsStruct.getValue().getCapID()}`,
    );
    console.log(`\n\n`);

    let b = (await a
      .getValue()
      .read()
      .promise()).getValue();
    console.log(`(non-pipelined) result = ${b}`);
  }

  async function doComplex() {
    let a = calc.evaluate(params => params.initExpression().setLiteral(123));

    let b = (await a
      .getValue()
      .read()
      .promise()).getValue();
    console.log(`(complex) result = ${b}`);
  }

  await doPipelined();
  console.log("=================");
  await doNotPipelined();
  console.log("=================");
  await doComplex();

  process.exit(0);
}
