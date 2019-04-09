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

  {
    // Our calculator interface supports defining functions.  Here we use it
    // to define two functions and then make calls to them as follows:
    //
    //   f(x, y) = x * 100 + y
    //   g(x) = f(x, x + 1) * 2;
    //   f(12, 34)
    //   g(21)
    //
    // Once again, the whole thing takes only one network round trip.
    console.log("Defining functions...");

    let add = calc
      .getOperator(params => params.setOp(Calculator.Operator.ADD))
      .getFunc();
    let multiply = calc
      .getOperator(params => params.setOp(Calculator.Operator.MULTIPLY))
      .getFunc();

    let f = calc
      .defFunction(params => {
        params.setParamCount(2);
        {
          let addCall = params.initBody().initCall();
          addCall.setFunction(add);
          let addParams = addCall.initParams(2);
          addParams.get(1).setParameter(1);

          let multiplyCall = addParams.get(0).initCall();
          multiplyCall.setFunction(multiply);
          let multiplyParams = multiplyCall.initParams(2);
          multiplyParams.get(0).setParameter(0);
          multiplyParams.get(1).setLiteral(100);
        }
      })
      .getFunc();

    let g = calc
      .defFunction(params => {
        params.setParamCount(1);
        {
          let multiplyCall = params.initBody().initCall();
          multiplyCall.setFunction(multiply);
          let multiplyParams = multiplyCall.initParams(2);
          multiplyParams.get(1).setLiteral(2);

          let fCall = multiplyParams.get(0).initCall();
          fCall.setFunction(f);
          let fParams = fCall.initParams(2);
          fParams.get(0).setParameter(0);

          let addCall = fParams.get(1).initCall();
          addCall.setFunction(add);
          let addParams = addCall.initParams(2);
          addParams.get(0).setParameter(0);
          addParams.get(1).setLiteral(1);
        }
      })
      .getFunc();

    let fEval = calc
      .evaluate(params => {
        let fCall = params.initExpression().initCall();
        fCall.setFunction(f);
        let fParams = fCall.initParams(2);
        fParams.get(0).setLiteral(12);
        fParams.get(1).setLiteral(34);
      })
      .getValue()
      .read()
      .promise();

    let gEval = calc
      .evaluate(params => {
        let gCall = params.initExpression().initCall();
        gCall.setFunction(g);
        gCall
          .initParams(1)
          .get(0)
          .setLiteral(21);
      })
      .getValue()
      .read()
      .promise();

    assertEq((await fEval).getValue(), 1234);
    assertEq((await gEval).getValue(), 4244);
    console.log("PASS");
  }

  {
    // Make a request that will call back to a function defined locally.
    //
    // Specifically, we will compute 2^(4 + 5).  However, exponent is not
    // defined by the Calculator server.  So, we'll implement the Function
    // interface locally and pass it to the server for it to use when
    // evaluating the expression.
    //
    // This example requires two network round trips to complete, because the
    // server calls back to the client once before finishing.  In this
    // particular case, this could potentially be optimized by using a tail
    // call on the server side -- see CallContext::tailCall().  However, to
    // keep the example simpler, we haven't implemented this optimization in
    // the sample server.
    console.log("Using a callback...");

    let add = calc
      .getOperator(params => params.setOp(Calculator.Operator.ADD))
      .getFunc();

    let powEval = calc
      .evaluate(params => {
        let powCall = params.initExpression().initCall();
        powCall.setFunction(
          new Calculator_Function$Server({
            call: async (p, r) => {
              let params = p.getParams();
              if (params.getLength() !== 2) {
                throw new Error("Wrong number of parameters");
              }
              r.setValue(Math.pow(params.get(0), params.get(1)));
            },
          }).client(),
        );
        let powParams = powCall.initParams(2);
        powParams.get(0).setLiteral(2);

        let addCall = powParams.get(1).initCall();
        addCall.setFunction(add);
        let addParams = addCall.initParams(2);
        addParams.get(0).setLiteral(4);
        addParams.get(1).setLiteral(5);
      })
      .getValue()
      .read()
      .promise();

    assertEq((await powEval).getValue(), 512);
    console.log("PASS");
  }

  process.exit(0);
}

async function stressTest(calc: Calculator$Client) {
  for (let k = 0; k < 3; k++) {
    for (let j = 0; j <= 10; j++) {
      let numCalls = j * 128;

      let t1 = Date.now();
      let add = calc
        .getOperator(p => p.setOp(Calculator.Operator.ADD))
        .getFunc();
      let lhs = calc
        .evaluate(params => params.initExpression().setLiteral(0))
        .getValue();

      let state = { last: 0 };

      for (let i = 0; i < numCalls; i++) {
        state.last = i;
        lhs = calc
          .evaluate(params => {
            const c = params.initExpression().initCall();
            c.setFunction(add);
            const pp = c.initParams(2);
            pp.get(0).setPreviousResult(lhs);
            pp.get(1).setLiteral(i);
          })
          .getValue();
      }

      let t2 = Date.now();
      const result = (await lhs.read().promise()).getValue();
      let t3 = Date.now();

      let sendTime = (t2 - t1).toFixed();
      let recvTime = (t3 - t2).toFixed();

      let elapsed = Date.now() - t1;
      console.log(
        `(send ${sendTime}ms, recv ${recvTime}ms) ${numCalls} recursion = `,
        result,
      );
    }
  }
}
