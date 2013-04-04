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
	"sync"
)

// Circular fifo buffer.
type ringbuf interface {
	Size() int
	// Fill this buffer with the most recently written bytes
	Last(p []byte) int
	Write(data []byte) (int, error)
}

type ringbuf_unsafe struct {
	buf []byte
	// Oldest byte in the buffer (write starts here)
	head int
	// processed bytes
	seen int
}

func imin(i int, rest ...int) int {
	if len(rest) == 0 {
		return i
	}
	j := rest[0]
	if j < i {
		i = j
	}
	return imin(i, rest[1:]...)
}

func (r *ringbuf_unsafe) Size() int {
	return len(r.buf)
}

// Fill p with most recently written bytes. Returns number of bytes written to
// p.
func (r *ringbuf_unsafe) Last(p []byte) (n int) {
	// dont ask for more than what i got
	want := imin(len(p), len(r.buf), r.seen)
	// actual copying
	// easiest scenario 1 step
	if want <= r.head {
		n = copy(p, r.buf[r.head-want:r.head])
		return
	}
	// otherwise 2 steps (here is first part)
	n = copy(p, r.buf[len(r.buf)-(want-r.head):])
	// append the rest
	n += copy(p[n:], r.buf[:r.head])
	if n != want {
		panic("unexpected copy length")
	}
	return
}

// Never fails, always returns the number of bytes read from input. If that is
// more than the size of the buffer only the last n bytes are actually kept in
// memory.
func (r *ringbuf_unsafe) Write(p []byte) (n int, err error) {
	n = len(p)
	defer func() {
		if err == nil {
			r.seen += n
		}
	}()
	overflow := len(p) - len(r.buf)
	if overflow > 0 {
		// only care about last bytes anyway
		p = p[overflow:]
	}
	// size of first free data block
	part1 := len(r.buf) - r.head
	// first option: theres enough space left to copy in 1 block
	if len(p) <= part1 {
		r.head += copy(r.buf[r.head:], p)
		return
	}
	// last resort: split my buf in 2 pieces
	copy(r.buf[r.head:], p[:part1])
	r.head = copy(r.buf[:r.head], p[part1:])
	return
}

type ringbuf_safe struct {
	ringbuf_unsafe
	l sync.Mutex
}

func (rs *ringbuf_safe) Size() int {
	rs.l.Lock()
	defer rs.l.Unlock()
	return rs.ringbuf_unsafe.Size()
}

func (rs *ringbuf_safe) Last(p []byte) int {
	rs.l.Lock()
	defer rs.l.Unlock()
	return rs.ringbuf_unsafe.Last(p)
}

func (rs *ringbuf_safe) Write(data []byte) (int, error) {
	rs.l.Lock()
	defer rs.l.Unlock()
	return rs.ringbuf_unsafe.Write(data)
}

func newRingbuf(size int) ringbuf {
	var rs ringbuf_safe
	rs.ringbuf_unsafe.buf = make([]byte, size)
	return &rs
}
