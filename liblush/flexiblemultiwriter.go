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

// slightly tweaked io.MultiWriter: if an underlying writer fails it is removed
// and no error is returned. writers can be added and removed on the fly. if
// zero writers are configured Write() calls to this object block.
type FlexibleMultiWriter struct {
	fwd []io.Writer
	l   sync.Mutex
}

// always great success responsibility for failure is here not with caller
func (mw *FlexibleMultiWriter) Write(data []byte) (int, error) {
	mw.l.Lock()
	defer mw.l.Unlock()
	if len(mw.fwd) == 0 {
		// this is not called blocking mate
		return 0, errors.New("FlexibleMultiWriter: set forward pipe before writing")
	}
	var bugged []int
	for i, w := range mw.fwd {
		_, err := w.Write(data)
		if err != nil {
			log.Print("Closing pipe: ", err)
			bugged = append(bugged, i)
		}
	}
	for i, x := range bugged {
		mw.fwd = append(mw.fwd[:x-i], mw.fwd[x-i+1:]...)
	}
	return len(data), nil
}

func (mw *FlexibleMultiWriter) AddWriter(w io.Writer) {
	mw.l.Lock()
	defer mw.l.Unlock()
	mw.fwd = append(mw.fwd, w)
}

func (mw *FlexibleMultiWriter) RemoveWriter(w io.Writer) bool {
	mw.l.Lock()
	defer mw.l.Unlock()
	for i, w2 := range mw.fwd {
		if w == w2 {
			mw.fwd = append(mw.fwd[:i], mw.fwd[i+1:]...)
			return true
		}
	}
	return false
}

func (mw *FlexibleMultiWriter) Writers() []io.Writer {
	mw.l.Lock()
	defer mw.l.Unlock()
	return mw.fwd
}
