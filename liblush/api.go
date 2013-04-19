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
	"time"
)

type CmdStatus interface {
	// Time the command was started or nil if not started yet
	Started() *time.Time
	// When the command stopped, nil if still running / not started
	Exited() *time.Time
	Success() bool
	// nil iff Success() == true
	Err() error
}

// Output stream of a command
type OutStream interface {
	// Send all output to this writer. Multiple writers can be hooked up and
	// unloaded at any time. If this writer's Write returns an error it is
	// removed from the list without affecting anything else.  Output is
	// blocked if no pipes are configured.
	AddPipe(w io.WriteCloser)
	// Remove a pipe previously set with AddPipe. Returns false if not set.
	RemovePipe(w io.WriteCloser) bool
	// sinks set with SetPipe
	Pipes() []io.WriteCloser
	Last(p []byte) int
	ResizeScrollbackBuffer(n int)
}

// Input stream of a command.  Writes to this stream block until the command is
// started and fail if it has exited
type InStream interface {
	io.WriteCloser
	// Command this stream belongs to (never nil)
	Cmd() Cmd
}

// A shell command state similar to os/exec.Cmd
type Cmd interface {
	Id() CmdId
	// if SetName has been called return that otherwise best effort
	Name() string
	SetName(string)
	Argv() []string
	// Run command and wait for it to exit
	Run() error
	// Start the command in the background. Follow by Wait() to get exit status
	Start() error
	// Block until command is complete return exit status
	Wait() error
	Stdin() InStream
	Stdout() OutStream
	Stderr() OutStream
	Status() CmdStatus
}

type Session interface {
	Chdir(dir string) error
	NewCommand(name string, arg ...string) Cmd
	GetCommand(id CmdId) Cmd
	GetCommandIds() []CmdId
}
