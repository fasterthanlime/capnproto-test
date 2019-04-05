import {
  Message_Which,
  Return,
  Return_Which,
  CapDescriptor,
  CapDescriptor_Which,
} from "capnp-ts/lib/std/rpc.capnp";
import { RPCMessage } from "capnp-ts";

import initTrace from "debug";
const trace = initTrace("capnp:rpc:dump");

export function dumpRPCMessage(prefix: string, root: RPCMessage) {
  trace("=====================");
  let log = (fmt: string, ...args: any[]) => {
    trace(prefix + fmt, ...args);
  };

  log(`message: ${Message_Which[root.which()]}`);
  switch (root.which()) {
    case RPCMessage.BOOTSTRAP: {
      const bootstrap = root.getBootstrap();
      log(`questionId = ${bootstrap.getQuestionId()}`);
      break;
    }
    case RPCMessage.RETURN: {
      const _return = root.getReturn();
      log(`answerId = ${_return.getAnswerId()}`);
      log(`releaseParamsCaps = ${_return.getReleaseParamCaps()}`);

      log(`which = ${Return_Which[_return.which()]}`);
      switch (_return.which()) {
        case Return.RESULTS: {
          const results = _return.getResults();
          log(`results = ${results}`);
          const capTable = results.getCapTable();
          log(`capTable length = ${capTable.getLength()}`);
          for (let i = 0; i < capTable.getLength(); i++) {
            let cap = capTable.get(i);
            log(`cap which ${i} = ${CapDescriptor_Which[cap.which()]}`);
            switch (cap.which()) {
              case CapDescriptor.SENDER_HOSTED: {
                let sh = cap.getSenderHosted();
                log(`sender hosted =`, sh);
                break;
              }
              default:
                log(`unknown cap descriptor`);
            }
          }
          break;
        }
        default:
          trace(`Unknown return type`);
      }
      break;
    }
    default:
      trace(`Unknown message type`);
  }
}
