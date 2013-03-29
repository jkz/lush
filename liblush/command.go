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
	"fmt"
	"io"
	"os/exec"
)

// Guaranteed to be unique for every command at one specific point in time but
// once a command is cleaned up another may reuse his id.
type CmdId int64

func ParseCmdId(idstr string) (CmdId, error) {
	var i int64
	_, err := fmt.Sscan(idstr, &i)
	return CmdId(i), err
}

type cmd struct {
	id      CmdId
	execCmd *exec.Cmd
	status  CmdStatus
}

func (c *cmd) Id() CmdId {
	return c.id
}

func (c *cmd) Name() string {
	return c.execCmd.Path
}

func (c *cmd) Argv() []string {
	return c.execCmd.Args
}

func (c *cmd) Run() error {
	err := c.execCmd.Run()
	if err != nil {
		return err
	}
	c.status = Done
	return nil
}

func (c *cmd) Start() error {
	err := c.execCmd.Start()
	if err != nil {
		return err
	}
	c.status = Running
	return nil
}

func (c *cmd) Wait() error {
	return c.execCmd.Wait()
}

func (c *cmd) SetStdin(r io.Reader) {
	c.execCmd.Stdin = r
}

func (c *cmd) SetStdout(w io.Writer) {
	c.execCmd.Stdout = w
}

func (c *cmd) SetStderr(w io.Writer) {
	c.execCmd.Stderr = w
}

func (c *cmd) Status() CmdStatus {
	return c.status
}

func (s CmdStatus) Started() bool {
	return s > Preparation
}

func (s CmdStatus) Finished() bool {
	return s > Running
}
