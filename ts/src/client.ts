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
  Calculator_Value$Server,
  Calculator_Value$Server$Target,
  Calculator_Value_Read$Params,
  Calculator_Value_Read$Results,
  Calculator_Evaluate$Params,
  Calculator_Evaluate$Results,
  Calculator_Function_Call$Params,
  Calculator_Function_Call$Results,
  Calculator_Function$Server,
  Calculator_Function$Client,
  Calculator$Server,
  Calculator$Server$Target,
} from "./calculator.capnp";

export async function doClient() {
  const socket = await connect("127.0.0.1:9494");
  const transport = new TCPTransport(socket);
  const conn = new Conn(transport, require("weak"));
  const client = await conn.bootstrap();
  const calc = new Calculator$Client(client);

  async function doLiteral() {
    // const calc = new Calculator$Client(client);
    class MyValue implements Calculator_Value$Server$Target {
      constructor(public value: number) {}

      async read(
        _params: Calculator_Value_Read$Params,
        results: Calculator_Value_Read$Results,
      ) {
        results.setValue(this.value);
      }
    }

    class MyCalculator implements Calculator$Server$Target {
      async evaluate(
        params: Calculator_Evaluate$Params,
        results: Calculator_Evaluate$Results,
      ) {
        const expr = params.getExpression();
        if (!expr.isLiteral()) {
          throw new Error(`evaluating non-literals: stub!`);
        }
        results.setValue(
          new Calculator_Value$Server(new MyValue(expr.getLiteral())).client(),
        );
      }
      async getOperator() {
        throw new Error(`getOperator: stub!`);
      }
      async defFunction() {
        throw new Error(`defFunction: stub!`);
      }
    }
    const calc = new Calculator$Server(new MyCalculator()).client();

    const req = calc
      .evaluate(params => params.initExpression().setLiteral(123))
      .getValue()
      .read()
      .promise();
    console.log(`(doLiteral) result = ${(await req).getValue()}`);
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

    console.log(`(doCall) 3 + 4 = ${(await req).getValue()}`);
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

    console.log(`(doComplexCall) (1 + 2) + 4 = ${(await req).getValue()}`);
  }

  async function doUserDef() {
    const req = calc
      .evaluate(params => {
        let expr = params.initExpression();
        let call = expr.initCall();

        // define a new function that lives on the client
        const pow = new Calculator_Function$Server({
          call: async (params, results) => {
            const numArgs = params.getParams().getLength();
            if (numArgs !== 2) {
              throw new Error(`pow(x, y) expects 2 argument, got ${numArgs}`);
            }
            const [x, y] = params.getParams().toArray();
            results.setValue(Math.pow(x, y));
            return;
          },
        });

        // ask the server to use our function (hosted on the client)
        call.setFunction(pow.client());
        let args = call.initParams(2);
        args.get(0).setLiteral(2);
        args.get(1).setLiteral(8);
      })
      .getValue()
      .read()
      .promise();

    console.log(`(call to user-def) 2^8 = `, (await req).getValue());
  }

  await doLiteral();
  console.log("=================");

  // await doCall();
  // console.log("=================");

  // await doComplexCall();
  // console.log("=================");

  // await doUserDef();
  // console.log("=================");

  process.exit(0);
}
