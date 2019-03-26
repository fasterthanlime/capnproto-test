package main

import (
	"bytes"
	"io/ioutil"
	"log"
	"net"
	"os"

	"github.com/fasterthanlime/capnproto-test-go/calculator"
	"github.com/fasterthanlime/capnproto-test-go/frames"
	"github.com/pkg/errors"
	"gopkg.in/alecthomas/kingpin.v2"
	capnp "zombiezen.com/go/capnproto2"
	"zombiezen.com/go/capnproto2/rpc"
)

var (
	app = kingpin.New(os.Args[0], "capnp tester")

	framesCmd = app.Command("frames", "Read data.bin and dump info about frames")
	serverCmd = app.Command("server", "Serve a calculator server")
)

func main() {
	switch kingpin.MustParse(app.Parse(os.Args[1:])) {
	case framesCmd.FullCommand():
		doFrames()
	case serverCmd.FullCommand():
		doServer()
	}
}

func doFrames() {
	data, err := ioutil.ReadFile("data.bin")
	must(err)

	msg, err := capnp.NewDecoder(bytes.NewReader(data)).Decode()
	must(err)

	root, err := frames.ReadRootFrames(msg)
	must(err)

	log.Printf("root: %+v", root)
}

type valueServer struct {
	value float64
}

func (vs valueServer) Read(call calculator.Calculator_Value_read) error {
	call.Results.SetValue(vs.value)
	return nil
}

type calculatorServer struct{}

func (cs *calculatorServer) DefFunction(call calculator.Calculator_defFunction) error {
	return errors.New("stub!")
}

func (cs *calculatorServer) Evaluate(call calculator.Calculator_evaluate) error {
	expr, err := call.Params.Expression()
	if err != nil {
		return err
	}

	switch expr.Which() {
	case calculator.Calculator_Expression_Which_literal:
		vs := valueServer{value: expr.Literal()}
		call.Results.SetValue(calculator.Calculator_Value_ServerToClient(vs))
	default:
		return errors.Errorf("don't know how to evaluate %s yet", expr.Which())
	}

	return errors.New("stub!")
}

func (cs *calculatorServer) GetOperator(call calculator.Calculator_getOperator) error {
	return errors.New("stub!")
}

func doServer() {
	address := "127.0.0.1:9494"

	l, err := net.Listen("tcp", address)
	must(err)
	log.Printf("Listening on %s", address)

	handleConn := func(c net.Conn) error {
		log.Printf("Client joined")
		cs := &calculatorServer{}
		main := calculator.Calculator_ServerToClient(cs)
		conn := rpc.NewConn(rpc.StreamTransport(c), rpc.MainInterface(main.Client))
		err := conn.Wait()
		log.Printf("Client left")
		if err != nil {
			return err
		}
		return nil
	}

	for {
		c, err := l.Accept()
		must(err)

		go func() {
			err := handleConn(c)
			if err != nil {
				log.Printf("warn: %+v", err)
			}
		}()
	}
}

func must(err error) {
	if err != nil {
		log.Fatalf("%+v", err)
	}
}
