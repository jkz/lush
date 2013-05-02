// Copyright © 2013 Hraban Luyat <hraban@0brg.net>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.

package liblush

import (
	"io"
	"log"
	"sync"
)

// this girl just couples a scrollback buffer to a flexible multiwriter thats
// nice cos you can keep track of the latest bytes that were sent through.
// safe for concurrent use
type richpipe struct {
	FlexibleMultiWriter
	// Most recently written bytes
	fifo ringbuf
	l    sync.Mutex
}

// always great success responsibility for failure is here not with caller
func (p *richpipe) Write(data []byte) (int, error) {
	p.l.Lock()
	defer p.l.Unlock()
	p.FlexibleMultiWriter.Write(data)
	p.fifo.Write(data)
	return len(data), nil
}

// close underlying writers return the first error encountered, if any
func (p *richpipe) Close() (err error) {
	p.l.Lock()
	defer p.l.Unlock()
	for _, w := range p.Writers() {
		if c, ok := w.(io.Closer); ok {
			err2 := c.Close()
			if err2 != nil && err == nil {
				err = err2
			}
		}
	}
	return err
}

func (p *richpipe) Last(buf []byte) int {
	p.l.Lock()
	defer p.l.Unlock()
	return p.fifo.Last(buf)
}

func (p *richpipe) ResizeScrollbackBuffer(n int) {
	p.l.Lock()
	defer p.l.Unlock()
	p.fifo = resizeringbuf(p.fifo, n)
}

// Create new ringbuffer and copy the old data over. Not a pretty nor an
// efficient implementation but it gets the job done.
func resizeringbuf(r ringbuf, i int) ringbuf {
	r2 := newRingbuf(i)
	buf := make([]byte, r.Size())
	// Useful bytes
	n := r2.Last(buf)
	buf = buf[:n]
	_, err := r2.Write(buf)
	if err != nil {
		log.Print("Write error to ringbuffer: ", err)
		// still, who cares? just fail the resize and continue operation
	}
	return r2
}

func newRichPipe(fifosize int) *richpipe {
	return &richpipe{
		fifo: newRingbuf(fifosize),
	}
}
