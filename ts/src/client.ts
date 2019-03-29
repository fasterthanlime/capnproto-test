import * as capnp from "capnp-ts";
import { ObjectSize as __O, Struct as __S } from "capnp-ts";
import { connect } from "./connect";
import { Message } from "capnp-ts/lib/std/rpc.capnp";
import { Transport } from "./transport";
import { Conn } from "./rpc";
import { Call } from "./capability";
import { Calculator, Calculator_Expression } from "./calculator.capnp";

class Calculator_evaluate_params extends __S {
  static readonly _capnp = {
    displayName: "Calculator_evaluate_params",
    id: "bb0eaae1557a36d4",
    size: new __O(0, 1),
  };

  initExpression(): Calculator_Expression {
    return __S.initStructAt(0, Calculator_Expression, this);
  }
}

export async function doClient() {
  const socket = await connect("127.0.0.1:9494");
  const transport = new Transport(socket);
  const conn = new Conn(transport);
  const client = await conn.bootstrap();
  console.log(`Bootstrapped! client = `, client);

  const evaluateRes = await client
    .call(<Call>{
      method: {
        interfaceID: capnp.Uint64.fromHexString(Calculator._capnp.id),
        methodID: 0,
        interfaceName: "calculator.capnp:Calculator",
        methodName: "evaluate",
      },
      paramsSize: Calculator_evaluate_params._capnp.size,
      paramsFunc: (_s: capnp.Struct) => {
        const params = __S.getAs(Calculator_evaluate_params, _s);
        const expr = params.initExpression();
        expr.setLiteral(123);
      },
    })
    .struct();
  console.log(`Evaluate res = `, evaluateRes);

  await new Promise(resolve => setTimeout(resolve, 1000));
  process.exit(0);
}
