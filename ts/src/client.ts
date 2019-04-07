require("source-map-support").install({
  environment: "node",
});

import * as capnp from "capnp-ts";
import { ObjectSize as __O, Struct as __S } from "capnp-ts";
import { connect } from "./connect";
import { TCPTransport } from "./tcp-transport";
import { Conn, Call, Client, Pipeline } from "capnp-ts";
import {
  setInterfacePointer,
  initPointer,
} from "capnp-ts/lib/serialization/pointers/pointer";

import {
  Calculator,
  Calculator$Client,
  Calculator_Expression,
  Calculator_Value,
  Calculator_Value_Read$Params,
  Calculator_Value_Read$Results,
  Calculator_Evaluate$Params,
  Calculator_Evaluate$Results,
  Calculator_Function_Call$Params,
  Calculator_Function_Call$Results,
  Calculator_Function$Client,
} from "./calculator.capnp";

export async function doClient() {
  const socket = await connect("127.0.0.1:9494");
  const transport = new TCPTransport(socket);
  const conn = new Conn(transport, require("weak"));
  const client = await conn.bootstrap();
  const calc = new Calculator$Client(client);

  async function doLiteral() {
    const calc = new Calculator$Client(client);
    const req = calc
      .evaluate(params => params.initExpression().setLiteral(123))
      .getValue()
      .read()
      .promise();
    console.log(`(pipelined) result = ${(await req).getValue()}`);
  }

  async function doCall() {
    let req = calc
      .evaluate(params => {
        let expr = params.initExpression();
        let call = expr.initCall();
        call.setFunction(
          calc
            .getOperator(params => {
              params.setOp(Calculator.Operator.ADD);
            })
            .getFunc(),
        );
        let args = call.initParams(2);
        args.get(0).setLiteral(3);
        args.get(1).setLiteral(4);
      })
      .getValue()
      .read()
      .promise();

    console.log(`(call) 3 + 4 = ${(await req).getValue()}`);
  }

  async function doComplexCall() {
    let add = calc
      .getOperator(params => {
        params.setOp(Calculator.Operator.ADD);
      })
      .getFunc();

    let req = calc
      .evaluate(params => {
        const onePlusTwo = calc
          .evaluate(params => {
            let expr = params.initExpression();
            let call = expr.initCall();
            call.setFunction(add);
            let args = call.initParams(2);
            args.get(0).setLiteral(1);
            args.get(1).setLiteral(2);
          })
          .getValue();

        let expr = params.initExpression();
        let call = expr.initCall();
        call.setFunction(add);
        let args = call.initParams(2);
        args.get(0).setPreviousResult(onePlusTwo);
        args.get(1).setLiteral(4);
      })
      .getValue()
      .read()
      .promise();

    console.log(`(call) (1 + 2) + 4 = ${(await req).getValue()}`);
  }

  async function doUserDef() {
    calc.evaluate(params => {
      let expr = params.initExpression();
      let call = expr.initCall();
      call.setFunction(
        new Calculator_Function$Client(
          new capnp.Server([
            {
              ParamsClass: Calculator_Function_Call$Params,
              ResultsClass: Calculator_Function_Call$Results,
              interfaceId: Calculator_Function$Client.interfaceId,
              methodId: 0,
              interfaceName: "calculator.capnp:Calculator.Function",
              methodName: "call",
              impl: async (
                params: Calculator_Function_Call$Params,
                results: Calculator_Function_Call$Results,
              ) => {
                console.log(`local function called, params = `, params);
                results.setValue(1024);
                return;
              },
            },
          ]),
        ),
      );
      let args = call.initParams(2);
      args.get(0).setLiteral(13);
      args.get(1).setLiteral(26);
    });
  }

  // await doLiteral();
  // console.log("=================");

  // await doCall();
  // console.log("=================");

  // await doComplexCall();
  // console.log("=================");

  await doUserDef();
  console.log("=================");

  process.exit(0);
}
