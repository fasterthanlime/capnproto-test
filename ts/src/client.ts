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
  Calculator_Expression,
  Calculator_Value,
  Calculator_Value_Read$Params,
  Calculator_Value_Read$Results,
  Calculator_Evaluate$Params,
  Calculator_Evaluate$Results,
} from "./calculator.capnp";

class RemoteCalculator {
  constructor(public client: Client) {}

  evaluate(
    f?: (params: Calculator_Evaluate$Params) => void,
  ): Calculator_evaluate_Results_Promise {
    const answer = this.client.call({
      method: {
        ParamsClass: Calculator_Evaluate$Params,
        ResultsClass: Calculator_Evaluate$Results,
        interfaceID: capnp.Uint64.fromHexString(Calculator._capnp.id),
        methodID: 0,
        interfaceName: "calculator.capnp:Calculator",
        methodName: "evaluate",
      },
      paramsFunc: (params: Calculator_Evaluate$Params) => {
        if (f) {
          f(params);
        }
      },
    });
    const pipeline = new Pipeline(Calculator_Evaluate$Results, answer);
    return new Calculator_evaluate_Results_Promise(pipeline);
  }
}

class Calculator_evaluate_Results_Promise {
  constructor(
    public pipeline: Pipeline<any, any, Calculator_Evaluate$Results>,
  ) {}

  getValue(): RemoteCalculator_Value {
    return new RemoteCalculator_Value(
      this.pipeline.getPipeline(Calculator_Value, 0).client(),
    );
  }
}

class RemoteCalculator_Value {
  constructor(public client: Client) {}

  read(
    f?: (params: Calculator_Value_Read$Params) => void,
  ): Calculator_Value_read_Promise {
    const answer = this.client.call({
      method: {
        ParamsClass: Calculator_Value_Read$Params,
        ResultsClass: Calculator_Value_Read$Results,
        interfaceID: capnp.Uint64.fromHexString(Calculator_Value._capnp.id),
        methodID: 0,
        interfaceName: "calculator.capnp:Calculator.Value",
        methodName: "read",
      },
      paramsFunc: (_s: capnp.Struct) => {
        const params = __S.getAs(Calculator_Value_Read$Params, _s);
        if (f) {
          f(params);
        }
      },
    });
    const pipeline = new Pipeline(Calculator_Value_Read$Params, answer);
    return new Calculator_Value_read_Promise(pipeline);
  }
}

class Calculator_Value_read_Promise {
  constructor(public pipeline: Pipeline<any, any, Calculator_Value>) {}

  async struct(): Promise<Calculator_Value_Read$Results | null> {
    const s = await this.pipeline.struct();
    if (!s) {
      return null;
    }
    return __S.getAs(Calculator_Value_Read$Results, s);
  }
}

export async function doClient() {
  const socket = await connect("127.0.0.1:9494");
  const transport = new TCPTransport(socket);
  const conn = new Conn(transport, require("weak"));
  const client = await conn.bootstrap();
  console.log(`Bootstrapped! client = `, client);

  const calc = new RemoteCalculator(client);
  const result = (await calc
    .evaluate(params => params.initExpression().setLiteral(123))
    .getValue()
    .read()
    .struct())!.getValue();
  console.log(`result = `, result);

  // await new Promise(resolve => setTimeout(resolve, 250));
  // console.log(`\n\n\n\n`);

  // let a = calc.evaluate(params => params.initExpression().setLiteral(123));

  // await new Promise(resolve => setTimeout(resolve, 250));
  // console.log(`\n\n\n\n`);

  // let b = (await a
  //   .getValue()
  //   .read()
  //   .struct())!.getValue();
  // console.log(`result = `, b);

  process.exit(0);
}
