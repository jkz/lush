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

package main

import (
	"fmt"

	"github.com/hraban/lush/liblush"
)

// wrapper type for custom extensions of a Cmd object
type metacmd struct{ liblush.Cmd }

type cmdmetadata struct {
	Id         liblush.CmdId `json:"nid"`
	HtmlId     string        `json:"htmlid"`
	Name       string        `json:"name"`
	Argv       []string      `json:"argv"`
	Status     int           `json:"status"`
	StdouttoId liblush.CmdId `json:"stdoutto,omitempty"`
	StderrtoId liblush.CmdId `json:"stderrto,omitempty"`
}

func (mc metacmd) Metadata() (data cmdmetadata) {
	data.Id = mc.Id()
	data.HtmlId = fmt.Sprint("cmd", mc.Id())
	data.Name = mc.Name()
	data.Argv = mc.Argv()
	if mc.Status().Exited() == nil {
		if mc.Status().Started() == nil {
			data.Status = 0
		} else {
			data.Status = 1
		}
	} else {
		if mc.Status().Success() {
			data.Status = 2
		} else {
			data.Status = 3
		}
	}
	return
}
