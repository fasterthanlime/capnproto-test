#!/usr/bin/env python3

from __future__ import print_function
import os
import capnp
import binascii

def readData(file):
    capnp.remove_import_hook()
    source_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), './frames.capnp')
    print('loading schema from', source_path)
    frames_capnp = capnp.load(source_path)
    root = frames_capnp.Frames.read(file)
    print('number of frames:', len(root.frames))

    frame = root.frames[0]
    if frame.which() == 'audioFrame':
        print('found audioFrame!')
        af = frame.audioFrame
        print(af.channels, 'channels')
        print('PTS:', af.pts.num/af.pts.den)
        print('Data:', binascii.hexlify(af.data))
    elif frame.which() == 'videoFrame':
        print('found videoFrame!')
    else:
        print('unknown frame type:', frame.which())

if __name__ == '__main__':
    f = open('data.bin', 'r')
    readData(f)

