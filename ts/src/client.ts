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

function assertEq<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`expected ${expected}, got ${actual}`);
  }
}

export async function doClient() {
  const socket = await connect("127.0.0.1:9494");
  const transport = new TCPTransport(socket);
  const conn = new Conn(transport, require("weak"));
  const client = await conn.bootstrap();
  const calc = new Calculator$Client(client);

  {
    // Make a request that just evaluates the literal value 123.
    //
    // What's interesting here is that evaluate() returns a "Value", which is
    // another interface and therefore points back to an object living on the
    // server.  We then have to call read() on that object to read it.
    // However, even though we are making two RPC's, this block executes in
    // *one* network round trip because of promise pipelining:  we do not wait
    // for the first call to complete before we send the second call to the
    // server.
    console.log("Evaluating a literal...");
    const req = calc
      .evaluate(params => params.initExpression().setLiteral(123))
      .getValue()
      .read()
      .promise();
    assertEq((await req).getValue(), 123);
    console.log("PASS");
  }

  {
    // Make a request to evaluate 123 + 45 - 67.
    //
    // The Calculator interface requires that we first call getOperator() to
    // get the addition and subtraction functions, then call evaluate() to use
    // them.  But, once again, we can get both functions, call evaluate(), and
    // then read() the result -- four RPCs -- in the time of *one* network
    // round trip, because of promise pipelining.
    console.log("Using add and subtract...");

    // Get the "add" function from the server
    let add = calc
      .getOperator(params => params.setOp(Calculator.Operator.ADD))
      .getFunc();

    // Get the "subtract" function from the server
    let subtract = calc
      .getOperator(params => params.setOp(Calculator.Operator.SUBTRACT))
      .getFunc();

    // Build the request to evaluate 123 + 45 - 67
    const req = calc
      .evaluate(params => {
        const subtractCall = params.initExpression().initCall();
        subtractCall.setFunction(subtract);
        const subtractParams = subtractCall.initParams(2);
        subtractParams.get(1).setLiteral(67);

        const addCall = subtractParams.get(0).initCall();
        addCall.setFunction(add);
        const addParams = addCall.initParams(2);
        addParams.get(0).setLiteral(123);
        addParams.get(1).setLiteral(45);
      })
      .getValue()
      .read()
      .promise();

    assertEq((await req).getValue(), 101);
    console.log("PASS");
  }

  {
    // Make a request to evaluate 4 * 6, then use the result in two more
    // requests that add 3 and 5.
    //
    // Since evaluate() returns its result wrapped in a `Value`, we can pass
    // that `Value` back to the server in subsequent requests before the first
    // `evaluate()` has actually returned.  Thus, this example again does only
    // one network round trip.
    console.log("Pipeline eval() calls...");

    let add = calc
      .getOperator(params => params.setOp(Calculator.Operator.ADD))
      .getFunc();
    let multiply = calc
      .getOperator(params => params.setOp(Calculator.Operator.MULTIPLY))
      .getFunc();

    // Build the request to evaluate 4*6
    let multResult = calc
      .evaluate(params => {
        const call = params.initExpression().initCall();
        call.setFunction(multiply);
        const multParams = call.initParams(2);
        multParams.get(0).setLiteral(4);
        multParams.get(1).setLiteral(6);
      })
      .getValue();

    let add3Result = calc
      .evaluate(params => {
        const call = params.initExpression().initCall();
        call.setFunction(add);
        const addParams = call.initParams(2);
        addParams.get(0).setPreviousResult(multResult);
        addParams.get(1).setLiteral(3);
      })
      .getValue();

    let add5Result = calc
      .evaluate(params => {
        const call = params.initExpression().initCall();
        call.setFunction(add);
        const addParams = call.initParams(2);
        addParams.get(0).setPreviousResult(multResult);
        addParams.get(1).setLiteral(5);
      })
      .getValue();

    assertEq((await add3Result.read().promise()).getValue(), 27);
    assertEq((await add5Result.read().promise()).getValue(), 29);

    console.log("PASS");
  }

  process.exit(0);
}
