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
	// Send all output to this writer. Output is blocked until this method is
	// called.
	PipeTo(w io.Writer)
	Last(p []byte) int
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
	// the command. If this method is not called the stdin can be controlled
	// explicitly using the other stdin related methods.
	SetStdin(r io.Reader)
	Stdout() OutStream
	Stderr() OutStream
	Status() CmdStatus
	// Send bytes to stdin. Does NOT send EOF to stdin to allow multiple calls.
	// Dont call if a stdin reader was set using SetStdin.
	SendToStdin(data []byte) (n int64, err error)
	// Same as SendToStdin but reads from reader to satisfy io.ReaderFrom
	ReadFrom(r io.Reader) (n int64, err error)
	// Send EOF to stdin. Dont call if a stdin reader was set using SetStdin.
	// After calling this do not send any data to stdin (and dont close again).
	CloseStdin() error
}

type Session interface {
	NewCommand(name string, arg ...string) Cmd
	GetCommand(id CmdId) Cmd
	GetCommandIds() []CmdId
}
