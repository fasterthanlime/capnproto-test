import { Frames } from "./frames.capnp";
import * as capnp from "capnp-ts";
import { writeFileSync } from "fs";

export async function doWrite() {
  const message = new capnp.Message();
  const root = message.initRoot(Frames);
  const frames = root.initFrames(1);

  {
    const frame = frames.get(0);
    const audioFrame = frame.initAudioFrame();
    audioFrame.setChannels(2);
    audioFrame.setStreamId(69);
    const pts = audioFrame.initPts();
    pts.setNum(1);
    pts.setDen(60);
    const data = audioFrame.initData(200);
    for (let j = 0; j < 200; j++) {
      data.set(j, Math.random() * 256);
    }
  }
  let outPath = "data.bin";
  writeFileSync(outPath, new Int8Array(message.toArrayBuffer()), {
    encoding: null,
  });
  console.log(`Wrote file to ${outPath}`);
}
