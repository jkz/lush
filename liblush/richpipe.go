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
)

type richpipe struct {
	// Most recently written bytes
	fifo ringbuf
	// Pipe all incoming writes to this writer
	fwd io.WriteCloser
}

func (p *richpipe) Write(data []byte) (int, error) {
	if p.fwd == nil {
		return 0, errors.New("rich pipe: set forward pipe before writing")
	}
	n, err := p.fwd.Write(data)
	if n > 0 {
		p.fifo.Write(data[:n])
	}
	return n, err
}

func (p *richpipe) Close() error {
	return p.fwd.Close()
}

func (p *richpipe) Last(buf []byte) int {
	return p.fifo.Last(buf)
}

func (p *richpipe) SetPipe(w io.WriteCloser) {
	p.fwd = w
}

func (p *richpipe) Pipe() io.WriteCloser {
	return p.fwd
}

func newRichPipe(fifosize int) *richpipe {
	return &richpipe{
		fifo: newRingbuf(fifosize),
	}
}
