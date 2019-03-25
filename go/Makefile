
GOPATH:=$(shell go env GOPATH)

all: schema

schema:
	capnp compile -I${GOPATH}/src/zombiezen.com/go/capnproto2/std -ogo:./frames --src-prefix ../schema ../schema/frames.capnp

