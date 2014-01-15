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
	var LEN_PIPELINE int
	if testing.Short() {
		LEN_PIPELINE = 3
	} else {
		LEN_PIPELINE = 1000
	}
	cmds := make([]*cmd, LEN_PIPELINE)
	cmds[0] = newcmd(0, exec.Command("echo", "batman", ">", "superman"))
	for i := 1; i < LEN_PIPELINE; i++ {
		cmds[i] = newcmd(CmdId(i), exec.Command("cat"))
		cmds[i-1].Stdout().AddWriter(cmds[i].Stdin())
	}
	var b bytes.Buffer
	cmds[LEN_PIPELINE-1].Stdout().AddWriter(&b)
	for i, c := range cmds {
		err := c.Start()
		if err != nil {
			t.Fatalf("error starting command %s (%d): %v", c.Name(), i, err)
		}
	}
	for i, c := range cmds {
		err := c.Wait()
		if err != nil {
			t.Fatalf("error running command %s (%d): %v", c.Name(), i, err)
		}
	}
	if b.String() != "batman > superman\n" {
		t.Errorf("unexpected output from piped command: %q", b.String())
	}
}

func TestCommandNotFound(t *testing.T) {
	var c *cmd
	var err error
	c = newcmd(0, exec.Command("cecinestpasuncommand"))
	// is allowed to succeed at Start(), IF it fails at Wait()
	err = c.Start()
	if err == nil {
		err = c.Wait()
		if err == nil {
			t.Errorf("Expected error from nonexistent command .Wait()")
		}
	}
	c = newcmd(0, exec.Command("cecinestpasuncommand"))
	err = c.Run()
	if err == nil {
		t.Errorf("Expected error from nonexistent command .Run()")
	}
}
