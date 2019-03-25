
@0xf707573bf7bf8fda;

using Go = import "/go.capnp";
$Go.package("frames");
$Go.import("frames");

struct Rational {
    num @0: UInt32;
    den @1: UInt32;
}

struct AudioFrame {
    streamId @3: UInt32;
    pts @4: Rational;

    numSamples @0 :UInt32;
    channels @1 :UInt16;
    data @2 :Data;
}

struct VideoFrame {
    streamId @4: UInt32;
    pts @5: Rational;

    width @0 :UInt32;
    height @1 :UInt32;
    pixelFormat @3 :PixelFormat;
    data @2: Data;

    enum PixelFormat {
        rgba @0;
    }
}

struct Frame {
    union {
        audioFrame @0 :AudioFrame;
        videoFrame @1 :VideoFrame;
    }
}

struct Frames {
    frames @0 :List(Frame);
}

