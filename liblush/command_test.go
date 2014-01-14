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

// If this function returns the environment is safe for use in testing (i.e. it
// contains echo executable in PATH)
func checkTestEnvironment(t *testing.T) {
	c := exec.Command("echo", "superman", "<", "batman")
	out, err := c.CombinedOutput()
	if err != nil {
		t.Fatalf("Couldn't run echo binary: %v", err)
	}
	if !bytes.Equal(out, []byte("superman < batman\n")) {
		t.Fatalf("echo binary produced unexpected output: %s", out)
	}
}

func TestCommand(t *testing.T) {
	checkTestEnvironment(t)
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
