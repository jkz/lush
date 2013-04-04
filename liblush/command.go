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
	"errors"
	"fmt"
	"io"
	"os/exec"
	"sync"
	"time"
)

type cmdstatus struct {
	started *time.Time
	exited  *time.Time
	err     error
}

// command life-time phases
const (
	preparation = iota
	running
	done
)

func (s cmdstatus) Started() *time.Time {
	return s.started
}

func (s cmdstatus) Exited() *time.Time {
	return s.exited
}

func (s cmdstatus) Success() bool {
	return s.err == nil
}

func (s cmdstatus) Err() error {
	return s.err
}

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
	status  cmdstatus
	// Released when command finishes
	done sync.WaitGroup
	// last n bytes of stdout and stderr
	fifoout ringbuf
	fifoerr ringbuf
	inpipe  io.WriteCloser
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
	defer func() {
		now := time.Now()
		c.status.exited = &now
		c.done.Done()
	}()
	if c.execCmd.Stdin == nil {
		var err error
		c.inpipe, err = c.execCmd.StdinPipe()
		if err != nil {
			return err
		}
	}
	if c.execCmd.Stdout == nil {
		c.execCmd.Stdout = c.fifoout
	} else {
		c.execCmd.Stdout = io.MultiWriter(c.execCmd.Stdout, c.fifoout)
	}
	if c.execCmd.Stderr == nil {
		c.execCmd.Stderr = c.fifoerr
	} else {
		c.execCmd.Stderr = io.MultiWriter(c.execCmd.Stderr, c.fifoerr)
	}
	now := time.Now()
	c.status.started = &now
	c.status.err = c.execCmd.Run()
	return c.status.err
}

func (c *cmd) Start() error {
	go c.Run()
	return nil
}

func (c *cmd) Wait() error {
	c.done.Wait()
	return c.status.err
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

func (c *cmd) LastStdout(p []byte) int {
	return c.fifoout.Last(p)
}

func (c *cmd) LastStderr(p []byte) int {
	return c.fifoerr.Last(p)
}

// Create new ringbuffer and copy the old data over. Not a pretty nor an
// efficient implementation but it gets the job done.
func resize(r ringbuf, i int) ringbuf {
	r2 := newRingbuf(i)
	buf := make([]byte, r.Size())
	// Useful bytes
	n := r2.Last(buf)
	buf = buf[:n]
	r2.Write(buf)
	return r2
}

func (c *cmd) SetFifoSize(bytes int) {
	c.fifoout = resize(c.fifoout, bytes)
	c.fifoerr = resize(c.fifoerr, bytes)
}

func (c *cmd) SendToStdin(data []byte) (n int64, err error) {
	return c.ReadFrom(bytes.NewReader(data))
}

func (c *cmd) ReadFrom(r io.Reader) (n int64, err error) {
	if c.inpipe == nil {
		return 0, errors.New("cannot send stdin data: stdin reader already set")
	}
	return io.Copy(c.inpipe, r)
}

func (c *cmd) CloseStdin() error {
	if c.inpipe == nil {
		return errors.New("cannot close stdin after SetStdin")
	}
	return c.inpipe.Close()
}

func newcmd(id CmdId, execcmd *exec.Cmd) *cmd {
	c := &cmd{
		id:      id,
		execCmd: execcmd,
		fifoout: newRingbuf(1000),
		fifoerr: newRingbuf(1000),
	}
	return c
}
