import {
  Message_Which,
  Return,
  Return_Which,
  CapDescriptor,
  CapDescriptor_Which,
  Call_SendResultsTo_Which,
} from "capnp-ts/lib/std/rpc.capnp";
import { RPCMessage, List } from "capnp-ts";

import initTrace from "debug";
const trace = initTrace("capnp:rpc:dump");

export function dumpRPCMessage(prefix: string, root: RPCMessage) {
  // trace("=====================");
  let log = (fmt: string, ...args: any[]) => {
    trace(prefix + fmt, ...args);
  };

  // const dumpCapTable = (capTable: List<CapDescriptor>) => {
  //   log(`${capTable.getLength()} caps`);
  //   for (let i = 0; i < capTable.getLength(); i++) {
  //     let cap = capTable.get(i);
  //     log(`cap #${i} = ${CapDescriptor_Which[cap.which()]}`);
  //     switch (cap.which()) {
  //       case CapDescriptor.SENDER_HOSTED: {
  //         let sh = cap.getSenderHosted();
  //         log(`sender hosted =`, sh);
  //         break;
  //       }
  //       case CapDescriptor.SENDER_PROMISE: {
  //         let sp = cap.getSenderPromise();
  //         log(`sender promise =`, sp);
  //         break;
  //       }
  //       case CapDescriptor.RECEIVER_HOSTED: {
  //         let rh = cap.getReceiverHosted();
  //         log(`receiver hosted =`, rh);
  //         break;
  //       }
  //       case CapDescriptor.RECEIVER_ANSWER: {
  //         let ra = cap.getReceiverAnswer();
  //         log(`receiver answer =`, ra);
  //         break;
  //       }
  //       default:
  //         log(`unknown cap descriptor`);
  //     }
  //   }
  // };

  // log(`message: ${Message_Which[root.which()]}`);
  // switch (root.which()) {
  //   case RPCMessage.BOOTSTRAP: {
  //     const bootstrap = root.getBootstrap();
  //     log(`questionId = ${bootstrap.getQuestionId()}`);
  //     break;
  //   }
  //   case RPCMessage.CALL: {
  //     const call = root.getCall();
  //     log(`questionId = ${call.getQuestionId()}`);
  //     log(`interface = ${call.getInterfaceId().toHexString()}`);
  //     log(`method = ${call.getMethodId()}`);
  //     log(
  //       `sendResultsTo = ${
  //         Call_SendResultsTo_Which[call.getSendResultsTo().which()]
  //       }`,
  //     );
  //     const params = call.getParams();
  //     log(`params = ${params}`);
  //     dumpCapTable(params.getCapTable());
  //     break;
  //   }
  //   case RPCMessage.RETURN: {
  //     const _return = root.getReturn();
  //     log(`answerId = ${_return.getAnswerId()}`);
  //     log(`releaseParamsCaps = ${_return.getReleaseParamCaps()}`);

  //     log(`which = ${Return_Which[_return.which()]}`);
  //     switch (_return.which()) {
  //       case Return.RESULTS: {
  //         const results = _return.getResults();
  //         log(`results = ${results}`);
  //         dumpCapTable(results.getCapTable());
  //         break;
  //       }
  //       default:
  //         trace(`Unknown return type`);
  //     }
  //     break;
  //   }
  //   case RPCMessage.UNIMPLEMENTED: {
  //     const un = root.getUnimplemented();
  //     dumpRPCMessage(`(unimplemented) ${prefix}`, un);
  //     break;
  //   }
  //   default:
  //     trace(`Unknown message type`);
  // }

  if (root.which() === Message_Which.CALL) {
    log(`%d call`, root.getCall().getQuestionId());
  } else if (root.which() === Message_Which.RETURN) {
    log(`%d return`, root.getReturn().getAnswerId());
  }
}
