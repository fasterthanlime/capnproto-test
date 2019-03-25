package main

import (
	"zombiezen.com/go/capnproto2"
	"github.com/fasterthanlime/capnproto-test-go/frames"
	"bytes"
	"io/ioutil"
	"log"
)

func main() {
	data, err := ioutil.ReadFile("data.bin")
	must(err)

	msg, err := capnp.NewDecoder(bytes.NewReader(data)).Decode()
	must(err)

	root, err := frames.ReadRootFrames(msg)
	must(err)

	log.Printf("root: %+v", root)
}

func must(err error) {
	if err != nil {
		log.Fatalf("%+v", err)
	}
}
