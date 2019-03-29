require("source-map-support").install({
  environment: "node",
});

import * as capnp from "capnp-ts";
import { ObjectSize as __O, Struct as __S } from "capnp-ts";
import { connect } from "./connect";
import { Transport } from "./transport";
import { Conn, clientFromResolution } from "./rpc";
import { Call, PipelineClient, Client, Answer, Pipeline } from "./capability";
import {
  Calculator,
  Calculator_Expression,
  Calculator_Value,
} from "./calculator.capnp";

class Calculator_evaluate_Params extends __S {
  static readonly _capnp = {
    displayName: "Calculator_evaluate_Params",
    id: "bb0eaae1557a36d4",
    size: new __O(0, 1),
  };

  initExpression(): Calculator_Expression {
    return __S.initStructAt(0, Calculator_Expression, this);
  }
}

class RemoteCalculator {
  constructor(public client: Client) {}

  evaluate(
    f?: (params: Calculator_evaluate_Params) => void,
  ): Calculator_evaluate_Results_Promise {
    const answer = this.client.call({
      method: {
        interfaceID: capnp.Uint64.fromHexString(Calculator._capnp.id),
        methodID: 0,
        interfaceName: "calculator.capnp:Calculator",
        methodName: "evaluate",
      },
      paramsSize: Calculator_evaluate_Params._capnp.size,
      paramsFunc: (_s: capnp.Struct) => {
        const params = __S.getAs(Calculator_evaluate_Params, _s);
        if (f) {
          f(params);
        }
      },
    });
    const pipeline = new Pipeline(answer);
    return new Calculator_evaluate_Results_Promise(pipeline);
  }
}

class Calculator_evaluate_Results_Promise {
  constructor(public pipeline: Pipeline) {}

  getValue(): RemoteCalculator_Value {
    return new RemoteCalculator_Value(this.pipeline.getPipeline(0).client());
  }
}

class Calculator_Value_read_Params extends __S {
  static readonly _capnp = {
    displayName: "Calculator_Value_read_Params",
    id: "d3532574d58db558",
    size: new __O(0, 0),
  };
}

class RemoteCalculator_Value {
  constructor(public client: Client) {}

  read(
    f?: (params: Calculator_Value_read_Params) => void,
  ): Calculator_Value_read_Promise {
    const answer = this.client.call({
      method: {
        interfaceID: capnp.Uint64.fromHexString(Calculator_Value._capnp.id),
        methodID: 0,
        interfaceName: "calculator.capnp:Calculator.Value",
        methodName: "read",
      },
      paramsSize: Calculator_Value_read_Params._capnp.size,
      paramsFunc: (_s: capnp.Struct) => {
        const params = __S.getAs(Calculator_Value_read_Params, _s);
        if (f) {
          f(params);
        }
      },
    });
    const pipeline = new Pipeline(answer);
    return new Calculator_Value_read_Promise(pipeline);
  }
}

class Calculator_Value_read_Promise {
  constructor(public pipeline: Pipeline) {}

  async struct(): Promise<Calculator_Value_read_Results | null> {
    const s = await this.pipeline.struct();
    if (!s) {
      return null;
    }
    return __S.getAs(Calculator_Value_read_Results, s);
  }
}

class Calculator_Value_read_Results extends __S {
  static readonly _capnp = {
    displayName: "Calculator_Value_read_Results",
    id: "e6be6723122ae822",
    size: new __O(8, 0),
  };

  getValue(): number {
    return __S.getFloat64(0, this);
  }
}

export async function doClient() {
  const socket = await connect("127.0.0.1:9494");
  const transport = new Transport(socket);
  const conn = new Conn(transport);
  const client = await conn.bootstrap();
  console.log(`Bootstrapped! client = `, client);

  const calc = new RemoteCalculator(client);
  // const result = (await calc
  //   .evaluate(params => params.initExpression().setLiteral(123))
  //   .getValue()
  //   .read()
  //   .struct())!.getValue();
  // console.log(`result = `, result);

  await new Promise(resolve => setTimeout(resolve, 250));
  console.log(`\n\n\n\n`);

  let a = calc.evaluate(params => params.initExpression().setLiteral(123));

  await new Promise(resolve => setTimeout(resolve, 250));
  console.log(`\n\n\n\n`);

  let b = (await a
    .getValue()
    .read()
    .struct())!.getValue();
  console.log(`result = `, b);

  process.exit(0);
}
