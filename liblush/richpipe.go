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
	"errors"
	"io"
	"log"
	"sync"
)

// this girl just couples a scrollback buffer to a flexible multiwriter thats
// nice cos you can keep track of the latest bytes that were sent through.
// safe for concurrent use
type richpipe struct {
	// Most recently written bytes
	fifo ringbuf
	// Pipe all incoming writes to this writer
	fwd []io.WriteCloser
	l   sync.Mutex
}

// always great success responsibility for failure is here not with caller
func (p *richpipe) Write(data []byte) (int, error) {
	p.l.Lock()
	defer p.l.Unlock()
	if len(p.fwd) == 0 {
		// this is not called blocking mate
		return 0, errors.New("rich pipe: set forward pipe before writing")
	}
	var bugged []int
	for i, w := range p.fwd {
		_, err := w.Write(data)
		if err != nil {
			log.Println("Closing pipe: ", err)
			bugged = append(bugged, i)
		}
	}
	for _, x := range bugged {
		p.fwd = append(p.fwd[:x], p.fwd[x+1:]...)
	}
	// fifo last poor fifo
	p.fifo.Write(data) // and errors ignored too aww
	return len(data), nil
}

// returns the first error raised by a writer on close, if any
func (p *richpipe) Close() (err error) {
	p.l.Lock()
	defer p.l.Unlock()
	for _, w := range p.fwd {
		err2 := w.Close()
		if err2 != nil && err == nil {
			err = err2
		}
	}
	return err
}

func (p *richpipe) Last(buf []byte) int {
	p.l.Lock()
	defer p.l.Unlock()
	return p.fifo.Last(buf)
}

func (p *richpipe) AddPipe(w io.WriteCloser) {
	p.l.Lock()
	defer p.l.Unlock()
	p.fwd = append(p.fwd, w)
}

func (p *richpipe) RemovePipe(w io.WriteCloser) bool {
	p.l.Lock()
	defer p.l.Unlock()
	for i, w2 := range p.fwd {
		if w == w2 {
			p.fwd = append(p.fwd[:i], p.fwd[i+1:]...)
			return true
		}
	}
	return false
}

func (p *richpipe) Pipes() []io.WriteCloser {
	p.l.Lock()
	defer p.l.Unlock()
	return p.fwd
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
