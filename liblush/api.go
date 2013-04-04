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

// Library functions and definitions for lush
package liblush

// This file defines only the interfaces

import (
	"io"
)

type CmdStatus interface {
	Started() bool
	Exited() bool
	Success() bool
	// nil iff Success() == true
	Err() error
}

// A shell command state similar to os/exec.Cmd
type Cmd interface {
	Id() CmdId
	Name() string
	Argv() []string
	// Run command and wait for it to exit
	Run() error
	// Start the command in the background. Follow by Wait() to get exit status
	Start() error
	// Block until command is complete return exit status
	Wait() error
	// Connect the stdin to this reader. Do not call this method after starting
	// the command. If this method is not called the command is started with an
	// empty stream bound to stdin.
	SetStdin(r io.Reader)
	// Connect the stdout to this writer.
	SetStdout(w io.Writer)
	// Connect the stderr to this writer.
	SetStderr(w io.Writer)
	Status() CmdStatus
	// Last n bytes of stdout. Returns the number of bytes written to the start
	// of p.
	LastStdout(p []byte) int
	LastStderr(p []byte) int
	// Control the number of most recent stdout bytes to remember (also used
	// for stderr)
	SetFifoSize(bytes int)
}

type Session interface {
	NewCommand(name string, arg ...string) Cmd
	GetCommand(id CmdId) Cmd
	GetCommandIds() []CmdId
}
