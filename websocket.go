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
	"encoding/json"
	"errors"
	"strings"

	"github.com/hraban/lush/liblush"
)

// subscribe all websocket clients to stream data
func wseventSubscribe(s *server, options string) error {
	args := strings.Split(options, ";")
	if len(args) != 2 {
		return errors.New("subscribe requires 2 args")
	}
	idstr := args[0]
	streamname := args[1]
	id, _ := liblush.ParseCmdId(idstr)
	c := s.session.GetCommand(id)
	if c == nil {
		return errors.New("no such command: " + idstr)
	}
	var stream liblush.OutStream
	switch streamname {
	case "stdout":
		stream = c.Stdout()
	case "stderr":
		stream = c.Stderr()
	default:
		return errors.New("unknown stream: " + streamname)
	}
	// proxy stream data
	w := newPrefixedWriter(&s.ctrlclients, []byte("stream;"+idstr+";"+streamname+";"))
	// do not close websocket stream when command exits
	wc := newNopWriteCloser(w)
	stream.AddWriter(wc)
	return nil
}

func wseventNew(s *server, optionsJSON string) error {
	var options struct {
		Cmd, Name        string
		Args             []string
		StdoutScrollback int
		StderrScrollback int
	}
	err := json.Unmarshal([]byte(optionsJSON), &options)
	if err != nil {
		return err
	}
	c := s.session.NewCommand(options.Cmd, options.Args...)
	c.Stdout().AddWriter(liblush.Devnull)
	c.Stderr().AddWriter(liblush.Devnull)
	c.Stdout().ResizeScrollbackBuffer(options.StdoutScrollback)
	c.Stderr().ResizeScrollbackBuffer(options.StderrScrollback)
	c.SetName(options.Name)
	// broadcast newcmd message to all connected websocket clients
	w := newPrefixedWriter(&s.ctrlclients, []byte("newcmd;"))
	err = json.NewEncoder(w).Encode(metacmd{c}.Metadata())
	return err
}

func wseventSetpath(s *server, pathJSON string) error {
	var path []string
	err := json.Unmarshal([]byte(pathJSON), &path)
	if err != nil {
		return err
	}
	err = setPath(path)
	if err != nil {
		return err
	}
	// broadcast new path to all connected websocket clients
	_, err = s.ctrlclients.Write([]byte("path;" + pathJSON))
	return err
}

func wseventGetpath(s *server, _ string) error {
	w := newPrefixedWriter(&s.ctrlclients, []byte("path;"))
	return json.NewEncoder(w).Encode(getPath())
}

func parseAndHandleWsEvent(s *server, msg []byte) error {
	argv := strings.SplitN(string(msg), ";", 2)
	if len(argv) != 2 {
		return errors.New("parse error")
	}
	switch argv[0] {
	case "subscribe":
		// eg subscribe;3;stdout
		return wseventSubscribe(s, argv[1])
	case "new":
		// eg new;{"cmd":"echo","args":["arg1","arg2"],...}
		return wseventNew(s, argv[1])
	case "setpath":
		// eg addpath;["c:\foo\bar\bin", "c:\bin"]
		return wseventSetpath(s, argv[1])
	case "getpath":
		// eg getpath;
		return wseventGetpath(s, argv[1])
	}
	return errors.New("unknown command")
}
