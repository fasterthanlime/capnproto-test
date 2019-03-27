package main

import (
	"bytes"
	"context"
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
	capnprpc "zombiezen.com/go/capnproto2/std/capnp/rpc"
)

var (
	app = kingpin.New(os.Args[0], "capnp tester")

	framesCmd = app.Command("frames", "Read data.bin and dump info about frames")
	serverCmd = app.Command("server", "Serve a calculator server")
)

func main() {
	log.SetFlags(0)
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
	return errors.New("defFunction: stub!")
}

func (cs *calculatorServer) Evaluate(call calculator.Calculator_evaluate) error {
	expr, err := call.Params.Expression()
	if err != nil {
		return err
	}

	switch expr.Which() {
	case calculator.Calculator_Expression_Which_literal:
		vs := valueServer{value: expr.Literal()}
		log.Printf("Evaluating literal %v", expr.Literal())
		call.Results.SetValue(calculator.Calculator_Value_ServerToClient(vs))
		return nil
	default:
		return errors.Errorf("don't know how to evaluate %s yet", expr.Which())
	}
}

func (cs *calculatorServer) GetOperator(call calculator.Calculator_getOperator) error {
	return errors.New("getOperator: stub!")
}

type debuggingTransport struct {
	inner rpc.Transport
}

func (t *debuggingTransport) Close() error {
	return t.inner.Close()
}

func (t *debuggingTransport) SendMessage(ctx context.Context, msg capnprpc.Message) error {
	err := t.inner.SendMessage(ctx, msg)
	if err != nil {
		log.Printf(">> error = %+v", err)
	} else {
		log.Printf(">> %+v", msg)
	}
	return err
}

func (t *debuggingTransport) RecvMessage(ctx context.Context) (capnprpc.Message, error) {
	msg, err := t.inner.RecvMessage(ctx)
	if err != nil {
		log.Printf("<< error = %+v", err)
	} else {
		log.Printf("<< %+v", msg)
	}
	return msg, err
}

// type guard
var _ rpc.Transport = (*debuggingTransport)(nil)

func doServer() {
	address := "127.0.0.1:9494"

	l, err := net.Listen("tcp", address)
	must(err)
	log.Printf("Listening on %s", address)

	handleConn := func(c net.Conn) error {
		cs := &calculatorServer{}
		main := calculator.Calculator_ServerToClient(cs)

		// vvvvvvvvvvvvvvvvvvvvvvv
		realTransport := rpc.StreamTransport(c)
		debugTransport := &debuggingTransport{inner: realTransport}
		conn := rpc.NewConn(debugTransport, rpc.MainInterface(main.Client))
		// ^^^^^^^^^^^^^^^^^^^^^^^

		err := conn.Wait()
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
