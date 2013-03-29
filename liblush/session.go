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
	"os/exec"
	"sync/atomic"
)

type session struct {
	lastid int64
	cmds   map[CmdId]*cmd
}

func (s *session) newid() CmdId {
	return CmdId(atomic.AddInt64(&s.lastid, 1))
}

// Start a new command in this shell session. Returned object is not threadsafe
func (s *session) NewCommand(name string, arg ...string) Cmd {
	c := &cmd{
		id:      s.newid(),
		execCmd: exec.Command(name, arg...),
	}
	s.cmds[c.id] = c
	return c
}

func (s *session) GetCommand(id CmdId) Cmd {
	if c, ok := s.cmds[id]; ok {
		return c
	}
	return nil
}

func (s *session) GetCommandIds() []CmdId {
	ids := make([]CmdId, len(s.cmds))
	i := 0
	for id := range s.cmds {
		ids[i] = id
		i++
	}
	return ids
}

func NewSession() Session {
	return &session{
		cmds: map[CmdId]*cmd{},
	}
}
