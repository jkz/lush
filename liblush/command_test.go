// Copyright © 2014 Hraban Luyat <hraban@0brg.net>
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
	"os/exec"
	"testing"
)

func TestCommandOutput(t *testing.T) {
	execcmd := exec.Command("echo", "poeh", "poeh", "nou", "nou")
	c := newcmd(1, execcmd)
	var b bytes.Buffer
	c.Stdout().AddWriter(&b)
	err := c.Run()
	if err != nil {
		t.Fatalf("error running command: %v", err)
	}
	if !c.Status().Success() {
		t.Errorf("unexpected status: %#v", c.Status())
	}
	if b.String() != "poeh poeh nou nou\n" {
		t.Errorf("unexpected output from command: %q", b.String())
	}
}

func TestCommandPipe(t *testing.T) {
	echoc := newcmd(1, exec.Command("echo", "batman", ">", "superman"))
	catc := newcmd(2, exec.Command("cat"))
	var b bytes.Buffer
	echoc.Stdout().AddWriter(catc.Stdin())
	catc.Stdout().AddWriter(&b)
	func(cmds ...*cmd) {
		for _, c := range cmds {
			err := c.Start()
			if err != nil {
				t.Fatalf("error starting command %s: %v", c.Name(), err)
			}
		}
		for _, c := range cmds {
			err := c.Wait()
			if err != nil {
				t.Fatalf("error running command %s: %v", c.Name(), err)
			}
		}
	}(echoc, catc)
	if b.String() != "batman > superman\n" {
		t.Errorf("unexpected output from piped command: %q", b.String())
	}
}
