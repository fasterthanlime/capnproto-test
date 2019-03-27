import { Socket } from "net";

export async function connect(addr: string) {
  const [host, portString] = addr.split(":");
  const port = parseInt(portString, 10);
  if (!host) {
    throw new Error(`invalid host ${host}`);
  }
  if (!port) {
    throw new Error(`invalid port ${port}`);
  }

  const socket = new Socket();
  const p = new Promise((resolve, reject) => {
    socket.on("error", reject);
    socket.on("connect", resolve);
    setTimeout(() => {
      reject(new Error(`Timed out while connecting to ${addr}`));
    }, 5000);

    socket.connect(port, host);
  });

  await p;
  console.log(`Connected to ${addr}`);
  socket.setNoDelay(true);
  return socket;
}
