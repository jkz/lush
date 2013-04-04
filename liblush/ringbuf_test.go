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
	"bytes"
	"testing"
)

func TestRingbuf(t *testing.T) {
	r := newRingbuf(5)
	buf := []byte{0, 1, 2, 3, 4, 5, 6, 7, 8, 9}
	n, err := r.Write(buf)
	if err != nil {
		t.Fatalf("Write error: %v", err)
	}
	if n != len(buf) {
		t.Error("Unexpected write byte-count: ", n)
	}
	buf2 := make([]byte, 3)
	n = r.Last(buf2)
	buf2 = buf2[:n]
	if n != 3 {
		t.Errorf("Filled read buffer with %d bytes expected 3", n)
	}
	if !bytes.Equal(buf2, []byte{7, 8, 9}) {
		t.Error("Unexpected last bytes: ", buf2)
	}
	buf3 := []byte{10, 11, 12}
	n, err = r.Write(buf3)
	if err != nil {
		t.Fatalf("Write error: %v", err)
	}
	if n != len(buf3) {
		t.Error("Unexpected write byte-count: ", n)
	}
	buf4 := make([]byte, 20)
	n = r.Last(buf4)
	buf4 = buf4[:n]
	if n != 5 {
		t.Errorf("Filled read buffer with %d bytes expected 5", n)
	}
	if !bytes.Equal(buf4, []byte{8, 9, 10, 11, 12}) {
		t.Error("Unexpected last bytes: ", buf4)
	}
	if r.seen != 13 {
		t.Error("Saw 13 bytes, recorded ", r.seen)
	}
}
