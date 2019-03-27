
default: typescript

typescript:
	./node_modules/.bin/tsc

schema: capnpc

capnpc:
	capnpc -o ./node_modules/.bin/capnpc-ts:./src --src-prefix=../schema ../schema/calculator.capnp
	capnpc -o ./node_modules/.bin/capnpc-ts:./src --src-prefix=../schema ../schema/frames.capnp

