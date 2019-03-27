import { doClient } from "./client";
import { doWrite } from "./write";

export function main() {
  let args = process.argv.slice(2);
  switch (args[0]) {
    case "write": {
      doWrite();
      break;
    }
    case "client": {
      doClient();
      break;
    }
    default:
      console.log(`Usage: ${process.argv[1]} write|client`);
      process.exit(1);
  }
}
